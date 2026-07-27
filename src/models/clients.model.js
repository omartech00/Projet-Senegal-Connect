// src/models/clients.model.js
// Rôle : requêtes SQL sur clients, jointes à utilisateurs (nom/prenom/
// email) et forfaits (infos forfait). Aucune règle métier ici — la
// vérification "factures impayées" est une requête neutre (le service
// décide ce qu'elle implique).

const { query } = require('../config/db');

const SELECT_BASE = `
  SELECT
    c.id, c.utilisateur_id, c.msisdn, c.forfait_id, c.statut, c.date_inscription,
    u.nom, u.prenom, u.email,
    f.nom AS forfait_nom, f.prix_mensuel_fcfa AS forfait_prix_fcfa
  FROM clients c
  JOIN utilisateurs u ON u.id = c.utilisateur_id
  LEFT JOIN forfaits f ON f.id = c.forfait_id
`;

/**
 * Construit dynamiquement WHERE + tableau de paramètres, sans jamais
 * concaténer de valeur utilisateur dans la chaîne SQL.
 */
function construireFiltres({ q, forfait_id, statut }) {
  const conditions = [];
  const parametres = [];

  if (q) {
    parametres.push(`%${q}%`);
    const idx = parametres.length;
    conditions.push(
      `(u.nom ILIKE $${idx} OR u.prenom ILIKE $${idx} OR c.msisdn ILIKE $${idx} OR u.email ILIKE $${idx})`
    );
  }
  if (forfait_id) {
    parametres.push(forfait_id);
    conditions.push(`c.forfait_id = $${parametres.length}`);
  }
  if (statut) {
    parametres.push(statut);
    conditions.push(`c.statut = $${parametres.length}`);
  }

  const clauseWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { clauseWhere, parametres };
}

async function compter(filtres) {
  const { clauseWhere, parametres } = construireFiltres(filtres);
  const resultat = await query(
    `SELECT COUNT(*) AS total FROM clients c JOIN utilisateurs u ON u.id = c.utilisateur_id ${clauseWhere}`,
    parametres
  );
  return parseInt(resultat.rows[0].total, 10);
}

async function lister(filtres, { page, limite }) {
  const { clauseWhere, parametres } = construireFiltres(filtres);
  const offset = (page - 1) * limite;
  parametres.push(limite, offset);

  const resultat = await query(
    `${SELECT_BASE} ${clauseWhere} ORDER BY c.id DESC LIMIT $${parametres.length - 1} OFFSET $${parametres.length}`,
    parametres
  );
  return resultat.rows;
}

async function trouverParId(id) {
  const resultat = await query(`${SELECT_BASE} WHERE c.id = $1`, [id]);
  return resultat.rows[0] || null;
}

async function trouverParUtilisateurId(utilisateurId) {
  const resultat = await query('SELECT * FROM clients WHERE utilisateur_id = $1', [utilisateurId]);
  return resultat.rows[0] || null;
}

async function trouverDerniereFacture(clientId) {
  const resultat = await query(
    `SELECT id, reference, periode, montant_fcfa, statut, date_emission, date_echeance
     FROM factures WHERE client_id = $1 ORDER BY date_emission DESC LIMIT 1`,
    [clientId]
  );
  return resultat.rows[0] || null;
}

async function trouverTicketEnCours(clientId) {
  const resultat = await query(
    `SELECT id, sujet, statut, ouvert_le FROM tickets
     WHERE client_id = $1 AND statut = 'en_cours' ORDER BY ouvert_le DESC LIMIT 1`,
    [clientId]
  );
  return resultat.rows[0] || null;
}

async function aFacturesImpayees(clientId) {
  const resultat = await query(
    `SELECT EXISTS (
       SELECT 1 FROM factures WHERE client_id = $1 AND statut IN ('impayee', 'en_retard')
     ) AS existe`,
    [clientId]
  );
  return resultat.rows[0].existe;
}

async function creer({ utilisateur_id, msisdn, forfait_id, statut }) {
  const resultat = await query(
    `INSERT INTO clients (utilisateur_id, msisdn, forfait_id, statut)
     VALUES ($1, $2, $3, COALESCE($4, 'actif'))
     RETURNING *`,
    [utilisateur_id, msisdn, forfait_id || null, statut || null]
  );
  return resultat.rows[0];
}

async function mettreAJour(id, { msisdn, forfait_id }) {
  const resultat = await query(
    `UPDATE clients SET msisdn = $1, forfait_id = $2 WHERE id = $3 RETURNING *`,
    [msisdn, forfait_id || null, id]
  );
  return resultat.rows[0] || null;
}

async function mettreAJourStatut(id, statut) {
  const resultat = await query(
    `UPDATE clients SET statut = $1 WHERE id = $2 RETURNING *`,
    [statut, id]
  );
  return resultat.rows[0] || null;
}

async function supprimer(id) {
  await query('DELETE FROM clients WHERE id = $1', [id]);
}

module.exports = {
  compter,
  lister,
  trouverParId,
  trouverParUtilisateurId,
  trouverDerniereFacture,
  trouverTicketEnCours,
  aFacturesImpayees,
  creer,
  mettreAJour,
  mettreAJourStatut,
  supprimer,
};