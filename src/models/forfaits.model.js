// src/models/forfaits.model.js
// Rôle : requêtes SQL sur la table forfaits.
// trouverParId() implémenté dès la Phase 13 (nécessaire à la
// validation forfait_id lors du CRUD Clients). Le reste (liste avec
// nb_clients, création, modification, suppression protégée) est
// complété en Phase 14 — ne pas s'inquiéter du fichier incomplet
// jusque-là.

const { query } = require('../config/db');

async function trouverParId(id) {
  const resultat = await query('SELECT * FROM forfaits WHERE id = $1', [id]);
  return resultat.rows[0] || null;
}

module.exports = { trouverParId };
