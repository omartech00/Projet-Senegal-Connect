const db = require('../config/db');
const logger = require('../config/logger');

function escapeHtml(str) {
  if (!str) return str;
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatUserName(prenom, nom) {
  return [prenom, nom].filter(Boolean).join(' ') || nom || prenom || 'Utilisateur';
}

async function addCallHistoryMessage(io, ticketId, expediteurId, expediteurNom, expediteurPrenom, content) {
  const result = await db.query(
    `INSERT INTO messages (ticket_id, expediteur_id, type, contenu, fichier_url, fichier_nom, fichier_taille)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [ticketId, expediteurId, 'texte', escapeHtml(content), null, null, null]
  );

  const message = result.rows[0];

  await db.query(
    `INSERT INTO messages_statut (message_id, utilisateur_id, statut)
     VALUES ($1, $2, 'envoye')
     ON CONFLICT (message_id, utilisateur_id) DO NOTHING`,
    [message.id, expediteurId]
  );

  io.to(`ticket:${ticketId}`).emit('message:nouveau', {
    ...message,
    expediteur_nom: expediteurNom,
    expediteur_prenom: expediteurPrenom,
  });
}

function initAppels(io) {
  io.on('connection', (socket) => {
    const user = socket.data.user;

    socket.on('appel:initier', async (data) => {
      try {
        const { ticket_id, type, peerId } = data;

        const ticketCheck = await db.query(
          "SELECT * FROM tickets WHERE id = $1 AND statut IN ('ouvert', 'en_cours')",
          [ticket_id]
        );
        if (ticketCheck.rows.length === 0) {
          return socket.emit('erreur', { message: "Le ticket doit etre ouvert ou en cours pour initier un appel" });
        }

        const ticket = ticketCheck.rows[0];
        let destinataireId;
        if (user.role === 'client') {
          destinataireId = ticket.agent_id;
        } else {
          const clientResult = await db.query(
            'SELECT utilisateur_id FROM clients WHERE id = $1',
            [ticket.client_id]
          );
          destinataireId = clientResult.rows[0]?.utilisateur_id;
        }

        if (!destinataireId) {
          return socket.emit('erreur', { message: 'Aucun destinataire disponible pour cet appel' });
        }

        const result = await db.query(
          `INSERT INTO appels (ticket_id, initiateur_id, destinataire_id, type)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [ticket_id, user.id, destinataireId, type || 'video']
        );
        const appel = result.rows[0];

        io.to(`user:${destinataireId}`).emit('appel:entrant', {
          appelId: appel.id,
          ticket_id,
          initiateur: { id: user.id, nom: user.nom, prenom: user.prenom },
          peerId_init: peerId,
          type: type || 'video',
        });

        logger.info(`Appel #${appel.id} initie par ${user.nom} (${type})`);
      } catch (err) {
        socket.emit('erreur', { message: "Erreur lors de l'initiation de l'appel" });
        logger.error(`Erreur appel:initier: ${err.message}`);
      }
    });

    socket.on('appel:accepter', async (data) => {
      try {
        const { appelId, peerId } = data;

        await db.query(
          "UPDATE appels SET statut = 'accepte' WHERE id = $1",
          [appelId]
        );

        const appelResult = await db.query('SELECT * FROM appels WHERE id = $1', [appelId]);
        const appel = appelResult.rows[0];

        io.to(`user:${appel.initiateur_id}`).emit('appel:accepte', {
          appelId,
          peerId_dest: peerId,
        });

        logger.info(`Appel #${appelId} accepte par ${user.nom}`);
      } catch (err) {
        socket.emit('erreur', { message: "Erreur lors de l'acceptation de l'appel" });
        logger.error(`Erreur appel:accepter: ${err.message}`);
      }
    });

    socket.on('appel:refuser', async (data) => {
      try {
        const { appelId } = data;

        await db.query(
          "UPDATE appels SET statut = 'refuse', fin_le = NOW() WHERE id = $1",
          [appelId]
        );

        const appelResult = await db.query('SELECT * FROM appels WHERE id = $1', [appelId]);
        const appel = appelResult.rows[0];

        await addCallHistoryMessage(
          io,
          appel.ticket_id,
          user.id,
          user.nom,
          user.prenom,
          `Appel refusé par ${formatUserName(user.prenom, user.nom)}`
        );

        io.to(`user:${appel.initiateur_id}`).emit('appel:refuse', { appelId });

        logger.info(`Appel #${appelId} refuse par ${user.nom}`);
      } catch (err) {
        socket.emit('erreur', { message: 'Erreur lors du refus de appel' });
        logger.error(`Erreur appel:refuser: ${err.message}`);
      }
    });

    socket.on('appel:terminer', async (data) => {
      try {
        const { appelId } = data;

        const appelResult = await db.query('SELECT * FROM appels WHERE id = $1', [appelId]);
        if (appelResult.rows.length === 0) return;

        const appel = appelResult.rows[0];
        const duree = appel.debut_le
          ? Math.floor((Date.now() - new Date(appel.debut_le).getTime()) / 1000)
          : 0;

        await db.query(
          "UPDATE appels SET statut = 'termine', duree_secondes = $1, fin_le = NOW() WHERE id = $2",
          [duree, appelId]
        );

        await addCallHistoryMessage(
          io,
          appel.ticket_id,
          user.id,
          user.nom,
          user.prenom,
          `Appel terminé (${duree}s) par ${formatUserName(user.prenom, user.nom)}`
        );

        io.to(`user:${appel.initiateur_id}`).emit('appel:termine', { appelId, duree_secondes: duree });
        io.to(`user:${appel.destinataire_id}`).emit('appel:termine', { appelId, duree_secondes: duree });

        logger.info(`Appel #${appelId} termine (${duree}s)`);
      } catch (err) {
        socket.emit('erreur', { message: "Erreur lors de la fin de l'appel" });
        logger.error(`Erreur appel:terminer: ${err.message}`);
      }
    });

    socket.on('appel:controle', async (data) => {
      try {
        const { appelId, micro, video, partageEcran } = data;

        const appelResult = await db.query('SELECT * FROM appels WHERE id = $1', [appelId]);
        if (appelResult.rows.length === 0) return;

        const appel = appelResult.rows[0];
        const autreId = user.id === appel.initiateur_id
          ? appel.destinataire_id
          : appel.initiateur_id;

        io.to(`user:${autreId}`).emit('appel:controle', {
          appelId,
          micro,
          video,
          partageEcran,
          nom: user.nom,
        });
      } catch (err) {
        logger.error(`Erreur appel:controle: ${err.message}`);
      }
    });
  });
}

module.exports = { initAppels };
