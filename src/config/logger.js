// src/config/logger.js
// Rôle : logger unique de l'application (Winston). Morgan délègue
// ses logs HTTP ici via `logger.stream`. Comportement piloté par
// NODE_ENV : console colorée en dev, fichiers JSON en prod, silence
// total en test (pour ne pas polluer la sortie de `npm test`).

const winston = require('winston');
const path = require('path');
const env = require('./env');

winston.addColors(winston.config.npm.colors);

// --- Format développement : console colorée, timestamp HH:mm:ss ---
const formatDev = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}] ${message}`)
);

// --- Format production : JSON structuré, horodatage complet ---
const formatProd = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

function construireTransports() {
  if (env.nodeEnv === 'production') {
    return [
      new winston.transports.File({
        filename: path.join(__dirname, '../../logs/error.log'),
        level: 'error',
        format: formatProd,
      }),
      new winston.transports.File({
        filename: path.join(__dirname, '../../logs/combined.log'),
        format: formatProd,
      }),
    ];
  }

  // Développement (et tout environnement non-production, hors test)
  return [
    new winston.transports.Console({
      format: formatDev,
    }),
  ];
}

const logger = winston.createLogger({
  level: env.logLevel, // 'debug' par défaut (Phase 4) — requêtes SQL visibles en dev
  silent: env.nodeEnv === 'test', // AUCUN log affiché pendant `npm test`
  transports: construireTransports(),
});

// Interface attendue par Morgan : un objet avec une méthode write().
// Morgan appelle stream.write(message) avec un \n final à retirer.
logger.stream = {
  write: (message) => logger.http(message.trim()),
};

module.exports = logger;
