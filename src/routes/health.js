const express = require('express');
const router = express.Router();
const { query } = require('../config/db');

router.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({
      statut: 'ok',
      version: require('../../package.json').version,
      uptime: Math.floor(process.uptime()),
      env: process.env.NODE_ENV || 'development',
    });
  } catch (err) {
    res.status(503).json({
      statut: 'erreur',
      version: require('../../package.json').version,
      uptime: Math.floor(process.uptime()),
      env: process.env.NODE_ENV || 'development',
    });
  }
});

module.exports = router;
