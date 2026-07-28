// src/socket/index.js
// Rôle : initialise le serveur Socket.IO sur le même http.Server
// qu'Express, applique le middleware d'authentification JWT, et gère
// la connexion initiale (rooms user:{id} et agents). Les événements
// métier sont délégués à support.js et appels.js, enregistrés ici
// une fois par connexion — pas de logique métier dans ce fichier.

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const logger = require('../config/logger');
const enregistrerEvenementsSupport = require('./support');
const enregistrerEvenementsAppels = require('./appels');

function initialiserSocket(serveurHttp) {
  const io = new Server(serveurHttp, {
    cors: {
      origin: env.corsOrigins,
      credentials: true,
    },
  });

  // --- Middleware d'authentification (exécuté une fois par connexion) ---
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;

    if (!token) {
      logger.warn('[socket] Connexion refusée : token manquant');
      return next(new Error('Token manquant'));
    }

    try {
      const payload = jwt.verify(token, env.jwt.secret, { issuer: 'senegal-connect' });
      socket.data.user = payload; // { id, nom, email, role, iat, exp, iss }
      return next();
    } catch (erreur) {
      logger.warn(`[socket] Connexion refusée : token invalide (${erreur.message})`);
      return next(new Error('Token invalide'));
    }
  });

  // --- Connexion établie ---
  io.on('connection', (socket) => {
    const utilisateur = socket.data.user;
    logger.info(`[socket] Connexion établie : utilisateur ${utilisateur.id} (${utilisateur.role})`);

    // Room privée personnelle — notifications individuelles
    // (message:statut, appel:entrant, notification:push...)
    socket.join(`user:${utilisateur.id}`);

    // Room collective des agents — recevra les nouveaux tickets
    // (événement ticket:nouveau, phase suivante). Réservée au rôle
    // exact "agent", conformément au texte du PDF.
    if (utilisateur.role === 'agent') {
      socket.join('agents');
    }

    // Délégation des événements métier — enregistrés maintenant,
    // implémentés progressivement dans les phases suivantes.
    enregistrerEvenementsSupport(io, socket);
    enregistrerEvenementsAppels(io, socket);

    socket.on('disconnect', (raison) => {
      logger.info(`[socket] Déconnexion : utilisateur ${utilisateur.id} (${raison})`);
    });
  });

  return io;
}

module.exports = initialiserSocket;
