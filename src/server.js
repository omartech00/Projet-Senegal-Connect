const http = require('http');
const { PeerServer } = require('peer'); // <--- Utilisez PeerServer (standalone) au lieu de ExpressPeerServer
const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { verifierConnexion } = require('./config/db');
const initialiserSocket = require('./socket');

const serveurHttp = http.createServer(app);
const io = initialiserSocket(serveurHttp);

async function demarrer() {
  const bddOk = await verifierConnexion();
  if (!bddOk) {
    logger.error('[server] Démarrage annulé : PostgreSQL inaccessible.');
    process.exit(1);
  }

  // 1. Démarrage d'Express et de Socket.IO sur le port 3000 uniquement
  serveurHttp.listen(env.port || 3000, () => {
    logger.info(`[server] Sénégal Connect démarré sur le port ${env.port || 3000}`);
    logger.info('[server] Socket.IO prêt à accepter des connexions authentifiées');
  });

  // 2. Démarrage du serveur de signalisation WebRTC sur le port ISOLÉ 3001
  // En utilisant PeerServer directement, aucun conflit de port ou d'upgrade n'est possible avec le port 3000.
  const peerServer = PeerServer({ 
    port: 3001, 
    path: '/peerjs' 
  }, () => {
    logger.info('[server] Serveur PeerJS de signalisation isolé actif sur le port 3001');
  });

  peerServer.on('connection', (client) => {
    logger.info(`[peerjs] Peer connecté : ${client.getId()}`);
  });

  peerServer.on('disconnect', (client) => {
    logger.info(`[peerjs] Peer déconnecté : ${client.getId()}`);
  });
}

demarrer();

module.exports = { serveurHttp, io };
