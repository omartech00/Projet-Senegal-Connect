// src/middleware/auth.js
// Rôle : verifierJWT() authentifie une requête via le header
// Authorization: Bearer <token>. garderRole(...roles) contrôle
// l'autorisation UNE FOIS l'utilisateur déjà authentifié.
// Les deux fonctions passent par next(ApiError) plutôt que de
// répondre directement — c'est le middleware d'erreurs global qui
// traduit ApiError en réponse JSON avec le bon code HTTP.

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

function verifierJWT(req, res, next) {
  const entete = req.headers.authorization;

  if (!entete || !entete.startsWith('Bearer ')) {
    return next(ApiError.nonAuthentifie('Token manquant'));
  }

  const token = entete.slice(7); // retire "Bearer "

  try {
    const payload = jwt.verify(token, env.jwt.secret, { issuer: 'senegal-connect' });
    req.user = payload; // { id, nom, email, role, iat, exp, iss }
    return next();
  } catch (erreur) {
    if (erreur.name === 'TokenExpiredError') {
      logger.warn(`[auth] Token expiré — ${req.method} ${req.originalUrl}`);
      return next(ApiError.nonAuthentifie('Token expiré — veuillez vous reconnecter'));
    }
    // Toute autre erreur jwt.verify (signature invalide, malformé, issuer incorrect...)
    logger.warn(`[auth] Token invalide — ${req.method} ${req.originalUrl}`);
    return next(ApiError.nonAuthentifie('Token invalide'));
  }
}

/**
 * garderRole('admin', 'agent') — à utiliser APRÈS verifierJWT sur la
 * même chaîne de middlewares, puisqu'il lit req.user.role.
 */
function garderRole(...rolesAutorises) {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.nonAuthentifie('Non authentifié'));
    }
    if (!rolesAutorises.includes(req.user.role)) {
      return next(ApiError.interdit(`Accès réservé aux rôles : ${rolesAutorises.join(', ')}`));
    }
    return next();
  };
}

module.exports = { verifierJWT, garderRole };
