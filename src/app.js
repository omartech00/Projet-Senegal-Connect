// src/app.js
// Rôle : configuration complète de l'application Express — middlewares,
// routers, (futurs) handlers d'erreurs. Exporte l'app SANS démarrer
// l'écoute réseau, pour que Supertest (Phase 32) puisse l'importer
// directement sans ouvrir de port.

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');

const routeHealth = require('./routes/health');
const routeAuth = require('./routes/auth');
const routeClients = require('./routes/clients');
const routeForfaits = require('./routes/forfaits');
const routeFactures = require('./routes/factures');
const routeTickets = require('./routes/tickets');
const routeStats = require('./routes/stats');

const app = express();

// --- Sécurité de base (avant tout le reste) ---
app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true,
  })
);
// --- Parsing du corps des requêtes ---
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// --- Logging HTTP ---
// Format 'dev' temporaire, en console directe. Remplacé par un stream
// vers Winston en Phase 10 (console colorée en dev, JSON en prod,
// muet en test) — sans changer la position de ce middleware.
if (env.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}
// --- Routes ---
app.use('/api/health', routeHealth);
app.use('/api/auth', routeAuth);
app.use('/api/clients', routeClients);
app.use('/api/forfaits', routeForfaits);
app.use('/api/factures', routeFactures);
app.use('/api/tickets', routeTickets);
app.use('/api/stats', routeStats);

// --- Swagger UI --- (montée en Phase 11)
// --- 404 + middleware d'erreurs global --- (montés en Phase 18,
// DOIVENT rester les tout derniers `app.use()` du fichier)
module.exports = app;
