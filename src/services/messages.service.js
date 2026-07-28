// src/services/messages.service.js
// Rôle : logique métier chat — autorisation (réutilise tickets.
// service.js, Phase 19), assainissement HTML avant écriture,
// partagée entre le controller REST (historique) et les handlers
// Socket.IO (envoi, lecture).

const ApiError = require('../utils/ApiError');
const escapeHtml = require('../utils/escapeHtml');
const messagesModel = require('../models/messages.model');
const ticketsService = require('./tickets.service');

async function envoyerMessage({ ticketId, utilisateur, contenu, type = 'texte' }) {
  // Vérifie l'accès au ticket avant tout — lève 403/404 sinon,
  // exactement la même règle que pour consulter le ticket lui-même.
  await ticketsService.obtenirTicketPourUtilisateur(ticketId, utilisateur);

  const contenuAssaini = escapeHtml(contenu);

  const message = await messagesModel.creer({
    ticket_id: ticketId,
    expediteur_id: utilisateur.id,
    type,
    contenu: contenuAssaini,
  });

  return messagesModel.trouverParId(message.id); // recharge avec infos expéditeur jointes
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
