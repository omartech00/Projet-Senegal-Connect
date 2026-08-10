// src/middleware/erreurs.js
// Rôle : middleware d'erreurs global (4 paramètres, signature reconnue
// par Express comme error handler) + handler 404 dédié.
// Convertit automatiquement les codes d'erreur PostgreSQL non déjà
// gérés localement par un service (23505→409, 23503→422), pour que
// TOUTE erreur de contrainte BDD produise un message explicite et
// un code HTTP correct, même si un service futur oublie son propre
// try/catch (défense en profondeur, complète celle déjà en place
// dans clients.service.js et forfaits.service.js depuis les Phases 13-14).

const logger = require('../config/logger');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * Extrait le nom du champ en cause depuis le message `detail` que
 * PostgreSQL fournit sur les violations de contrainte, ex :
 * "Key (msisdn)=(+221771234501) already exists."
 * Retourne null si le format est inattendu (defensive, pas de crash).
 */
function extraireChampDepuisDetail(detail) {
  if (!detail) return null;
  const correspondance = detail.match(/Key \(([^)]+)\)=/);
  return correspondance ? correspondance[1] : null;
}

/**
 * Convertit un code d'erreur PostgreSQL en ApiError avec le bon code
 * HTTP. Retourne null si le code n'est pas un de ceux qu'on gère
 * explicitement (l'erreur d'origine reste alors une 500).
 */
function convertirErreurPostgres(erreurPostgres) {
  const champ = extraireChampDepuisDetail(erreurPostgres.detail) || 'inconnu';

  if (erreurPostgres.code === '23505') {
    // Violation UNIQUE (ex: msisdn, email, reference déjà utilisés)
    return ApiError.conflit(`La valeur du champ "${champ}" existe déjà (doublon)`);
  }

  if (erreurPostgres.code === '23503') {
    // Violation de clé étrangère (ex: client_id ou forfait_id inexistant)
    return ApiError.donneesInvalides([
      { champ, message: 'Référence invalide : la ressource liée n\'existe pas', valeur: null },
    ]);
  }

  return null;
}

/**
 * Handler 404 — monté juste après TOUTES les routes de l'API,
 * juste avant le handler d'erreurs global. Toute requête qui arrive
 * ici n'a matché aucune route déclarée dans app.js.
 */
function gestion404(req, res) {
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} introuvable` });
}

/**
 * Handler d'erreurs global — DOIT rester le tout dernier app.use()
 * de app.js. La signature à 4 paramètres (même si `next` n'est pas
 * appelé) est ce qui indique à Express qu'il s'agit d'un error handler.
 */
function gestionnaireErreurs(err, req, res, next) { // eslint-disable-line no-unused-vars
  let erreur = err;

  // Erreur Multer (ex: fichier trop volumineux) — pas de statusCode
  // natif, converti en 400 explicite (ajouté en Phase 22).
  if (!err.statusCode && err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      erreur = ApiError.badRequest('Fichier trop volumineux (10 Mo maximum)');
    } else {
      erreur = ApiError.badRequest(`Erreur d'upload : ${err.message}`);
    }
  }

  // Si l'erreur vient directement de PostgreSQL (code à 5 chiffres,

  // pas encore transformée en ApiError par un service) et qu'aucun
  // ApiError explicite n'a déjà fixé de statusCode, on la convertit ici.
  if (!err.statusCode && err.code) {
    const convertie = convertirErreurPostgres(err);
    if (convertie) {
      logger.warn(`[erreurs] Postgres ${err.code} converti → ${convertie.statusCode} (${convertie.message})`);
      erreur = convertie;
    }
  }

  const statusCode = erreur.statusCode || 500;

  if (statusCode >= 500) {
    logger.error(`[erreurs] ${req.method} ${req.originalUrl} — ${erreur.message}`);
  }

  const reponse = { message: erreur.message || 'Erreur interne du serveur' };
  if (erreur.erreurs) {
    reponse.erreurs = erreur.erreurs; // liste [{champ, message, valeur}] pour les 422
  }

  // Ne jamais exposer le message brut ni la stack trace d'une erreur
  // non gérée (500) en production.
  if (statusCode >= 500 && env.nodeEnv === 'production') {
    reponse.message = 'Erreur interne du serveur';
  }

  res.status(statusCode).json(reponse);
}

module.exports = { gestionnaireErreurs, gestion404 };
