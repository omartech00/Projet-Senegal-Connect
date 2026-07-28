// src/services/factures.service.js
// Rôle : logique métier factures — validation client_id existant
// (422, pas 404, cf. décision de phase), délégation de la génération
// de référence au model (dans sa transaction dédiée).

const ApiError = require('../utils/ApiError');
const { reponsePaginee } = require('../utils/ApiResponse');
const facturesModel = require('../models/factures.model');
const clientsModel = require('../models/clients.model');
const notifications = require('../socket/notifications');


async function listerFactures({ client_id, statut, periode, page, limite }) {
  const pageNum = parseInt(page, 10) || 1;
  const limiteNum = parseInt(limite, 10) || 20;
  const filtres = { client_id, statut, periode };
  const [total, data] = await Promise.all([
    facturesModel.compter(filtres),
    facturesModel.lister(filtres, { page: pageNum, limite: limiteNum }),
  ]);
  return reponsePaginee(data, { total, page: pageNum, limite: limiteNum });
}

async function obtenirFacture(id) {
  const facture = await facturesModel.trouverParId(id);
  if (!facture) throw ApiError.introuvable('Facture introuvable');
  return facture;
}

async function creerFacture({ client_id, periode, montant_fcfa, statut, date_echeance }) {
  const client = await clientsModel.trouverParId(client_id);
  if (!client) {
    throw ApiError.donneesInvalides([
      { champ: 'client_id', message: 'Client introuvable', valeur: client_id },
    ]);
  }

  const facture = await facturesModel.creerAvecReference({ client_id, periode, montant_fcfa, statut, date_echeance });

  notifications.notifier(
    client.utilisateur_id,
    'facture_emise',
    `Nouvelle facture ${facture.reference} de ${facture.montant_fcfa} FCFA`,
    { facture_id: facture.id, reference: facture.reference }
  );

  return facture;
}

async function changerStatutFacture(id, statut) {
  const facture = await facturesModel.trouverParId(id);
  if (!facture) throw ApiError.introuvable('Facture introuvable');

  const factureMaj = await facturesModel.mettreAJourStatut(id, statut);

  if (statut === 'en_retard') {
    const client = await clientsModel.trouverParId(facture.client_id);
    if (client) {
      notifications.notifier(
        client.utilisateur_id,
        'facture_en_retard',
        `Votre facture ${facture.reference} est maintenant en retard`,
        { facture_id: facture.id, reference: facture.reference }
      );
    }
  }
  return factureMaj;
}

async function supprimerFacture(id) {
  const facture = await facturesModel.trouverParId(id);
  if (!facture) throw ApiError.introuvable('Facture introuvable');
  await facturesModel.supprimer(id);
}
module.exports = {
  listerFactures,
  obtenirFacture,
  creerFacture,
  changerStatutFacture,
  supprimerFacture,
};
