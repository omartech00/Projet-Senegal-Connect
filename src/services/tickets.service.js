// src/services/tickets.service.js
// Rôle : logique métier tickets — machine à états (ouvert → en_cours
// → ferme), autorisations par rôle, partagée intégralement entre le
// controller REST (Phase 19) et les handlers Socket.IO (support.js).
// Ne connaît jamais req/res ni socket — reçoit des valeurs simples.

const ApiError = require('../utils/ApiError');
const ticketsModel = require('../models/tickets.model');
const clientsModel = require('../models/clients.model');

async function listerTicketsPourUtilisateur(utilisateur) {
  if (utilisateur.role === 'admin') {
    return ticketsModel.listerTous();
  }
  if (utilisateur.role === 'agent') {
    return ticketsModel.listerPourAgent(utilisateur.id);
  }
  // role === 'client'
  const client = await clientsModel.trouverParUtilisateurId(utilisateur.id);
  if (!client) throw ApiError.introuvable("Aucune fiche client associée à ce compte");
  return ticketsModel.listerPourClient(client.id);
}

async function obtenirTicketPourUtilisateur(id, utilisateur) {
  const ticket = await ticketsModel.trouverParId(id);
  if (!ticket) throw ApiError.introuvable('Ticket introuvable');

  if (utilisateur.role === 'admin') return ticket;

  if (utilisateur.role === 'agent') {
    const estAssigne = ticket.agent_id === utilisateur.id;
    const estDisponible = ticket.agent_id === null && ticket.statut === 'ouvert';
    if (!estAssigne && !estDisponible) {
      throw ApiError.interdit('Ce ticket ne vous est pas accessible');
    }
    return ticket;
  }

  // role === 'client' — doit être le propriétaire du ticket
  if (ticket.client_utilisateur_id !== utilisateur.id) {
    throw ApiError.interdit('Ce ticket ne vous appartient pas');
  }
  return ticket;
}

/**
 * Ouverture d'un ticket — utilisée à l'identique par POST /api/tickets
 * ET par l'événement socket "ticket:ouvrir".
 */
async function ouvrirTicket({ utilisateurId, sujet }) {
  const client = await clientsModel.trouverParUtilisateurId(utilisateurId);
  if (!client) {
    throw ApiError.donneesInvalides([
      { champ: 'client_id', message: "Aucune fiche client associée à ce compte", valeur: utilisateurId },
    ]);
  }
  return ticketsModel.creer({ client_id: client.id, sujet });
}

/**
 * Assignation — un agent (ou admin) prend en charge un ticket ENCORE
 * "ouvert". Transition ouvert → en_cours, jamais l'inverse.
 */
async function assignerTicket(id, agentId) {
  const ticket = await ticketsModel.trouverParId(id);
  if (!ticket) throw ApiError.introuvable('Ticket introuvable');

  if (ticket.statut !== 'ouvert') {
    throw ApiError.conflit(`Impossible d'assigner ce ticket : statut actuel "${ticket.statut}" (attendu "ouvert")`);
  }

  await ticketsModel.assigner(id, agentId);
  return ticketsModel.trouverParId(id); // recharge avec les colonnes jointes (client_utilisateur_id, etc.)

}

/**
 * Fermeture — réservée à l'agent déjà assigné ou à l'admin.
 * Transition en_cours → ferme (ou ouvert → ferme si jamais assigné,
 * autorisé pour ne pas bloquer un ticket sans agent disponible).
 */
/*async function fermerTicket(id, utilisateur) {
  const ticket = await ticketsModel.trouverParId(id);
  if (!ticket) throw ApiError.introuvable('Ticket introuvable');

  if (ticket.statut === 'ferme') {
    throw ApiError.conflit('Ce ticket est déjà fermé');
  }

  if (utilisateur.role === 'agent' && ticket.agent_id !== utilisateur.id) {
    throw ApiError.interdit("Seul l'agent assigné (ou un admin) peut fermer ce ticket");
  }

  await ticketsModel.fermer(id);
  return ticketsModel.trouverParId(id); // recharge avec les colonnes jointes

}*/

/**
 * Fermeture — réservée à l'agent déjà assigné ou à l'admin.
 * Transition en_cours → ferme (ou ouvert → ferme si jamais assigné,
 * autorisé pour ne pas bloquer un ticket sans agent disponible).
 */
async function fermerTicket(id, utilisateur) {
  const ticket = await ticketsModel.trouverParId(id);
  if (!ticket) throw ApiError.introuvable('Ticket introuvable');

  if (ticket.statut === 'ferme') {
    throw ApiError.conflit('Ce ticket est déjà fermé');
  }

  // 1. Bloquer explicitement les comptes clients
  if (utilisateur.role === 'client') {
    throw ApiError.interdit("Seul l'agent assigné (ou un admin) peut fermer ce ticket");
  }

  // 2. Bloquer les agents non assignés à ce ticket
  if (utilisateur.role === 'agent' && ticket.agent_id !== utilisateur.id) {
    throw ApiError.interdit("Seul l'agent assigné (ou un admin) peut fermer ce ticket");
  }

  // L'admin passe les validations sans encombre
  await ticketsModel.fermer(id);
  return ticketsModel.trouverParId(id); // recharge avec les colonnes jointes
}


module.exports = {
  listerTicketsPourUtilisateur,
  obtenirTicketPourUtilisateur,
  ouvrirTicket,
  assignerTicket,
  fermerTicket,
};
