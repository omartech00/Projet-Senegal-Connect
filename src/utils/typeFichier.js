// src/utils/typeFichier.js
// Rôle : source de vérité UNIQUE pour la correspondance MIME → type
// de message. Utilisé à la fois par le filtre Multer (types acceptés
// à l'upload) et par messages.service.js (type de message à insérer),
// pour ne jamais avoir deux listes qui divergent.

const TYPES_AUTORISES = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'application/pdf': 'fichier',
  'audio/mpeg': 'audio',
  'audio/wav': 'audio',
  'audio/x-wav': 'audio',
  'audio/ogg': 'audio',
};

function estAutorise(mimetype) {
  return Boolean(TYPES_AUTORISES[mimetype]);
}

function typeMessageDepuisMime(mimetype) {
  return TYPES_AUTORISES[mimetype] || 'fichier';
}

module.exports = { TYPES_AUTORISES, estAutorise, typeMessageDepuisMime };
