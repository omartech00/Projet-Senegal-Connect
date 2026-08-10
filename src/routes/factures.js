// src/routes/factures.js
// Rôle : déclare les routes /api/factures — lecture JWT, écriture admin.

const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

const facturesController = require('../controllers/factures.controller');
const asyncHandler = require('../utils/asyncHandler');
const { verifierJWT, garderRole } = require('../middleware/auth');

const REGEX_PERIODE = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

const validationCreation = [
  body('client_id').isInt().withMessage('client_id doit être un entier'),
  body('periode').matches(REGEX_PERIODE).withMessage('Format attendu : YYYY-MM'),
  body('montant_fcfa').isFloat({ min: 0 }).withMessage('montant_fcfa doit être >= 0'),
  body('statut').optional().isIn(['payee', 'impayee', 'en_retard']).withMessage('Statut invalide'),
  body('date_echeance').isISO8601().withMessage('date_echeance doit être une date valide'),
];

const validationStatut = [
  body('statut').isIn(['payee', 'impayee', 'en_retard']).withMessage('Statut invalide'),
];

const validationId = [param('id').isInt().withMessage('id doit être un entier')];
const validationFiltres = [
  query('periode').optional().matches(REGEX_PERIODE).withMessage('Format attendu : YYYY-MM'),
  query('statut').optional().isIn(['payee', 'impayee', 'en_retard']).withMessage('Statut invalide'),
];

/**
 * @openapi
 * /api/factures:
 *   get:
 *     summary: Liste paginée des factures
 *     tags: [Factures]
 *     parameters:
 *       - in: query
 *         name: client_id
 *         schema: { type: integer }
 *       - in: query
 *         name: statut
 *         schema: { type: string, enum: [payee, impayee, en_retard] }
 *       - in: query
 *         name: periode
 *         schema: { type: string, example: "2026-01" }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limite
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Liste paginée
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Facture' }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 */
router.get('/', verifierJWT, validationFiltres, asyncHandler(facturesController.lister));

/**
 * @openapi
 * /api/factures/{id}:
 *   get:
 *     summary: Détail d'une facture + informations client
 *     tags: [Factures]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Facture trouvée }
 *       404:
 *         description: Facture introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.get('/:id', verifierJWT, validationId, asyncHandler(facturesController.detail));

/**
 * @openapi
 * /api/factures:
 *   post:
 *     summary: Créer une facture (admin)
 *     description: Génère automatiquement la référence au format FAC-YYYYMM-XXXX.
 *     tags: [Factures]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [client_id, periode, montant_fcfa, date_echeance]
 *             properties:
 *               client_id: { type: integer, example: 3 }
 *               periode: { type: string, example: "2026-02" }
 *               montant_fcfa: { type: number, example: 9000 }
 *               statut: { type: string, enum: [payee, impayee, en_retard] }
 *               date_echeance: { type: string, format: date, example: "2026-02-20" }
 *     responses:
 *       201: { description: Facture créée }
 *       422:
 *         description: Données invalides ou client_id introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.post('/', verifierJWT, garderRole('admin'), validationCreation, asyncHandler(facturesController.creer));

/**
 * @openapi
 * /api/factures/{id}/statut:
 *   put:
 *     summary: Mettre à jour le statut d'une facture (admin)
 *     tags: [Factures]
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
 *             required: [statut]
 *             properties:
 *               statut: { type: string, enum: [payee, impayee, en_retard] }
 *     responses:
 *       200: { description: Statut modifié }
 *       404:
 *         description: Facture introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.put('/:id/statut', verifierJWT, garderRole('admin'), validationId, validationStatut, asyncHandler(facturesController.changerStatut));

/**
 * @openapi
 * /api/factures/{id}:
 *   delete:
 *     summary: Supprimer une facture (admin)
 *     tags: [Factures]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204: { description: Facture supprimée }
 *       404:
 *         description: Facture introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.delete('/:id', verifierJWT, garderRole('admin'), validationId, asyncHandler(facturesController.supprimer));

module.exports = router;
