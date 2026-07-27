// src/middleware/erreurs.js
// Rôle : middleware d'erreurs global (4 paramètres, Express le reconnaît
// comme error handler grâce à cette signature exacte).
// VERSION MINIMALE ajoutée dès la Phase 12 pour rendre les codes HTTP de
// l'auth corrects immédiatement. Complétée en Phase 18 avec les codes
// PostgreSQL 23505/23503, le handler 404 dédié, et le masquage de la
// stack trace en production (déjà partiellement géré ci-dessous).

const logger = require('../config/logger');
const env = require('../config/env');
function gestionnaireErreurs(err, req, res, next) { // eslint-disable-line no-unused-vars
  const statusCode = err.statusCode || 500;
  if (statusCode >= 500) {
    logger.error(`[erreurs] ${req.method} ${req.originalUrl} — ${err.message}`);
  }
  const reponse = { message: err.message || 'Erreur interne du serveur' };
  if (err.erreurs) {
    reponse.erreurs = err.erreurs; // liste [{champ, message, valeur}] pour les 422
  }
  // Ne jamais exposer la stack trace ni le message brut d'une erreur
  // non gérée (500) en production.
  if (statusCode >= 500 && env.nodeEnv === 'production') {
    reponse.message = 'Erreur interne du serveur';
  }
  res.status(statusCode).json(reponse);
}
module.exports = gestionnaireErreurs;
