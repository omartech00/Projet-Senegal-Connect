// src/models/reactions.model.js
// Rôle : requêtes SQL sur la table reactions (PK composite message_id
// + utilisateur_id + emoji, Phase 7). Aucune règle métier ici — le
// toggle (ajouter vs retirer) est décidé par le service, pas ici.

const { query } = require('../config/db');

async function existe(messageId, utilisateurId, emoji) {
  const resultat = await query(
    'SELECT 1 FROM reactions WHERE message_id = $1 AND utilisateur_id = $2 AND emoji = $3',
    [messageId, utilisateurId, emoji]
  );
  return resultat.rowCount > 0;
}

async function ajouter(messageId, utilisateurId, emoji) {
  await query(
    'INSERT INTO reactions (message_id, utilisateur_id, emoji) VALUES ($1, $2, $3)',
    [messageId, utilisateurId, emoji]
  );
}

async function retirer(messageId, utilisateurId, emoji) {
  await query(
    'DELETE FROM reactions WHERE message_id = $1 AND utilisateur_id = $2 AND emoji = $3',
    [messageId, utilisateurId, emoji]
  );
}

/**
 * Compteurs agrégés par emoji pour un message — c'est CETTE forme
 * qui est diffusée aux clients (pas l'événement brut d'un seul toggle),
 * pour que l'affichage reste toujours cohérent même si un client a
 * manqué un événement socket intermédiaire.
 */
async function listerParMessage(messageId) {
  const resultat = await query(
    `SELECT emoji, COUNT(*) AS total
     FROM reactions
     WHERE message_id = $1
     GROUP BY emoji
     ORDER BY emoji`,
    [messageId]
  );
  return resultat.rows.map((r) => ({ emoji: r.emoji, total: parseInt(r.total, 10) }));
}

module.exports = { existe, ajouter, retirer, listerParMessage };
