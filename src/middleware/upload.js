// src/middleware/upload.js
// Rôle : configuration Multer — stockage disque avec nom UUID,
// filtre des types MIME autorisés, limite de taille (10 Mo, env.
// maxFileSize défini en Phase 4).

const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { estAutorise } = require('../utils/typeFichier');

const stockage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname);
    cb(null, `${uuidv4()}${extension}`);
  },
});

function filtreFichier(req, file, cb) {
  if (!estAutorise(file.mimetype)) {
    return cb(ApiError.badRequest(
      `Type de fichier non autorisé : ${file.mimetype}. Types acceptés : JPEG, PNG, PDF, MP3, WAV, OGG.`
    ));
  }
  cb(null, true);
}

const upload = multer({
  storage: stockage,
  fileFilter: filtreFichier,
  limits: { fileSize: env.maxFileSize },
});

module.exports = { upload };
