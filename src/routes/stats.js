// src/routes/stats.js
// Rôle : déclare GET /api/stats — réservé au rôle admin (colonne
// Auth = "Admin" dans le tableau M1 du PDF).

const express = require('express');
const router = express.Router();

const statsController = require('../controllers/stats.controller');
const asyncHandler = require('../utils/asyncHandler');
const { verifierJWT, garderRole } = require('../middleware/auth');

/**
 * @openapi
 * /api/stats:
 *   get:
 *     summary: Tableau de bord administrateur
 *     description: >
 *       Agrégations calculées en une seule requête SQL : clients actifs,
 *       MRR (revenu récurrent mensuel des clients actifs, basé sur leur
 *       forfait), factures impayées ou en retard, tickets au statut "ouvert".
 *     tags: [Stats]
 *     responses:
 *       200:
 *         description: Statistiques du tableau de bord
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     clients_actifs: { type: integer, example: 3 }
 *                     mrr_fcfa: { type: number, example: 22000 }
 *                     factures_impayees: { type: integer, example: 1 }
 *                     tickets_ouverts: { type: integer, example: 0 }
 *       403:
 *         description: Accès réservé à l'admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.get('/', verifierJWT, garderRole('admin'), asyncHandler(statsController.tableauDeBord));

module.exports = router;
