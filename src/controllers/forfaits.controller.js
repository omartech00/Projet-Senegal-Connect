// src/controllers/forfaits.controller.js
// Rôle : lit req, appelle le service, renvoie la réponse HTTP.

const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');
const forfaitsService = require('../services/forfaits.service');

function formaterErreursValidation(req) {
  const resultat = validationResult(req);
  if (resultat.isEmpty()) return null;
  return resultat.array().map((e) => ({ champ: e.path, message: e.msg, valeur: e.value }));
}

async function lister(req, res) {
  const forfaits = await forfaitsService.listerForfaitsActifs();
  res.status(200).json({ data: forfaits });
}

async function detail(req, res) {
  const resultat = await forfaitsService.obtenirDetailForfait(req.params.id, req.query);
  res.status(200).json(resultat);
}

async function creer(req, res) {
  const erreurs = formaterErreursValidation(req);
  if (erreurs) throw ApiError.donneesInvalides(erreurs);

  const forfait = await forfaitsService.creerForfait(req.body);
  res.status(201).json({ forfait });
}

async function modifier(req, res) {
  const erreurs = formaterErreursValidation(req);
  if (erreurs) throw ApiError.donneesInvalides(erreurs);

  const forfait = await forfaitsService.modifierForfait(req.params.id, req.body);
  res.status(200).json({ forfait });
}

async function supprimer(req, res) {
  await forfaitsService.supprimerForfait(req.params.id);
  res.status(204).send();
}

module.exports = { lister, detail, creer, modifier, supprimer };
