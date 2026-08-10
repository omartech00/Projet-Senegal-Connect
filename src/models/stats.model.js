// src/models/stats.model.js
// Rôle : UNE SEULE requête SQL avec sous-requêtes scalaires
// d'agrégation (exigence explicite du PDF — pas 4 requêtes séparées
// combinées en JS). Aucune règle métier ici, juste l'agrégation brute.
const { query } = require('../config/db');
async function obtenirTableauDeBord() {
  const resultat = await query(`
    SELECT
      (SELECT COUNT(*) FROM clients WHERE statut = 'actif') AS clients_actifs,
      (SELECT COALESCE(SUM(f.prix_mensuel_fcfa), 0)
         FROM clients c
         JOIN forfaits f ON f.id = c.forfait_id
        WHERE c.statut = 'actif') AS mrr_fcfa,
      (SELECT COUNT(*) FROM factures WHERE statut IN ('impayee', 'en_retard')) AS factures_impayees,
      (SELECT COUNT(*) FROM tickets WHERE statut = 'ouvert') AS tickets_ouverts
  `);
  const ligne = resultat.rows[0];
  return {
    clients_actifs: parseInt(ligne.clients_actifs, 10),
    mrr_fcfa: parseFloat(ligne.mrr_fcfa),
    factures_impayees: parseInt(ligne.factures_impayees, 10),
    tickets_ouverts: parseInt(ligne.tickets_ouverts, 10),
  };
}

module.exports = { obtenirTableauDeBord };
