// src/controllers/auth.controller.js
// Rôle : lit req, formate les erreurs de validation, appelle le
// service, renvoie la réponse HTTP. Aucun SQL ici.

const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');
const authService = require('../services/auth.service');

function formaterErreursValidation(req) {
  const resultat = validationResult(req);
  if (resultat.isEmpty()) return null;
  return resultat.array().map((e) => ({ champ: e.path, message: e.msg, valeur: e.value }));
}

async function register(req, res) {
  const erreurs = formaterErreursValidation(req);
  if (erreurs) throw ApiError.donneesInvalides(erreurs);

  const { nom, prenom, email, mot_de_passe } = req.body;
  const utilisateur = await authService.inscrire({ nom, prenom, email, motDePasse: mot_de_passe });

  res.status(201).json({ utilisateur });
}

async function login(req, res) {
  const erreurs = formaterErreursValidation(req);
  if (erreurs) throw ApiError.donneesInvalides(erreurs);

  const { email, mot_de_passe } = req.body;
  const resultat = await authService.connecter({ email, motDePasse: mot_de_passe });

  res.status(200).json(resultat);
}

async function profil(req, res) {
  const utilisateur = await authService.obtenirProfil(req.user.id);
  res.status(200).json({ utilisateur });
}

module.exports = { register, login, profil };
