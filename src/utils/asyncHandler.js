// src/utils/asyncHandler.js
// Rôle : envelopper les controllers async pour que toute erreur
// (rejet de promesse) soit automatiquement transmise à next(),
// sans try/catch répété dans chaque fonction de controller.
// Utilisation : router.get('/x', asyncHandler(monController.lister));

function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
