// src/models/tickets.model.js
// Rôle : requêtes SQL sur tickets, jointes à clients/utilisateurs
// pour les infos client et agent. Aucune règle métier ici — la
// machine à états et les autorisations vivent dans le service.

const { query } = require('../config/db');

const SELECT_DETAIL = `
  SELECT
    t.*,
    cu.nom AS client_nom, cu.prenom AS client_prenom,
    c.msisdn AS client_msisdn, c.utilisateur_id AS client_utilisateur_id,
    au.nom AS agent_nom, au.prenom AS agent_prenom
  FROM tickets t
  JOIN clients c ON c.id = t.client_id
  JOIN utilisateurs cu ON cu.id = c.utilisateur_id
  LEFT JOIN utilisateurs au ON au.id = t.agent_id
`;

async function trouverParId(id) {
  const resultat = await query(`${SELECT_DETAIL} WHERE t.id = $1`, [id]);
  return resultat.rows[0] || null;
}

/**
 * Liste filtrée selon le rôle de l'utilisateur connecté (règle
 * appliquée par le service, ce model se contente d'exécuter le
 * filtre déjà décidé).
 */
async function listerPourClient(clientId) {
  const resultat = await query(
    `${SELECT_DETAIL} WHERE t.client_id = $1 ORDER BY t.ouvert_le DESC`,
    [clientId]
  );
  return resultat.rows;
}

async function listerPourAgent(agentId) {
  const resultat = await query(
    `${SELECT_DETAIL} WHERE t.agent_id = $1 OR (t.agent_id IS NULL AND t.statut = 'ouvert')
     ORDER BY t.ouvert_le DESC`,
    [agentId]
  );
  return resultat.rows;
}

async function listerTous() {
  const resultat = await query(`${SELECT_DETAIL} ORDER BY t.ouvert_le DESC`);
  return resultat.rows;
}

async function creer({ client_id, sujet }) {
  const resultat = await query(
    `INSERT INTO tickets (client_id, sujet) VALUES ($1, $2) RETURNING *`,
    [client_id, sujet]
  );
  return resultat.rows[0];
}
async function assigner(id, agentId) {
  const resultat = await query(
    `UPDATE tickets SET agent_id = $1, statut = 'en_cours' WHERE id = $2 RETURNING *`,
    [agentId, id]
  );
  return resultat.rows[0] || null;
}
async function fermer(id) {
  const resultat = await query(
    `UPDATE tickets SET statut = 'ferme', ferme_le = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  return resultat.rows[0] || null;
}
module.exports = {
  trouverParId,
  listerPourClient,
  listerPourAgent,
  listerTous,
  creer,
  assigner,
  fermer,
};
