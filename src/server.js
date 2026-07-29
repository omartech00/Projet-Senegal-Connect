// src/server.js
// Rôle : point d'entrée réel du process. Démarre l'écoute HTTP et
// vérifie la connectivité PostgreSQL au démarrage. Socket.IO et le
// serveur PeerJS seront attachés ici aux Phases 19 et 25 (ils ont
// besoin du même objet `http.Server` que Express, d'où l'usage de
// `http.createServer(app)` plutôt que `app.listen()` directement).

const http = require('http');
const { ExpressPeerServer } = require('peer');
const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { verifierConnexion } = require('./config/db');
const initialiserSocket = require('./socket');

const serveurHttp = http.createServer(app);
const io = initialiserSocket(serveurHttp);

// --- Serveur PeerJS de signalisation (auto-hébergé) ---
// Nécessite l'objet http.Server brut (pas seulement Express) car il
// négocie des connexions WebSocket via l'événement "upgrade" du
// serveur — même raison que pour Socket.IO ci-dessus. Monté sur un
// chemin distinct de "/socket.io/" pour éviter toute collision.
const peerServer = ExpressPeerServer(serveurHttp, {
  path: '/',
  allow_discovery: false, // empêche l'énumération publique des peerId connectés
  proxied: true,           // anticipe un reverse-proxy en Phase 34 (Docker)
});

app.locals.peerServer = peerServer;  //modif

peerServer.on('connection', (client) => {
  logger.info(`[peerjs] Peer connecté : ${client.getId()}`);
});

peerServer.on('disconnect', (client) => {
  logger.info(`[peerjs] Peer déconnecté : ${client.getId()}`);
});

app.use('/peerjs', peerServer);


async function demarrer() {
  const bddOk = await verifierConnexion();
  if (!bddOk) {
    logger.error('[server] Démarrage annulé : PostgreSQL inaccessible.');
    process.exit(1);
  }

  serveurHttp.listen(env.port, () => {
    logger.info(`[server] Sénégal Connect démarré sur le port ${env.port} (env: ${env.nodeEnv})`);
    logger.info('[server] Socket.IO prêt à accepter des connexions authentifiées');
    logger.info(`[server] Serveur PeerJS de signalisation actif sur /peerjs`);
  });
}

demarrer();

module.exports = { serveurHttp, io };