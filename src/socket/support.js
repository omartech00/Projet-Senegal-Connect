const jwt = require('jsonwebtoken');
const db = require('../config/db');
const logger = require('../config/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-at-least-64-chars-long';

function escapeHtml(str) {
  if (!str) return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function initSupport(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Token manquant'));
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.data.user = decoded;
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return next(new Error('Token expire'));
      }
      return next(new Error('Token invalide'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    logger.info(`Socket connecte: ${user.nom} (${user.role}) [${socket.id}]`);

    socket.join(`user:${user.id}`);
    if (user.role === 'agent' || user.role === 'admin') {
      socket.join('agents');
    }

    socket.on('ticket:ouvrir', async (data) => {
      try {
        const { client_id, sujet } = data;
        const result = await db.query(
          'INSERT INTO tickets (client_id, sujet) VALUES ($1, $2) RETURNING *',
          [client_id, sujet]
        );
        const ticket = result.rows[0];

        socket.join(`ticket:${ticket.id}`);

        io.to('agents').emit('ticket:nouveau', {
          ...ticket,
          client_nom: user.nom,
          client_prenom: user.prenom,
        });

        socket.emit('ticket:cree', ticket);
        logger.info(`Ticket #${ticket.id} cree par ${user.nom}`);
      } catch (err) {
        socket.emit('erreur', { message: 'Erreur lors de la creation du ticket' });
        logger.error(`Erreur ticket:ouvrir: ${err.message}`);
      }
    });

    socket.on('ticket:rejoindre', (data) => {
      const { ticket_id } = data;
      if (ticket_id) {
        socket.join(`ticket:${ticket_id}`);
        logger.info(`${user.nom} a rejoint la room ticket:${ticket_id}`);
      }
    });

    socket.on('ticket:assigner', async (data) => {
      try {
        const { ticket_id } = data;

        await db.query(
          "UPDATE tickets SET agent_id = $1, statut = 'en_cours' WHERE id = $2",
          [user.id, ticket_id]
        );

        const ticketResult = await db.query('SELECT * FROM tickets WHERE id = $1', [ticket_id]);
        const ticket = ticketResult.rows[0];

        socket.join(`ticket:${ticket_id}`);

        io.to(`user:${ticket.client_id}`).emit('ticket:pris_en_charge', {
          ticket_id,
          agent_nom: user.nom,
          agent_prenom: user.prenom,
        });

        io.to('agents').emit('ticket:assigne', { ticket_id, agent_id: user.id });
        logger.info(`Ticket #${ticket_id} assigne a ${user.nom}`);
      } catch (err) {
        socket.emit('erreur', { message: "Erreur lors de l'assignation du ticket" });
        logger.error(`Erreur ticket:assigner: ${err.message}`);
      }
    });

    socket.on('message:envoyer', async (data) => {
      try {
        const { ticket_id, contenu, type, fichier_url, fichier_nom, fichier_taille } = data;
        const cleanContenu = contenu ? escapeHtml(contenu) : null;
        const msgType = type || 'texte';

        const result = await db.query(
          `INSERT INTO messages (ticket_id, expediteur_id, type, contenu, fichier_url, fichier_nom, fichier_taille)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [ticket_id, user.id, msgType, cleanContenu, fichier_url || null, fichier_nom || null, fichier_taille || null]
        );
        const message = result.rows[0];

        await db.query(
          `INSERT INTO messages_statut (message_id, utilisateur_id, statut)
           VALUES ($1, $2, 'envoye')
           ON CONFLICT (message_id, utilisateur_id) DO NOTHING`,
          [message.id, user.id]
        );

        io.to(`ticket:${ticket_id}`).emit('message:nouveau', {
          ...message,
          expediteur_nom: user.nom,
          expediteur_prenom: user.prenom,
        });
      } catch (err) {
        socket.emit('erreur', { message: "Erreur lors de l'envoi du message" });
        logger.error(`Erreur message:envoyer: ${err.message}`);
      }
    });

    socket.on('message:lu', async (data) => {
      try {
        const { message_id, ticket_id, expediteur_id } = data;

        await db.query(
          `INSERT INTO messages_statut (message_id, utilisateur_id, statut, lu_le)
           VALUES ($1, $2, 'lu', NOW())
           ON CONFLICT (message_id, utilisateur_id) DO UPDATE SET statut = 'lu', lu_le = NOW()`,
          [message_id, user.id]
        );

        io.to(`user:${expediteur_id}`).emit('message:statut', {
          message_id,
          statut: 'lu',
        });
      } catch (err) {
        logger.error(`Erreur message:lu: ${err.message}`);
      }
    });

    socket.on('fichier:partager', async (data) => {
      try {
        const { ticket_id, fichierUrl, fichierNom, fichierTaille, mimeType } = data;

        let type = 'fichier';
        if (mimeType && mimeType.startsWith('image/')) type = 'image';
        else if (mimeType && mimeType.startsWith('audio/')) type = 'audio';

        const result = await db.query(
          `INSERT INTO messages (ticket_id, expediteur_id, type, contenu, fichier_url, fichier_nom, fichier_taille)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [ticket_id, user.id, type, fichierNom, fichierUrl, fichierNom, fichierTaille]
        );
        const message = result.rows[0];

        io.to(`ticket:${ticket_id}`).emit('message:nouveau', {
          ...message,
          expediteur_nom: user.nom,
          expediteur_prenom: user.prenom,
        });
      } catch (err) {
        socket.emit('erreur', { message: 'Erreur lors du partage de fichier' });
        logger.error(`Erreur fichier:partager: ${err.message}`);
      }
    });

    socket.on('frappe', (data) => {
      const { ticket_id } = data;
      if (ticket_id) {
        socket.to(`ticket:${ticket_id}`).emit('frappe', {
          nom: user.nom,
          prenom: user.prenom,
        });
      }
    });

    socket.on('ticket:fermer', async (data) => {
      try {
        const { ticket_id } = data;

        await db.query(
          "UPDATE tickets SET statut = 'ferme', ferme_le = NOW() WHERE id = $1",
          [ticket_id]
        );

        const ticketResult = await db.query('SELECT * FROM tickets WHERE id = $1', [ticket_id]);
        const ticket = ticketResult.rows[0];

        io.to(`ticket:${ticket_id}`).emit('ticket:ferme', {
          ticket_id,
          ferme_le: ticket.ferme_le,
        });

        io.to(`user:${ticket.client_id}`).emit('notification:push', {
          type: 'ticket_ferme',
          message: `Votre ticket #${ticket_id} a ete ferme`,
        });
      } catch (err) {
        socket.emit('erreur', { message: 'Erreur lors de la fermeture du ticket' });
        logger.error(`Erreur ticket:fermer: ${err.message}`);
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Socket deconnecte: ${user.nom} [${socket.id}]`);
    });
  });
}

module.exports = { initSupport };
