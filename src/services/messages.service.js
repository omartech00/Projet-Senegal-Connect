// src/services/messages.service.js
// Rôle : logique métier chat — autorisation (réutilise tickets.
// service.js, Phase 19), assainissement HTML avant écriture,
// partagée entre le controller REST (historique) et les handlers
// Socket.IO (envoi, lecture).

const ApiError = require('../utils/ApiError');
const escapeHtml = require('../utils/escapeHtml');
const messagesModel = require('../models/messages.model');
const ticketsService = require('./tickets.service');
const notifications = require('../socket/notifications');


async function envoyerMessage({ ticketId, utilisateur, contenu, type = 'texte' }) {
  // Vérifie l'accès au ticket avant tout — lève 403/404 sinon,
  // exactement la même règle que pour consulter le ticket lui-même.
  const ticket = await ticketsService.obtenirTicketPourUtilisateur(ticketId, utilisateur);
  const contenuAssaini = escapeHtml(contenu);
  const messageBrut = await messagesModel.creer({
    ticket_id: ticketId,
    expediteur_id: utilisateur.id,
    type,
    contenu: contenuAssaini,
  });

  const message = await messagesModel.trouverParId(messageBrut.id); // recharge avec infos expéditeur jointes
  // Notifie le DESTINATAIRE (pas l'émetteur) — si le client a écrit,
  // on notifie l'agent assigné ; si l'agent/admin a écrit, on notifie
  // le client. ticket.agent_id référence directement utilisateurs.id
  // (pas besoin de jointure) ; ticket.client_utilisateur_id vient de
  // la jointure clients→utilisateurs (même piège qu'en Phase 19).
  if (utilisateur.role === 'client' && ticket.agent_id) {
    notifications.notifier(ticket.agent_id, 'ticket_repondu', `Nouveau message sur le ticket #${ticketId}`, { ticket_id: ticketId, message_id: message.id });
  } else if (utilisateur.role !== 'client') {
    notifications.notifier(ticket.client_utilisateur_id, 'ticket_repondu', `Réponse de l'agent sur votre ticket #${ticketId}`, { ticket_id: ticketId, message_id: message.id });
  }
  return message;
}


async function marquerMessageLu({ messageId, utilisateur }) {
  const message = await messagesModel.trouverParId(messageId);
  if (!message) throw ApiError.introuvable('Message introuvable');

  // On ne permet pas à l'expéditeur de "lire" son propre message —
  // ça n'a pas de sens fonctionnel et fausserait l'accusé ✓✓.
  if (message.expediteur_id === utilisateur.id) {
    return message;
  }

  await messagesModel.marquerLu(messageId, utilisateur.id);
  return message;
}

async function obtenirHistorique(ticketId, utilisateur, { avant, limite } = {}) {
  await ticketsService.obtenirTicketPourUtilisateur(ticketId, utilisateur);
  const limiteNum = Math.min(parseInt(limite, 10) || 50, 50); // jamais plus de 50, cf. PDF
  return messagesModel.listerHistorique(ticketId, { avant, limite: limiteNum });
}

module.exports = { envoyerMessage, marquerMessageLu, obtenirHistorique };
