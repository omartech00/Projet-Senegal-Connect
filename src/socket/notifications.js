// src/socket/notifications.js
// Rôle : point d'accès global pour émettre l'événement Socket.IO
// "notification:push" depuis N'IMPORTE QUEL service REST, sans que
// ce service importe directement socket/index.js (dépendance
// circulaire évitée par injection : initialiser(io) est appelé une
// seule fois au démarrage, notifier() est ensuite utilisable partout).

const logger = require('../config/logger');

let instanceIo = null;

function initialiser(io) {
  instanceIo = io;
}

/**
 * Envoie une notification personnalisée à un utilisateur précis via
 * sa room privée "user:{id}". Ne lève jamais d'exception : une
 * notification manquée ne doit jamais faire échouer l'action métier
 * qui l'a déclenchée (création de facture, envoi de message...).
 *
 * @param {number} utilisateurId
 * @param {string} type - ex: 'facture_emise', 'facture_en_retard', 'ticket_repondu'
 * @param {object} donnees - contenu spécifique au type (ex: { facture_id, reference })
 * @param {string} message - texte lisible par un humain
 */
function notifier(utilisateurId, type, message, donnees = {}) {
  if (!instanceIo) {
    logger.warn(`[notifications] io non initialisé — notification "${type}" ignorée pour l'utilisateur ${utilisateurId}`);
    return;
  }

  instanceIo.to(`user:${utilisateurId}`).emit('notification:push', {
    type,
    message,
    donnees,
    envoye_le: new Date().toISOString(),
  });
}

module.exports = { initialiser, notifier };
