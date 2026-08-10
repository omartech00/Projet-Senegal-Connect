// src/controllers/tickets.controller.js
// Rôle : lit req, appelle le service (identique à celui utilisé par
// Socket.IO), renvoie la réponse HTTP.

const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');
const { typeMessageDepuisMime } = require('../utils/typeFichier');
const ticketsService = require('../services/tickets.service');
const messagesService = require('../services/messages.service');
const appelsService = require('../services/appels.service');


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

async function historiqueMessages(req, res) {
  const messages = await messagesService.obtenirHistorique(req.params.id, req.user, req.query);
  res.status(200).json({ data: messages });
}

// Middleware (pas un controller classique) : vérifie l'accès au
// ticket AVANT que Multer ne traite le fichier. Appelle next() en
// cas de succès, laisse l'erreur remonter au middleware global sinon.
async function autoriserAccesTicket(req, res, next) {
  await ticketsService.obtenirTicketPourUtilisateur(req.params.id, req.user);
  next();
}

// Ne crée AUCUN message en base — reçoit juste le fichier, le stocke
// (déjà fait par Multer à ce stade), renvoie son URL. C'est le client
// qui, avec cette URL, émettra l'événement socket "fichier:partager"
// pour déclencher la création réelle du message (cf. section 2 de
// la Phase 22, décision actée depuis le cahier des charges).
async function uploaderFichier(req, res) {
  if (!req.file) {
    throw ApiError.badRequest('Aucun fichier reçu (champ attendu : "fichier")');
  }

  res.status(201).json({
    fichier_url: `/uploads/${req.file.filename}`,
    fichier_nom: req.file.originalname,
    fichier_taille: req.file.size,
    mime_type: req.file.mimetype,
    type_message: typeMessageDepuisMime(req.file.mimetype),
  });
}

async function historiqueAppels(req, res) {
  const appels = await appelsService.listerHistoriqueTicket(req.params.id, req.user);
  res.status(200).json({ data: appels });
}

module.exports = { lister, detail, creer, changerStatut, historiqueMessages, 
                    autoriserAccesTicket, uploaderFichier, historiqueAppels };