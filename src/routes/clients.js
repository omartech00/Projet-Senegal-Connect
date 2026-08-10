// src/routes/clients.js
// Rôle : déclare les 5 routes /api/clients — auth JWT sur toutes,
// rôle admin exigé sur création/modification/statut/suppression.

const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const clientsController = require('../controllers/clients.controller');
const asyncHandler = require('../utils/asyncHandler');
const { verifierJWT, garderRole } = require('../middleware/auth');

const REGEX_MSISDN = /^\+221[0-9]{9}$/;

const validationCreation = [
  body('utilisateur_id').isInt().withMessage('utilisateur_id doit être un entier'),
  body('msisdn').matches(REGEX_MSISDN).withMessage('Format attendu : +221XXXXXXXXX'),
  body('forfait_id').optional().isInt().withMessage('forfait_id doit être un entier'),
  body('statut').optional().isIn(['actif', 'suspendu', 'resilie']).withMessage('Statut invalide'),
];

const validationModification = [
  body('msisdn').matches(REGEX_MSISDN).withMessage('Format attendu : +221XXXXXXXXX'),
  body('forfait_id').optional().isInt().withMessage('forfait_id doit être un entier'),
];

const validationStatut = [
  body('statut').isIn(['actif', 'suspendu', 'resilie']).withMessage('Statut invalide'),
];

const validationId = [param('id').isInt().withMessage('id doit être un entier')];

/**
 * @openapi
 * /api/clients:
 *   get:
 *     summary: Liste paginée des clients
 *     tags: [Clients]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Recherche sur nom, prénom, MSISDN ou email
 *       - in: query
 *         name: forfait_id
 *         schema: { type: integer }
 *       - in: query
 *         name: statut
 *         schema: { type: string, enum: [actif, suspendu, resilie] }
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
 *                   items: { $ref: '#/components/schemas/Client' }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 */
router.get('/', verifierJWT, asyncHandler(clientsController.lister));

/**
 * @openapi
 * /api/clients/{id}:
 *   get:
 *     summary: Détail d'un client (forfait + dernière facture + ticket en cours)
 *     tags: [Clients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Client trouvé }
 *       404:
 *         description: Client introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.get('/:id', verifierJWT, validationId, asyncHandler(clientsController.detail));

/**
 * @openapi
 * /api/clients:
 *   post:
 *     summary: Créer un client (admin)
 *     tags: [Clients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [utilisateur_id, msisdn]
 *             properties:
 *               utilisateur_id: { type: integer, example: 7 }
 *               msisdn: { type: string, example: "+221771234599" }
 *               forfait_id: { type: integer, example: 2 }
 *               statut: { type: string, enum: [actif, suspendu, resilie] }
 *     responses:
 *       201: { description: Client créé }
 *       409:
 *         description: MSISDN déjà utilisé ou utilisateur déjà client
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 *       422:
 *         description: Données invalides
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.post('/', verifierJWT, garderRole('admin'), validationCreation, asyncHandler(clientsController.creer));

/**
 * @openapi
 * /api/clients/{id}:
 *   put:
 *     summary: Modifier un client (admin)
 *     tags: [Clients]
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
 *             required: [msisdn]
 *             properties:
 *               msisdn: { type: string, example: "+221771234599" }
 *               forfait_id: { type: integer, example: 3 }
 *     responses:
 *       200: { description: Client modifié }
 *       404:
 *         description: Client introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.put('/:id', verifierJWT, garderRole('admin'), validationId, validationModification, asyncHandler(clientsController.modifier));

/**
 * @openapi
 * /api/clients/{id}/statut:
 *   patch:
 *     summary: Changer le statut d'un client (admin)
 *     description: Impossible de passer à "resilie" si des factures sont impayées ou en retard.
 *     tags: [Clients]
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
 *               statut: { type: string, enum: [actif, suspendu, resilie] }
 *     responses:
 *       200: { description: Statut modifié }
 *       409:
 *         description: Factures impayées
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.patch('/:id/statut', verifierJWT, garderRole('admin'), validationId, validationStatut, asyncHandler(clientsController.changerStatut));

/**
 * @openapi
 * /api/clients/{id}:
 *   delete:
 *     summary: Supprimer un client (admin)
 *     description: Impossible si des factures sont impayées ou en retard.
 *     tags: [Clients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204: { description: Client supprimé }
 *       409:
 *         description: Factures impayées
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.delete('/:id', verifierJWT, garderRole('admin'), validationId, asyncHandler(clientsController.supprimer));

module.exports = router;
