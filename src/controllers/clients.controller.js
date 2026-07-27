// src/controllers/clients.controller.js
// Rôle : lit req, formate les erreurs de validation, appelle le
// service, renvoie la réponse HTTP. Aucun SQL, aucune règle métier.

const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');
const clientsService = require('../services/clients.service');

function formaterErreursValidation(req) {
  const resultat = validationResult(req);
  if (resultat.isEmpty()) return null;
  return resultat.array().map((e) => ({ champ: e.path, message: e.msg, valeur: e.value }));
}

async function lister(req, res) {
  const resultat = await clientsService.listerClients(req.query);
  res.status(200).json(resultat);
}

async function detail(req, res) {
  const resultat = await clientsService.obtenirDetailClient(req.params.id);
  res.status(200).json(resultat);
}

async function creer(req, res) {
  const erreurs = formaterErreursValidation(req);
  if (erreurs) throw ApiError.donneesInvalides(erreurs);

  const client = await clientsService.creerClient(req.body);
  res.status(201).json({ client });
}

async function modifier(req, res) {
  const erreurs = formaterErreursValidation(req);
  if (erreurs) throw ApiError.donneesInvalides(erreurs);
  
  const client = await clientsService.modifierClient(req.params.id, req.body);
  res.status(200).json({ client });
}

async function changerStatut(req, res) {
  const erreurs = formaterErreursValidation(req);
  if (erreurs) throw ApiError.donneesInvalides(erreurs);

  const client = await clientsService.changerStatutClient(req.params.id, req.body.statut);
  res.status(200).json({ client });
}

async function supprimer(req, res) {
  await clientsService.supprimerClient(req.params.id);
  res.status(204).send();
}

module.exports = { lister, detail, creer, modifier, changerStatut, supprimer };
