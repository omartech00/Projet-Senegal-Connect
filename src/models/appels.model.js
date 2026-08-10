// src/models/appels.model.js
// Rôle : requêtes SQL sur la table appels. Aucune règle métier ici
// (autorisation, déduction du destinataire) — tout vit dans le service.

const { query } = require('../config/db');

async function creer({ ticket_id, initiateur_id, destinataire_id, type }) {
  const resultat = await query(
    `INSERT INTO appels (ticket_id, initiateur_id, destinataire_id, type)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [ticket_id, initiateur_id, destinataire_id, type]
  );
  return resultat.rows[0];
}

async function trouverParId(id) {
  const resultat = await query('SELECT * FROM appels WHERE id = $1', [id]);
  return resultat.rows[0] || null;
}

async function mettreAJourStatut(id, statut) {
  const resultat = await query(
    `UPDATE appels SET statut = $1 WHERE id = $2 RETURNING *`,
    [statut, id]
  );
  return resultat.rows[0] || null;
}

async function refuser(id) {
  const resultat = await query(
    `UPDATE appels SET statut = 'refuse', fin_le = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  return resultat.rows[0] || null;
}

/**
 * Termine l'appel et calcule duree_secondes CÔTÉ SQL (EXTRACT EPOCH),
 * jamais côté Node — évite toute dérive d'horloge process vs BDD.
 */
async function terminer(id) {
  const resultat = await query(
    `UPDATE appels
     SET statut = 'termine',
         fin_le = NOW(),
         duree_secondes = EXTRACT(EPOCH FROM (NOW() - debut_le))::int
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return resultat.rows[0] || null;
}

async function listerParTicket(ticketId) {
  const resultat = await query(
    `SELECT a.*, i.nom AS initiateur_nom, d.nom AS destinataire_nom
     FROM appels a
     JOIN utilisateurs i ON i.id = a.initiateur_id
     JOIN utilisateurs d ON d.id = a.destinataire_id
     WHERE a.ticket_id = $1
     ORDER BY a.debut_le DESC`,
    [ticketId]
  );
  return resultat.rows;
}

module.exports = { creer, trouverParId, mettreAJourStatut, refuser, terminer, listerParTicket };
