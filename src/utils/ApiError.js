// src/utils/ApiError.js
// Rôle : représenter une erreur métier ou HTTP de façon uniforme.
// Pourquoi : les services lèvent des ApiError plutôt que des Error
// génériques, ce qui permet au middleware d'erreurs global (Phase 18)
// de savoir exactement quel code HTTP renvoyer, sans avoir à
// interpréter un message texte au cas par cas.

class ApiError extends Error {
  /**
   * @param {number} statusCode - code HTTP à renvoyer
   * @param {string} message - message d'erreur, affiché au client
   * @param {Array<{champ:string, message:string, valeur:any}>|null} erreurs
   *        - détail par champ, utilisé pour les 422 (express-validator)
   */
  constructor(statusCode, message, erreurs = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.erreurs = erreurs;
  }

  static badRequest(message = 'Requête malformée') {
    return new ApiError(400, message);
  }

  static nonAuthentifie(message = 'Non authentifié') {
    return new ApiError(401, message);
  }

  static interdit(message = 'Accès refusé') {
    return new ApiError(403, message);
  }

  static introuvable(message = 'Ressource introuvable') {
    return new ApiError(404, message);
  }

  static conflit(message) {
    return new ApiError(409, message);
  }

  static donneesInvalides(erreurs) {
    return new ApiError(422, 'Données invalides', erreurs);
  }
}

module.exports = ApiError;
