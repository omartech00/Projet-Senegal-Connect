// src/config/env.js
// Rôle : point d'entrée UNIQUE de lecture des variables d'environnement.
// Pourquoi : centraliser la validation évite les `process.env.X` dispersés
// et garantit un échec immédiat et explicite si une variable critique manque.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Variables obligatoires : sans elles, l'application ne doit jamais démarrer.
const obligatoires = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS', 'JWT_SECRET'];

const manquantes = obligatoires.filter((cle) => !process.env[cle]);

if (manquantes.length > 0) {
  // On ne log pas encore avec Winston ici : le logger dépend lui-même
  // potentiellement de env.js, donc on utilise console.error volontairement,
  // avant même que le reste de l'app ne s'initialise.
  console.error(
    `[env] Variables d'environnement manquantes : ${manquantes.join(', ')}. ` +
    `Vérifie ton fichier .env (copie .env.example si besoin).`
  );
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 64) {
  console.error(
    '[env] JWT_SECRET doit contenir au moins 64 caractères (exigence de sécurité M2).'
  );
  process.exit(1);
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,

  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  logLevel: process.env.LOG_LEVEL || 'debug',

  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean),

  maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10485760,
};
