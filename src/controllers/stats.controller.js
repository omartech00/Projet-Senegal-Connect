// src/controllers/stats.controller.js
// Rôle : lit req (aucun paramètre ici), appelle le service, renvoie
// la réponse HTTP.

const statsService = require('../services/stats.service');

async function tableauDeBord(req, res) {
  const stats = await statsService.obtenirStats();
  res.status(200).json({ data: stats });
}

module.exports = { tableauDeBord };
