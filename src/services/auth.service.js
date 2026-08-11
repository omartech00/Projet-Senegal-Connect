// src/services/auth.service.js
// Rôle : logique métier de l'authentification — hachage, comparaison,
// génération JWT, règle "role toujours client à l'inscription".
// Ne connaît jamais req/res.

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const utilisateursModel = require('../models/utilisateurs.model');
const clientsModel = require('../models/clients.model');

const COUT_BCRYPT = 12; // exigence M2 : facteur de coût >= 12

async function inscrire({ nom, prenom, email, motDePasse }) {
  const existant = await utilisateursModel.trouverParEmail(email);
  if (existant) {
    throw ApiError.conflit('Un compte existe déjà avec cet email');
  }

  // Décision actée en Phase 0/7 : l'inscription publique crée TOUJOURS
  // un compte role="client", quoi que le body contienne — les comptes
  // agent/admin sont créés uniquement via seed SQL (docs/schema.sql).
  const motDePasseHache = await bcrypt.hash(motDePasse, COUT_BCRYPT);
  const utilisateur = await utilisateursModel.creer({ nom, prenom, email, motDePasseHache, role: 'client' });

  // La fiche "clients" est obligatoire pour ouvrir un ticket
  // (tickets.service.js) et pour lister ses tickets. /auth/register
  // n'expose volontairement pas de champ msisdn (décision Phase 30) :
  // on génère donc un numéro déterministe et unique à partir de l'id
  // utilisateur — l'admin pourra le corriger via /api/clients.
  const msisdn = `+2217${String(utilisateur.id).padStart(8, '0')}`;
  await clientsModel.creer({ utilisateur_id: utilisateur.id, msisdn });

  return utilisateur;
}

function genererToken(utilisateur) {
  return jwt.sign(
    { id: utilisateur.id, nom: utilisateur.nom, email: utilisateur.email, role: utilisateur.role },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn, issuer: 'senegal-connect' }
  );
}

async function connecter({ email, motDePasse }) {
  const MESSAGE_GENERIQUE = 'Identifiants incorrects';
  const utilisateur = await utilisateursModel.trouverParEmail(email);

  if (!utilisateur) {
    logger.warn(`[auth] Connexion refusée (email inconnu) : ${email}`);
    throw ApiError.nonAuthentifie(MESSAGE_GENERIQUE);
  }

  const motDePasseValide = await bcrypt.compare(motDePasse, utilisateur.mot_de_passe);
  if (!motDePasseValide) {
    logger.warn(`[auth] Connexion refusée (mot de passe incorrect) : ${email}`);
    throw ApiError.nonAuthentifie(MESSAGE_GENERIQUE);
  }

  return {
    token: genererToken(utilisateur),
    expires_in: env.jwt.expiresIn,
    utilisateur: {
      id: utilisateur.id,
      nom: utilisateur.nom,
      email: utilisateur.email,
      role: utilisateur.role,
    },
  };
}

async function obtenirProfil(idUtilisateur) {
  const utilisateur = await utilisateursModel.trouverParId(idUtilisateur);
  if (!utilisateur) {
    throw ApiError.introuvable('Utilisateur introuvable');
  }
  return utilisateur;
}

module.exports = { inscrire, connecter, obtenirProfil };
