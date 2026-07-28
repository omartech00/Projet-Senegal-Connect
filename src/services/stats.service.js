// src/services/stats.service.js
// Rôle : couche de service pour homogénéité architecturale (Phase 8)
// — ici la logique est entièrement portée par la requête SQL, ce
// fichier reste volontairement mince, juste un passe-plat documenté.

const statsModel = require('../models/stats.model');

async function obtenirStats() {
  return statsModel.obtenirTableauDeBord();
}

module.exports = { obtenirStats };
