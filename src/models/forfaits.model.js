// src/models/forfaits.model.js
// Rôle : requêtes SQL sur la table forfaits, avec comptage des
// clients abonnés (COUNT via JOIN, jamais de requête N+1).
// trouverParId() existait déjà depuis la Phase 13 — conservé
// identique ici pour ne rien casser dans clients.model.js.

const { query } = require('../config/db');

async function trouverParId(id) {
  const resultat = await query('SELECT * FROM forfaits WHERE id = $1', [id]);
  return resultat.rows[0] || null;
}

/**
 * Liste des forfaits ACTIFS uniquement (exigence explicite du PDF),
 * avec nb_clients = nombre total de clients liés (tous statuts confondus).
 */
async function listerActifs() {
  const resultat = await query(
    `SELECT
       f.*,
       COUNT(c.id) AS nb_clients
     FROM forfaits f
     LEFT JOIN clients c ON c.forfait_id = f.id
     WHERE f.actif = true
     GROUP BY f.id
     ORDER BY f.prix_mensuel_fcfa ASC`
  );
  return resultat.rows.map((f) => ({ ...f, nb_clients: parseInt(f.nb_clients, 10) }));
}

async function compterClientsAbonnes(forfaitId, { statutActifSeulement = false } = {}) {
  const conditions = ['forfait_id = $1'];
  const parametres = [forfaitId];
  if (statutActifSeulement) {
    conditions.push(`statut = 'actif'`);
  }
  const resultat = await query(
    `SELECT COUNT(*) AS total FROM clients WHERE ${conditions.join(' AND ')}`,
    parametres
  );
  return parseInt(resultat.rows[0].total, 10);
}

async function listerClientsAbonnes(forfaitId, { page, limite }) {
  const offset = (page - 1) * limite;
  const resultat = await query(
    `SELECT c.id, c.msisdn, c.statut, u.nom, u.prenom, u.email
     FROM clients c
     JOIN utilisateurs u ON u.id = c.utilisateur_id
     WHERE c.forfait_id = $1
     ORDER BY c.id DESC
     LIMIT $2 OFFSET $3`,
    [forfaitId, limite, offset]
  );
  return resultat.rows;
}

async function creer({ nom, quota_data_go, quota_voix_min, prix_mensuel_fcfa, actif }) {
  const resultat = await query(
    `INSERT INTO forfaits (nom, quota_data_go, quota_voix_min, prix_mensuel_fcfa, actif)
     VALUES ($1, $2, $3, $4, COALESCE($5, true))
     RETURNING *`,
    [nom, quota_data_go, quota_voix_min, prix_mensuel_fcfa, actif]
  );
  return resultat.rows[0];
}

async function mettreAJour(id, { nom, quota_data_go, quota_voix_min, prix_mensuel_fcfa, actif }) {
  const resultat = await query(
    `UPDATE forfaits
     SET nom = $1, quota_data_go = $2, quota_voix_min = $3, prix_mensuel_fcfa = $4, actif = $5
     WHERE id = $6
     RETURNING *`,
    [nom, quota_data_go, quota_voix_min, prix_mensuel_fcfa, actif, id]
  );
  return resultat.rows[0] || null;
}

async function supprimer(id) {
  await query('DELETE FROM forfaits WHERE id = $1', [id]);
}

module.exports = {
  trouverParId,
  listerActifs,
  compterClientsAbonnes,
  listerClientsAbonnes,
  creer,
  mettreAJour,
  supprimer,
};
