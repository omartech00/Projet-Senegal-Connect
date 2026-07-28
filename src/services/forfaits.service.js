// src/services/forfaits.service.js
// Rôle : logique métier CRUD forfaits — règle "impossible de
// supprimer si clients ACTIFS abonnés" (409), assemblage du détail
// enrichi avec pagination des clients abonnés.

const ApiError = require('../utils/ApiError');
const { reponsePaginee } = require('../utils/ApiResponse');
const forfaitsModel = require('../models/forfaits.model');

async function listerForfaitsActifs() {
  return forfaitsModel.listerActifs();
}

async function obtenirDetailForfait(id, { page = 1, limite = 20 } = {}) {
  const forfait = await forfaitsModel.trouverParId(id);
  if (!forfait) throw ApiError.introuvable('Forfait introuvable');

  const pageNum = parseInt(page, 10) || 1;
  const limiteNum = parseInt(limite, 10) || 20;

  const [total, clients] = await Promise.all([
    forfaitsModel.compterClientsAbonnes(id),
    forfaitsModel.listerClientsAbonnes(id, { page: pageNum, limite: limiteNum }),
  ]);

  return {
    forfait,
    clients_abonnes: reponsePaginee(clients, { total, page: pageNum, limite: limiteNum }),
  };
}

async function creerForfait(donnees) {
  return forfaitsModel.creer(donnees);
}

async function modifierForfait(id, donnees) {
  const forfait = await forfaitsModel.trouverParId(id);
  if (!forfait) throw ApiError.introuvable('Forfait introuvable');
  return forfaitsModel.mettreAJour(id, donnees);
}

async function supprimerForfait(id) {
  const forfait = await forfaitsModel.trouverParId(id);
  if (!forfait) throw ApiError.introuvable('Forfait introuvable');

  // Règle métier : seuls les clients ACTIFS bloquent la suppression
  // (un historique de clients résiliés ne doit pas rendre un forfait
  // indéfiniment indélébile — décision actée en début de Phase 14).
  const nbActifs = await forfaitsModel.compterClientsAbonnes(id, { statutActifSeulement: true });
  if (nbActifs > 0) {
    throw ApiError.conflit(`Impossible de supprimer ce forfait : ${nbActifs} client(s) actif(s) y sont abonnés`);
  }

  await forfaitsModel.supprimer(id);
}

module.exports = {
  listerForfaitsActifs,
  obtenirDetailForfait,
  creerForfait,
  modifierForfait,
  supprimerForfait,
};
