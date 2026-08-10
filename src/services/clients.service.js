// src/services/clients.service.js
// Rôle : logique métier CRUD clients — vérifications d'existence,
// règles "impossible de résilier/supprimer avec factures impayées",
// assemblage du détail enrichi (forfait + dernière facture + ticket
// en cours). Ne connaît jamais req/res.

const ApiError = require('../utils/ApiError');
const { reponsePaginee } = require('../utils/ApiResponse');
const clientsModel = require('../models/clients.model');
const utilisateursModel = require('../models/utilisateurs.model');
const forfaitsModel = require('../models/forfaits.model');

async function listerClients({ q, forfait_id, statut, page, limite }) {
  const pageNum = parseInt(page, 10) || 1;
  const limiteNum = parseInt(limite, 10) || 20;
  const filtres = { q, forfait_id, statut };

  const [total, data] = await Promise.all([
    clientsModel.compter(filtres),
    clientsModel.lister(filtres, { page: pageNum, limite: limiteNum }),
  ]);

  return reponsePaginee(data, { total, page: pageNum, limite: limiteNum });
}

async function obtenirDetailClient(id) {
  const client = await clientsModel.trouverParId(id);
  if (!client) throw ApiError.introuvable('Client introuvable');

  const [derniereFacture, ticketEnCours] = await Promise.all([
    clientsModel.trouverDerniereFacture(id),
    clientsModel.trouverTicketEnCours(id),
  ]);

  return { client, derniere_facture: derniereFacture, ticket_en_cours: ticketEnCours };
}

async function creerClient({ utilisateur_id, msisdn, forfait_id, statut }) {
  const utilisateur = await utilisateursModel.trouverParId(utilisateur_id);
  if (!utilisateur) throw ApiError.donneesInvalides([{ champ: 'utilisateur_id', message: 'Utilisateur introuvable', valeur: utilisateur_id }]);
  if (utilisateur.role !== 'client') {
    throw ApiError.donneesInvalides([{ champ: 'utilisateur_id', message: "L'utilisateur doit avoir le rôle client", valeur: utilisateur_id }]);
  }

  const clientExistant = await clientsModel.trouverParUtilisateurId(utilisateur_id);
  if (clientExistant) throw ApiError.conflit('Cet utilisateur a déjà une fiche client');

  if (forfait_id) {
    const forfait = await forfaitsModel.trouverParId(forfait_id);
    if (!forfait) throw ApiError.donneesInvalides([{ champ: 'forfait_id', message: 'Forfait introuvable', valeur: forfait_id }]);
  }

  try {
    return await clientsModel.creer({ utilisateur_id, msisdn, forfait_id, statut });
  } catch (erreur) {
    if (erreur.code === '23505') { // violation UNIQUE (msisdn) — filet de sécurité, la validation amont couvre déjà le cas courant
      throw ApiError.conflit('Ce MSISDN est déjà utilisé par un autre client');
    }
    throw erreur;
  }
}

async function modifierClient(id, { msisdn, forfait_id }) {
  const client = await clientsModel.trouverParId(id);
  if (!client) throw ApiError.introuvable('Client introuvable');

  if (forfait_id) {
    const forfait = await forfaitsModel.trouverParId(forfait_id);
    if (!forfait) throw ApiError.donneesInvalides([{ champ: 'forfait_id', message: 'Forfait introuvable', valeur: forfait_id }]);
  }

  try {
    return await clientsModel.mettreAJour(id, { msisdn, forfait_id });
  } catch (erreur) {
    if (erreur.code === '23505') {
      throw ApiError.conflit('Ce MSISDN est déjà utilisé par un autre client');
    }
    throw erreur;
  }
}

async function changerStatutClient(id, statut) {
  const client = await clientsModel.trouverParId(id);
  if (!client) throw ApiError.introuvable('Client introuvable');

  if (statut === 'resilie') {
    const impayees = await clientsModel.aFacturesImpayees(id);
    if (impayees) {
      throw ApiError.conflit('Impossible de résilier ce client : des factures sont impayées ou en retard');
    }
  }

  return clientsModel.mettreAJourStatut(id, statut);
}

async function supprimerClient(id) {
  const client = await clientsModel.trouverParId(id);
  if (!client) throw ApiError.introuvable('Client introuvable');

  const impayees = await clientsModel.aFacturesImpayees(id);
  if (impayees) {
    throw ApiError.conflit('Impossible de supprimer ce client : des factures sont impayées ou en retard');
  }

  await clientsModel.supprimer(id);
}

module.exports = {
  listerClients,
  obtenirDetailClient,
  creerClient,
  modifierClient,
  changerStatutClient,
  supprimerClient,
};
