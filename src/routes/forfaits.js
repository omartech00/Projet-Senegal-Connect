// src/routes/forfaits.js
// Rôle : déclare les 4 routes /api/forfaits. GET non protégés
// (public), écriture réservée à l'admin.

const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const forfaitsController = require('../controllers/forfaits.controller');
const asyncHandler = require('../utils/asyncHandler');
const { verifierJWT, garderRole } = require('../middleware/auth');

const validationForfait = [
  body('nom').trim().notEmpty().withMessage('Le nom est requis'),
  body('quota_data_go').isFloat({ min: 0 }).withMessage('quota_data_go doit être >= 0'),
  body('quota_voix_min').isInt({ min: 0 }).withMessage('quota_voix_min doit être >= 0'),
  body('prix_mensuel_fcfa').isFloat({ gt: 0 }).withMessage('prix_mensuel_fcfa doit être > 0'),
  body('actif').optional().isBoolean().withMessage('actif doit être un booléen'),
];

const validationId = [param('id').isInt().withMessage('id doit être un entier')];

/**
 * @openapi
 * /api/forfaits:
 *   get:
 *     summary: Liste des forfaits actifs avec nombre d'abonnés
 *     tags: [Forfaits]
 *     security: []
 *     responses:
 *       200:
 *         description: Liste des forfaits actifs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Forfait' }
 */
router.get('/', asyncHandler(forfaitsController.lister));

/**
 * @openapi
 * /api/forfaits/{id}:
 *   get:
 *     summary: Détail d'un forfait + liste paginée des clients abonnés
 *     tags: [Forfaits]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limite
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Forfait trouvé }
 *       404:
 *         description: Forfait introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.get('/:id', validationId, asyncHandler(forfaitsController.detail));

/**
 * @openapi
 * /api/forfaits:
 *   post:
 *     summary: Créer un forfait (admin)
 *     tags: [Forfaits]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, quota_data_go, quota_voix_min, prix_mensuel_fcfa]
 *             properties:
 *               nom: { type: string, example: "Sénégal Connect Max" }
 *               quota_data_go: { type: number, example: 30 }
 *               quota_voix_min: { type: integer, example: 500 }
 *               prix_mensuel_fcfa: { type: number, example: 15000 }
 *               actif: { type: boolean, example: true }
 *     responses:
 *       201: { description: Forfait créé }
 *       422:
 *         description: Données invalides (prix <= 0 ou quota < 0)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.post('/', verifierJWT, garderRole('admin'), validationForfait, asyncHandler(forfaitsController.creer));

/**
 * @openapi
 * /api/forfaits/{id}:
 *   put:
 *     summary: Modifier un forfait (admin)
 *     tags: [Forfaits]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, quota_data_go, quota_voix_min, prix_mensuel_fcfa]
 *     responses:
 *       200: { description: Forfait modifié }
 *       404:
 *         description: Forfait introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.put('/:id', verifierJWT, garderRole('admin'), validationId, validationForfait, asyncHandler(forfaitsController.modifier));

/**
 * @openapi
 * /api/forfaits/{id}:
 *   delete:
 *     summary: Supprimer un forfait (admin)
 *     description: Impossible (409) si des clients ACTIFS sont abonnés à ce forfait.
 *     tags: [Forfaits]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204: { description: Forfait supprimé }
 *       409:
 *         description: Des clients actifs sont abonnés
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.delete('/:id', verifierJWT, garderRole('admin'), validationId, asyncHandler(forfaitsController.supprimer));

module.exports = router;
