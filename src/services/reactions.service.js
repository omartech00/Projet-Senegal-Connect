// src/services/reactions.service.js
// Rôle : logique métier des réactions — toggle (ajoute si absente,
// retire si déjà présente), autorisation via le ticket du message,
// validation de la liste blanche d'émojis. Partagé exclusivement par
// le handler Socket.IO (aucun endpoint REST n'est exigé par le PDF
// pour cette fonctionnalité).

const ApiError = require('../utils/ApiError');
const { estEmojiAutorise } = require('../utils/emojisAutorises');
const messagesModel = require('../models/messages.model');
const reactionsModel = require('../models/reactions.model');
const ticketsService = require('./tickets.service');

async function togglerReaction({ messageId, utilisateur, emoji }) {
  if (!estEmojiAutorise(emoji)) {
    throw ApiError.donneesInvalides([
      { champ: 'emoji', message: 'Emoji non autorisé', valeur: emoji },
    ]);
  }

  const message = await messagesModel.trouverParId(messageId);
  if (!message) throw ApiError.introuvable('Message introuvable');

  // Même règle d'accès que pour lire/écrire dans le ticket — un
  // utilisateur ne peut réagir qu'à un message d'un ticket auquel
  // il a accès (Phase 19).
  await ticketsService.obtenirTicketPourUtilisateur(message.ticket_id, utilisateur);

  const dejaReagi = await reactionsModel.existe(messageId, utilisateur.id, emoji);

  if (dejaReagi) {
    await reactionsModel.retirer(messageId, utilisateur.id, emoji);
  } else {
    await reactionsModel.ajouter(messageId, utilisateur.id, emoji);
  }

  const reactions = await reactionsModel.listerParMessage(messageId);

  return {
    message_id: messageId,
    ticket_id: message.ticket_id,
    action: dejaReagi ? 'retiree' : 'ajoutee',
    reactions,
  };
}

module.exports = { togglerReaction };
