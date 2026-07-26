// src/routes/health.js
// Rôle : endpoint de supervision, utilisé par le HEALTHCHECK Docker
// (Phase 30) et comme premier test de bout en bout du serveur.
// Pas de dépendance à la BDD ni à l'auth — doit répondre même si
// PostgreSQL est temporairement indisponible, pour que Docker
// distingue "le process Node est mort" de "la BDD est down".

const express = require('express');
const router = express.Router();
const { version } = require('../../package.json');
const env = require('../config/env');

router.get('/', (req, res) => {
  res.status(200).json({
    statut: 'ok',
    version,
    uptime: process.uptime(),
    env: env.nodeEnv,
  });
});

module.exports = router;
