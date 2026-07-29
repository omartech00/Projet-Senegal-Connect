// src/socket/support.js
// Rôle : événements Socket.IO du module support — tickets pour
// l'instant (Phase 19). Réutilise EXACTEMENT le même service que le
// controller REST (tickets.service.js), pour garantir qu'un ticket
// créé/assigné/fermé via socket ou via REST suit la même logique
// métier, sans double implémentation.

const logger = require('../config/logger');
const ticketsService = require('../services/tickets.service');
const messagesService = require('../services/messages.service');
const reactionsService = require('../services/reactions.service');

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

  // --- message:envoyer (C→S) ---
  // Valide l'accès au ticket, assainit le contenu, insère en BDD,
  // diffuse le message complet à TOUS les participants de la room
  // (io.to, pas socket.to — l'émetteur voit aussi son propre message
  // apparaître, comportement standard d'une UI de chat).
  socket.on('message:envoyer', async ({ ticketId, contenu, type }, callback) => {
    try {
      const message = await messagesService.envoyerMessage({
        ticketId,
        utilisateur,
        contenu,
        type: type || 'texte',
      });

      io.to(`ticket:${ticketId}`).emit('message:nouveau', message);

      if (callback) callback({ succes: true, message });
    } catch (erreur) {
      logger.warn(`[socket] Échec message:envoyer — ${erreur.message}`);
      if (callback) callback({ succes: false, message: erreur.message });
    }
  });

  // --- message:lu (C→S) ---
  // Marque le message comme lu par l'utilisateur courant, notifie
  // l'EXPÉDITEUR ORIGINAL (pas le lecteur) via sa room privée, pour
  // qu'il mette à jour son icône ✓ → ✓✓ en temps réel.
  socket.on('message:lu', async ({ messageId }, callback) => {
    try {
      const message = await messagesService.marquerMessageLu({ messageId, utilisateur });

      io.to(`user:${message.expediteur_id}`).emit('message:statut', {
        message_id: message.id,
        statut: 'lu',
        lu_par: utilisateur.id,
      });
      if (callback) callback({ succes: true });
    } catch (erreur) {
      logger.warn(`[socket] Échec message:lu — ${erreur.message}`);
      if (callback) callback({ succes: false, message: erreur.message });
    }
  });
  // --- frappe (C→S) ---
  // Relais IMMÉDIAT, sans throttle côté serveur — le throttle 1/s et
  // la disparition auto après 2,5s sont des responsabilités CLIENT
  // (public/js/app.js, phase frontend), pas de ce handler.
  // socket.to (pas io.to) : l'émetteur ne reçoit jamais son propre
  // indicateur de frappe.
  socket.on('frappe', ({ ticketId }) => {
    socket.to(`ticket:${ticketId}`).emit('frappe', { nom: utilisateur.nom });
  });

  // --- fichier:partager (C→S) ---
  // Reçu APRÈS un upload REST réussi (POST /api/tickets/:id/fichier).
  // Crée le message en base (type déduit du MIME) et le diffuse à
  // toute la room, exactement comme message:nouveau pour un message texte.
  socket.on('fichier:partager', async ({ ticketId, fichierUrl, fichierNom, fichierTaille, mimeType }, callback) => {
    try {
      const message = await messagesService.partagerFichier({
        ticketId, utilisateur, fichierUrl, fichierNom, fichierTaille, mimeType,
      });

      io.to(`ticket:${ticketId}`).emit('message:nouveau', message);

      if (callback) callback({ succes: true, message });
    } catch (erreur) {
      logger.warn(`[socket] Échec fichier:partager — ${erreur.message}`);
      if (callback) callback({ succes: false, message: erreur.message });
    }
  });

  // --- message:reaction (C→S) ---
  // Toggle : clic sur un emoji l'ajoute, re-clic sur le MÊME emoji le
  // retire (décidé côté service selon l'existence préalable). Diffuse
  // les compteurs agrégés (pas l'événement brut) à toute la room du
  // ticket, pour garantir un affichage cohérent chez tous les
  // participants même en cas de perte d'un événement intermédiaire.
  socket.on('message:reaction', async ({ messageId, emoji }, callback) => {
    try {
      const resultat = await reactionsService.togglerReaction({ messageId, utilisateur, emoji });

      io.to(`ticket:${resultat.ticket_id}`).emit('message:reaction', {
        message_id: resultat.message_id,
        reactions: resultat.reactions,
      });

      if (callback) callback({ succes: true, action: resultat.action });
    } catch (erreur) {
      logger.warn(`[socket] Échec message:reaction — ${erreur.message}`);
      if (callback) callback({ succes: false, message: erreur.message });
    }
  });

};
