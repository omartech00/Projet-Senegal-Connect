// src/models/messages.model.js
// Rôle : requêtes SQL sur messages et messages_statut. Aucune règle
// métier ici (autorisation, escapeHtml) — tout ça vit dans le service.

const { query } = require('../config/db');

async function creer({ ticket_id, expediteur_id, type, contenu, fichier_url = null, fichier_nom = null, fichier_taille = null }) {
  const resultat = await query(
    `INSERT INTO messages (ticket_id, expediteur_id, type, contenu, fichier_url, fichier_nom, fichier_taille)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [ticket_id, expediteur_id, type, contenu, fichier_url, fichier_nom, fichier_taille]
  );
  return resultat.rows[0];
}

async function trouverParId(id) {
  const resultat = await query(
    `SELECT m.*, u.nom AS expediteur_nom, u.prenom AS expediteur_prenom, u.role AS expediteur_role
     FROM messages m JOIN utilisateurs u ON u.id = m.expediteur_id
     WHERE m.id = $1`,
    [id]
  );
  return resultat.rows[0] || null;
}

/**
 * Historique paginé par curseur temporel. Sans `avant`, renvoie les
 * 50 messages les plus récents ; avec `avant`, renvoie les 50
 * précédant strictement ce timestamp (chargement "vers le haut").
 */
async function listerHistorique(ticketId, { avant, limite = 50 }) {
  const conditions = ['m.ticket_id = $1'];
  const parametres = [ticketId];

  if (avant) {
    parametres.push(avant);
    conditions.push(`m.envoye_le < $${parametres.length}`);
  }

  parametres.push(limite);

  const resultat = await query(
    `SELECT m.*, u.nom AS expediteur_nom, u.prenom AS expediteur_prenom, u.role AS expediteur_role
     FROM messages m
     JOIN utilisateurs u ON u.id = m.expediteur_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY m.envoye_le DESC
     LIMIT $${parametres.length}`,
    parametres
  );
  // Renvoyé du plus ancien au plus récent, plus naturel pour un affichage de chat
  return resultat.rows.reverse();
}

/**
 * UPSERT du statut de lecture — une ligne par (message, lecteur).
 * Si le lecteur avait déjà un statut, il est simplement mis à "lu".
 */
async function marquerLu(messageId, utilisateurId) {
  await query(
    `INSERT INTO messages_statut (message_id, utilisateur_id, statut, lu_le)
     VALUES ($1, $2, 'lu', NOW())
     ON CONFLICT (message_id, utilisateur_id)
     DO UPDATE SET statut = 'lu', lu_le = NOW()`,
    [messageId, utilisateurId]
  );
}

module.exports = { creer, trouverParId, listerHistorique, marquerLu };
