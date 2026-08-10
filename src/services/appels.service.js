// src/services/appels.service.js
// Rôle : logique métier des appels — déduction du destinataire à
// partir du ticket, vérification "ticket en_cours" et "participants
// autorisés", transitions de statut (initie → accepte/refuse →
// termine). Partagé exclusivement par les handlers Socket.IO
// (socket/appels.js) — aucun endpoint REST d'écriture, seulement la
// lecture d'historique.

const ApiError = require('../utils/ApiError');
const appelsModel = require('../models/appels.model');
const ticketsModel = require('../models/tickets.model');
const ticketsService = require('./tickets.service');

/**
 * Détermine l'autre participant du ticket à partir de l'initiateur.
 * Lève une erreur si l'initiateur n'est ni le client ni l'agent
 * assigné — cf. règle "participants nécessairement client + agent
 * assigné" (PDF, module M4, point 6).
 */
function deduireDestinataire(ticket, initiateurId) {
  if (ticket.client_utilisateur_id === initiateurId) {
    if (!ticket.agent_id) {
      throw ApiError.conflit('Aucun agent assigné à ce ticket — impossible d\'appeler');
    }
    return ticket.agent_id;
  }
  if (ticket.agent_id === initiateurId) {
    return ticket.client_utilisateur_id;
  }
  throw ApiError.interdit('Vous n\'êtes pas participant de ce ticket');
}

async function initierAppel({ ticketId, utilisateur, type }) {
  const ticket = await ticketsModel.trouverParId(ticketId);
  if (!ticket) throw ApiError.introuvable('Ticket introuvable');

  if (ticket.statut !== 'en_cours') {
    throw ApiError.conflit(`Impossible d'appeler : le ticket doit être "en_cours" (statut actuel : "${ticket.statut}")`);
  }

  const destinataireId = deduireDestinataire(ticket, utilisateur.id);

  const appel = await appelsModel.creer({
    ticket_id: ticketId,
    initiateur_id: utilisateur.id,
    destinataire_id: destinataireId,
    type,
  });

  return { appel, destinataireId };
}

async function accepterAppel({ appelId, utilisateur }) {
  const appel = await appelsModel.trouverParId(appelId);
  if (!appel) throw ApiError.introuvable('Appel introuvable');

  if (appel.destinataire_id !== utilisateur.id) {
    throw ApiError.interdit('Seul le destinataire peut accepter cet appel');
  }
  if (appel.statut !== 'initie') {
    throw ApiError.conflit(`Impossible d'accepter : statut actuel "${appel.statut}" (attendu "initie")`);
  }

  const appelMaj = await appelsModel.mettreAJourStatut(appelId, 'accepte');
  return appelMaj;
}

async function refuserAppel({ appelId, utilisateur }) {
  const appel = await appelsModel.trouverParId(appelId);
  if (!appel) throw ApiError.introuvable('Appel introuvable');

  if (appel.destinataire_id !== utilisateur.id) {
    throw ApiError.interdit('Seul le destinataire peut refuser cet appel');
  }
  if (appel.statut !== 'initie') {
    throw ApiError.conflit(`Impossible de refuser : statut actuel "${appel.statut}" (attendu "initie")`);
  }

  return appelsModel.refuser(appelId);
}

async function terminerAppel({ appelId, utilisateur }) {
  const appel = await appelsModel.trouverParId(appelId);
  if (!appel) throw ApiError.introuvable('Appel introuvable');

  const estParticipant = appel.initiateur_id === utilisateur.id || appel.destinataire_id === utilisateur.id;
  if (!estParticipant) {
    throw ApiError.interdit('Vous n\'êtes pas participant de cet appel');
  }
  if (appel.statut === 'termine' || appel.statut === 'refuse') {
    throw ApiError.conflit(`Cet appel est déjà terminé (statut : "${appel.statut}")`);
  }

  return appelsModel.terminer(appelId);
}

/**
 * Détermine "l'autre participant" pour relayer appel:controle —
 * dynamique dans les deux sens (initiateur coupe son micro → relayé
 * au destinataire, et inversement).
 */
async function obtenirAutreParticipant({ appelId, utilisateur }) {
  const appel = await appelsModel.trouverParId(appelId);
  if (!appel) throw ApiError.introuvable('Appel introuvable');

  if (appel.initiateur_id === utilisateur.id) return appel.destinataire_id;
  if (appel.destinataire_id === utilisateur.id) return appel.initiateur_id;
  throw ApiError.interdit('Vous n\'êtes pas participant de cet appel');
}

async function listerHistoriqueTicket(ticketId, utilisateur) {
  await ticketsService.obtenirTicketPourUtilisateur(ticketId, utilisateur);
  return appelsModel.listerParTicket(ticketId);
}

module.exports = {
  initierAppel,
  accepterAppel,
  refuserAppel,
  terminerAppel,
  obtenirAutreParticipant,
  listerHistoriqueTicket,
};
