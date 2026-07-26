// src/utils/ApiResponse.js
// Rôle : centraliser le format exact des réponses de succès imposé
// par le cahier des charges : { data, pagination } pour les listes,
// { token, expires_in, utilisateur } pour l'auth, etc.
// Pourquoi : éviter que chaque controller invente sa propre forme
// de réponse JSON, ce qui casserait la cohérence documentée dans
// Swagger (Phase 11) et attendue par les tests Jest (Phase 32).

/**
 * Formate une réponse de liste paginée.
 * @param {Array} data
 * @param {{total:number, page:number, limite:number}} pagination
 */
function reponsePaginee(data, { total, page, limite }) {
  return {
    data,
    pagination: {
      total,
      page,
      limite,
      total_pages: Math.ceil(total / limite) || 0,
    },
  };
}

module.exports = { reponsePaginee };
