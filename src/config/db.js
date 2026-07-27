// src/config/db.js
// Rôle : point d'entrée UNIQUE d'accès à PostgreSQL.
// Pourquoi : un pool partagé + deux helpers (query, transaction) évitent
// que chaque controller/service réinvente sa propre gestion de connexion,
// et garantissent qu'aucune requête SQL ne soit construite par concaténation.
const { Pool } = require('pg');
const env = require('./env');
const logger = require('./logger');

const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.name,
  user: env.db.user,
  password: env.db.password,
  max: 10,                     // nombre max de connexions simultanées dans le pool
  idleTimeoutMillis: 30000,     // ferme les connexions inactives après 30s
  connectionTimeoutMillis: 5000, // échoue proprement après 5s si PostgreSQL ne répond pas
});

// Log des erreurs inattendues sur des connexions IDLE du pool
// (ex. : PostgreSQL redémarre pendant que l'app tourne).
pool.on('error', (err) => {
  logger.error(`[db] Erreur inattendue sur une connexion du pool PostgreSQL : ${err.message}`);
});

/**
 * query(texte, parametres)
 * Exécute une requête simple avec des paramètres positionnels ($1, $2...).
 * JAMAIS de concaténation de chaînes dans les appels à cette fonction.
 *
 * @param {string} texte - requête SQL avec $1, $2...
 * @param {Array} parametres - valeurs correspondantes
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(texte, parametres = []) {
  const debut = Date.now();
  try{
        const resultat = await pool.query(texte, parametres);
        const duree = Date.now() - debut;
        logger.debug(`[db] ${duree}ms — ${texte.slice(0, 80)}`);
        return resultat;
  } catch (erreur) {
    logger.error(`[db] Échec requête : ${texte.slice(0, 80)} — ${erreur.message}`);
    throw erreur; // propagé au controller, qui décide du code HTTP (voir Phase 18)
  }
}

/**
 * transaction(callback)
 * Exécute plusieurs requêtes de façon atomique. Le callback reçoit un client
 * dédié (PAS le pool) et doit l'utiliser pour toutes ses requêtes internes.
 * BEGIN → callback → COMMIT si succès, ROLLBACK si erreur.
 * Le client est TOUJOURS libéré (finally), même en cas d'exception.
 *
 * Exemple d'usage (utilisé dès la Phase 16 pour les factures) :
 *   await transaction(async (client) => {
 *     await client.query('INSERT INTO factures ...', [...]);
 *     await client.query('UPDATE clients ...', [...]);
 *   });
 *
 * @param {(client: import('pg').PoolClient) => Promise<any>} callback
 * @returns {Promise<any>} - la valeur retournée par le callback
 */
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultat = await callback(client);
    await client.query('COMMIT');
    return resultat;
  } catch (erreur) {
    await client.query('ROLLBACK');
    throw erreur;
  } finally {
    client.release(); // CRITIQUE : sans ce release, le pool finit par se vider
  }
}

/**
 * verifierConnexion()
 * Test de connectivité au démarrage du serveur (appelé dans server.js).
 * Ne fait PAS planter le process — retourne un booléen, laisse server.js décider.
 */
async function verifierConnexion() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (erreur) {
    logger.error(`[db] Impossible de se connecter à PostgreSQL : ${erreur.message}`);
    return false;
  }
}

module.exports = { pool, query, transaction, verifierConnexion };
