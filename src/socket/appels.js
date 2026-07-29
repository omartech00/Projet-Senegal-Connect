// src/socket/appels.js
// Rôle : signalisation applicative WebRTC — les 5 événements Socket.IO
// du module M4 (initier, accepter, refuser, terminer, controle).
// PeerJS (Phase 24) reste le canal bas niveau qui transporte le SDP/
// ICE une fois que les deux parties se sont mises d'accord ici.

const logger = require('../config/logger');
const appelsService = require('../services/appels.service');

module.exports = function enregistrerEvenementsAppels(io, socket) {
  const utilisateur = socket.data.user;

  // --- appel:initier (C→S), étape 1 du tableau de signalisation ---
  // Crée l'appel en BDD, notifie le destinataire via sa room privée
  // avec le peerId de l'initiateur (étape 2).
  socket.on('appel:initier', async ({ ticketId, type, peerId }, callback) => {
    try {
      const { appel, destinataireId } = await appelsService.initierAppel({ ticketId, utilisateur, type });

      io.to(`user:${destinataireId}`).emit('appel:entrant', {
        appelId: appel.id,
        initiateur: { id: utilisateur.id, nom: utilisateur.nom },
        peerId_init: peerId,
        type: appel.type,
      });

      logger.info(`[socket] Appel ${appel.id} initié par utilisateur ${utilisateur.id} (ticket ${ticketId})`);
      if (callback) callback({ succes: true, appelId: appel.id });
    } catch (erreur) {
      logger.warn(`[socket] Échec appel:initier — ${erreur.message}`);
      if (callback) callback({ succes: false, message: erreur.message });
    }
  });

  // --- appel:accepter (C→S), étape 3 ---
  // Le destinataire envoie son peerId ; notifie l'initiateur (étape 4)
  // pour qu'il déclenche peer.call(peerId_dest, monStream) (étape 5, PeerJS).
  socket.on('appel:accepter', async ({ appelId, peerId }, callback) => {
    try {
      const appel = await appelsService.accepterAppel({ appelId, utilisateur });

      io.to(`user:${appel.initiateur_id}`).emit('appel:accepte', { peerId_dest: peerId, appelId: appel.id });

      logger.info(`[socket] Appel ${appel.id} accepté par utilisateur ${utilisateur.id}`);
      if (callback) callback({ succes: true });
    } catch (erreur) {
      logger.warn(`[socket] Échec appel:accepter — ${erreur.message}`);
      if (callback) callback({ succes: false, message: erreur.message });
    }
  });

  // --- appel:refuser (C→S) ---
  socket.on('appel:refuser', async ({ appelId }, callback) => {
    try {
      const appel = await appelsService.refuserAppel({ appelId, utilisateur });

      io.to(`user:${appel.initiateur_id}`).emit('appel:refuse', { appelId: appel.id });

      logger.info(`[socket] Appel ${appel.id} refusé par utilisateur ${utilisateur.id}`);
      if (callback) callback({ succes: true });
    } catch (erreur) {
      logger.warn(`[socket] Échec appel:refuser — ${erreur.message}`);
      if (callback) callback({ succes: false, message: erreur.message });
    }
  });

  // --- appel:terminer (C→S) ---
  // duree_secondes calculée en SQL (appels.model.js). Notifie LES
  // DEUX parties, pas seulement l'autre — celle qui raccroche doit
  // aussi recevoir la confirmation avec la durée finale exacte.
  socket.on('appel:terminer', async ({ appelId }, callback) => {
    try {
      const appel = await appelsService.terminerAppel({ appelId, utilisateur });

      io.to(`user:${appel.initiateur_id}`).emit('appel:termine', { appelId: appel.id, duree_secondes: appel.duree_secondes });
      io.to(`user:${appel.destinataire_id}`).emit('appel:termine', { appelId: appel.id, duree_secondes: appel.duree_secondes });

      logger.info(`[socket] Appel ${appel.id} terminé (${appel.duree_secondes}s)`);
      if (callback) callback({ succes: true, duree_secondes: appel.duree_secondes });
    } catch (erreur) {
      logger.warn(`[socket] Échec appel:terminer — ${erreur.message}`);
      if (callback) callback({ succes: false, message: erreur.message });
    }
  });

  // --- appel:controle (C→S) ---
  // Relais temps réel pur (rien en BDD) — micro/caméra/partage écran.
  // "L'autre participant" est déterminé dynamiquement (Phase 25,
  // section 4), pas toujours le destinataire de l'appel initial.
  socket.on('appel:controle', async ({ appelId, micro, video, partageEcran }) => {
    try {
      const autreParticipantId = await appelsService.obtenirAutreParticipant({ appelId, utilisateur });
      io.to(`user:${autreParticipantId}`).emit('appel:controle', { appelId, micro, video, partageEcran });
    } catch (erreur) {
      logger.warn(`[socket] Échec appel:controle — ${erreur.message}`);
    }
  });
};
