// src/controllers/tickets.controller.js
// Rôle : lit req, appelle le service (identique à celui utilisé par
// Socket.IO), renvoie la réponse HTTP.

const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');
const ticketsService = require('../services/tickets.service');

function formaterErreursValidation(req) {
  const resultat = validationResult(req);
  if (resultat.isEmpty()) return null;
  return resultat.array().map((e) => ({ champ: e.path, message: e.msg, valeur: e.value }));
}

async function lister(req, res) {
  const tickets = await ticketsService.listerTicketsPourUtilisateur(req.user);
  res.status(200).json({ data: tickets });
}

async function detail(req, res) {
  const ticket = await ticketsService.obtenirTicketPourUtilisateur(req.params.id, req.user);
  res.status(200).json({ ticket });
}

async function creer(req, res) {
  const erreurs = formaterErreursValidation(req);
  if (erreurs) throw ApiError.donneesInvalides(erreurs);

  const ticket = await ticketsService.ouvrirTicket({ utilisateurId: req.user.id, sujet: req.body.sujet });
  res.status(201).json({ ticket });
}

async function changerStatut(req, res) {
  const erreurs = formaterErreursValidation(req);
  if (erreurs) throw ApiError.donneesInvalides(erreurs);

  const { statut } = req.body;
  let ticket;

  if (statut === 'en_cours') {
    ticket = await ticketsService.assignerTicket(req.params.id, req.user.id);
  } else if (statut === 'ferme') {
    ticket = await ticketsService.fermerTicket(req.params.id, req.user);
  } else {
    throw ApiError.donneesInvalides([
      { champ: 'statut', message: 'Transition non supportée via cet endpoint', valeur: statut },
    ]);
  }

  res.status(200).json({ ticket });
}

module.exports = { lister, detail, creer, changerStatut };
