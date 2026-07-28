// src/controllers/factures.controller.js
// Rôle : lit req, appelle le service, renvoie la réponse HTTP.

const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');
const facturesService = require('../services/factures.service');

function formaterErreursValidation(req) {
  const resultat = validationResult(req);
  if (resultat.isEmpty()) return null;
  return resultat.array().map((e) => ({ champ: e.path, message: e.msg, valeur: e.value }));
}

async function lister(req, res) {
  const resultat = await facturesService.listerFactures(req.query);
  res.status(200).json(resultat);
}

async function detail(req, res) {
  const facture = await facturesService.obtenirFacture(req.params.id);
  res.status(200).json({ facture });
}

async function creer(req, res) {
  const erreurs = formaterErreursValidation(req);
  if (erreurs) throw ApiError.donneesInvalides(erreurs);

  const facture = await facturesService.creerFacture(req.body);
  res.status(201).json({ facture });
}

async function changerStatut(req, res) {
  const erreurs = formaterErreursValidation(req);
  if (erreurs) throw ApiError.donneesInvalides(erreurs);

  const facture = await facturesService.changerStatutFacture(req.params.id, req.body.statut);
  res.status(200).json({ facture });
}

async function supprimer(req, res) {
  await facturesService.supprimerFacture(req.params.id);
  res.status(204).send();
}

module.exports = { lister, detail, creer, changerStatut, supprimer };
