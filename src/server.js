require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { Server: SocketIOServer } = require('socket.io');
const { ExpressPeerServer } = require('peer');

const PEER_PORT = parseInt(process.env.PEER_PORT, 10) || 9000;

const logger = require('./config/logger');
const { setupSwagger } = require('./config/swagger');
const { handler404, handlerErreurs } = require('./middleware/erreurs');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const forfaitRoutes = require('./routes/forfaits');
const factureRoutes = require('./routes/factures');
const ticketRoutes = require('./routes/tickets');
const statsRoutes = require('./routes/stats');

const { initSupport } = require('./socket/support');
const { initAppels } = require('./socket/appels');

const app = express();
const server = http.createServer(app);

const PORT = parseInt(process.env.PORT, 10) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const io = new SocketIOServer(server, {
  cors: {
    origin: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  cookie: false,
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
  credentials: true,
}));

if (NODE_ENV !== 'test') {
  const morganStream = { write: (msg) => logger.http(msg.trim()) };
  app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev', { stream: morganStream }));
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

setupSwagger(app);

const healthcheck = require('./routes/health');
app.use('/api', healthcheck);

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/forfaits', forfaitRoutes);
app.use('/api/factures', factureRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/stats', statsRoutes);

if (NODE_ENV !== 'test') {
  const peerApp = express();
  peerApp.use(cors());
  const peerServer = http.createServer(peerApp);
  peerApp.use('/', ExpressPeerServer(peerServer, { path: '/', allow_discovery: false }));

  peerServer.on('error', (err) => {
    logger.error(`PeerJS serveur erreur: ${err.message}`);
  });

  peerServer.listen(PEER_PORT, '0.0.0.0', () => {
    logger.info(`PeerJS serveur demarree sur le port ${PEER_PORT}`);
  });
}

app.use(handler404);
app.use(handlerErreurs);

initSupport(io);
initAppels(io);

if (NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    logger.info(`Senegal Connect API demarree sur le port ${PORT}`);
    logger.info(`Environnement: ${NODE_ENV}`);
    logger.info(`Swagger UI: http://localhost:${PORT}/api/docs`);
  });
}

module.exports = { app, server, io };
