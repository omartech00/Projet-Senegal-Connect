// src/socket/support.js
// Rôle : événements Socket.IO du module support — tickets pour
// l'instant (Phase 19). Réutilise EXACTEMENT le même service que le
// controller REST (tickets.service.js), pour garantir qu'un ticket
// créé/assigné/fermé via socket ou via REST suit la même logique
// métier, sans double implémentation.

const logger = require('../config/logger');
const ticketsService = require('../services/tickets.service');

module.exports = function enregistrerEvenementsSupport(io, socket) {
  const utilisateur = socket.data.user;

  // --- ticket:ouvrir (C→S) ---
  // Crée le ticket, fait rejoindre l'émetteur à sa room dédiée, et
  // notifie tous les agents connectés (room "agents") du nouveau ticket.
  socket.on('ticket:ouvrir', async ({ sujet }, callback) => {
    try {
      const ticket = await ticketsService.ouvrirTicket({ utilisateurId: utilisateur.id, sujet });

      socket.join(`ticket:${ticket.id}`);

      // io.to (pas socket.to) : tous les agents, y compris si l'émetteur
      // était lui-même un agent (cas rare mais cohérent) — ici l'émetteur
      // est un client donc la distinction n'a pas d'effet visible, mais
      // le choix reste correct sémantiquement pour une diffusion collective.
      io.to('agents').emit('ticket:nouveau', ticket);

      logger.info(`[socket] Ticket ${ticket.id} ouvert par utilisateur ${utilisateur.id}`);
      if (callback) callback({ succes: true, ticket });
    } catch (erreur) {
      logger.warn(`[socket] Échec ticket:ouvrir — ${erreur.message}`);
      if (callback) callback({ succes: false, message: erreur.message });
    }
  });

  // --- ticket:assigner (C→S) ---
  // L'agent (ou admin) connecté s'assigne le ticket. Notifie le client
  // via sa room privée "user:{clientId}" avec "ticket:pris_en_charge".
  socket.on('ticket:assigner', async ({ ticketId }, callback) => {
    try {
      if (!['agent', 'admin'].includes(utilisateur.role)) {
        throw new Error('Seuls les agents ou admins peuvent assigner un ticket');
      }

      const ticket = await ticketsService.assignerTicket(ticketId, utilisateur.id);

      socket.join(`ticket:${ticket.id}`);
      io.to(`user:${ticket.client_utilisateur_id}`).emit('ticket:pris_en_charge', ticket);

      logger.info(`[socket] Ticket ${ticket.id} assigné à l'agent ${utilisateur.id}`);
      if (callback) callback({ succes: true, ticket });
    } catch (erreur) {
      logger.warn(`[socket] Échec ticket:assigner — ${erreur.message}`);
      if (callback) callback({ succes: false, message: erreur.message });
    }
  });

  // --- ticket:fermer (C→S) ---
  // Agent (ou admin) ferme le ticket. Notifie le client.
  socket.on('ticket:fermer', async ({ ticketId }, callback) => {
    try {
      const ticket = await ticketsService.fermerTicket(ticketId, utilisateur);

      io.to(`ticket:${ticket.id}`).emit('ticket:ferme', ticket);

      logger.info(`[socket] Ticket ${ticket.id} fermé par utilisateur ${utilisateur.id}`);
      if (callback) callback({ succes: true, ticket });
    } catch (erreur) {
      logger.warn(`[socket] Échec ticket:fermer — ${erreur.message}`);
      if (callback) callback({ succes: false, message: erreur.message });
    }
  });
};
