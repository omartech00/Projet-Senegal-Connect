// src/app.js
// Rôle : configuration complète de l'application Express — middlewares,
// routers, (futurs) handlers d'erreurs. Exporte l'app SANS démarrer
// l'écoute réseau, pour que Supertest (Phase 32) puisse l'importer
// directement sans ouvrir de port.
const logger = require('./config/logger');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const swaggerUi = require('swagger-ui-express');
const specificationSwagger = require('./config/swagger');
const { gestionnaireErreurs, gestion404 } = require('./middleware/erreurs');

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
// Morgan délègue tous ses logs à Winston (niveau "http") via
// logger.stream. Le silence en test est géré par Winston lui-même
// (option `silent`), pas par une condition ici.
app.use(morgan(':method :url :status :response-time ms', { stream: logger.stream }));


// --- Routes ---
app.use('/api/health', routeHealth);
app.use('/api/auth', routeAuth);
app.use('/api/clients', routeClients);
app.use('/api/forfaits', routeForfaits);
app.use('/api/factures', routeFactures);
app.use('/api/tickets', routeTickets);
app.use('/api/stats', routeStats);

// --- Fichiers uploadés (chat) ---
// Sert les fichiers partagés en chat. Les noms UUID (middleware/
// upload.js) empêchent de deviner l'URL d'un fichier d'un autre ticket.
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));


// --- Documentation Swagger/OpenAPI ---
// helmet() reste actif partout ailleurs ; on désactive seulement la CSP
// sur cette route précise, car Swagger UI a besoin de scripts inline
// pour s'afficher — pas de relâchement de sécurité sur le reste de l'API.
app.use(
  '/api/docs',
  helmet({ contentSecurityPolicy: false }),
  swaggerUi.serve,
  swaggerUi.setup(specificationSwagger, {
    customSiteTitle: 'Sénégal Connect — Documentation API',
  })
);

// Export brut de la spec, importable dans Postman/Insomnia
app.get('/api/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(specificationSwagger);
});

//------------peerjs-------
app.use('/peerjs', (req, res, next) => {
  if (app.locals.peerServer) {
    return app.locals.peerServer.handle(req, res, next);
  }
  return next();
});
//------------peerjs- FIN------

// --- Route inconnue (404) ---
// Doit être monté après TOUTES les routes déclarées ci-dessus, sinon
// il intercepterait des requêtes valides avant leur vraie route.
app.use(gestion404);

// --- Middleware d'erreurs global ---
// Version complète depuis la Phase 17 : conversion des codes
// PostgreSQL 23505/23503, masquage de la stack trace en production.
// DOIT rester le tout dernier app.use() du fichier.
app.use(gestionnaireErreurs);


module.exports = app;
