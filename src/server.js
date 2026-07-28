// src/server.js
// Rôle : point d'entrée réel du process. Démarre l'écoute HTTP et
// vérifie la connectivité PostgreSQL au démarrage. Socket.IO et le
// serveur PeerJS seront attachés ici aux Phases 19 et 25 (ils ont
// besoin du même objet `http.Server` que Express, d'où l'usage de
// `http.createServer(app)` plutôt que `app.listen()` directement).

const http = require('http');
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

  serveurHttp.listen(env.port, () => {
    logger.info(`[server] Sénégal Connect démarré sur le port ${env.port} (env: ${env.nodeEnv})`);
    logger.info('[server] Socket.IO prêt à accepter des connexions authentifiées');
  });
}

demarrer();

module.exports = { serveurHttp, io };