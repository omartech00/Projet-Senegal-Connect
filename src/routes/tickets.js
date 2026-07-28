// src/routes/tickets.js
// Rôle : déclare les 4 routes tickets de la section 2.3. Les routes
// GET messages, POST fichier, GET appels (section 3.2) seront
// ajoutées ici dans les phases dédiées (21, 23, 27) sans modifier
// ce qui existe déjà.

const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const ticketsController = require('../controllers/tickets.controller');
const asyncHandler = require('../utils/asyncHandler');
const { verifierJWT, garderRole } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const validationCreation = [
  body('sujet').trim().notEmpty().withMessage('Le sujet est requis'),
];

const validationStatut = [
  body('statut').isIn(['en_cours', 'ferme']).withMessage('Transition invalide (attendu: en_cours ou ferme)'),
];

const validationId = [param('id').isInt().withMessage('id doit être un entier')];

/**
 * @openapi
 * /api/tickets:
 *   get:
 *     summary: Liste des tickets accessibles à l'utilisateur connecté
 *     description: >
 *       Un client voit ses propres tickets. Un agent voit les tickets
 *       qui lui sont assignés + les tickets ouverts non assignés.
 *       Un admin voit tous les tickets.
 *     tags: [Tickets]
 *     responses:
 *       200: { description: Liste des tickets }
 */
router.get('/', verifierJWT, asyncHandler(ticketsController.lister));

/**
 * @openapi
 * /api/tickets/{id}:
 *   get:
 *     summary: Détail d'un ticket
 *     tags: [Tickets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Ticket trouvé }
 *       403:
 *         description: Ticket non accessible à ce rôle
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 *       404:
 *         description: Ticket introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.get('/:id', verifierJWT, validationId, asyncHandler(ticketsController.detail));

/**
 * @openapi
 * /api/tickets:
 *   post:
 *     summary: Ouvrir un ticket (client)
 *     description: Le client_id est déduit automatiquement du compte connecté.
 *     tags: [Tickets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sujet]
 *             properties:
 *               sujet: { type: string, example: "Ma facture FAC-202602-0001 est incorrecte" }
 *     responses:
 *       201: { description: Ticket créé }
 *       422:
 *         description: Aucune fiche client associée à ce compte
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.post('/', verifierJWT, garderRole('client'), validationCreation, asyncHandler(ticketsController.creer));

/**
 * @openapi
 * /api/tickets/{id}/statut:
 *   patch:
 *     summary: Faire transiter le statut d'un ticket
 *     description: >
 *       "en_cours" = l'agent/admin connecté s'assigne le ticket (doit être
 *       "ouvert"). "ferme" = fermeture par l'agent assigné ou un admin.
 *     tags: [Tickets]
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
 *               statut: { type: string, enum: [en_cours, ferme] }
 *     responses:
 *       200: { description: Transition effectuée }
 *       409:
 *         description: Transition invalide pour le statut actuel
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.patch('/:id/statut', verifierJWT, garderRole('agent', 'admin'), validationId, validationStatut, asyncHandler(ticketsController.changerStatut));

/**
 * @openapi
 * /api/tickets/{id}/messages:
 *   get:
 *     summary: Historique des messages d'un ticket (pagination par curseur)
 *     tags: [Tickets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: avant
 *         schema: { type: string, format: date-time }
 *         description: Timestamp — renvoie les 50 messages précédant strictement cette date
 *     responses:
 *       200: { description: "50 messages maximum, du plus ancien au plus récent" }
 *       403:
 *         description: Ticket non accessible à ce rôle
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.get('/:id/messages', verifierJWT, validationId, asyncHandler(ticketsController.historiqueMessages));

/**
 * @openapi
 * /api/tickets/{id}/fichier:
 *   post:
 *     summary: Uploader un fichier pour un ticket (image, PDF, audio)
 *     description: >
 *       Ne crée pas de message directement — renvoie l'URL du fichier
 *       stocké. Le client émet ensuite l'événement socket
 *       "fichier:partager" avec cette URL pour créer le message et
 *       le diffuser à la room du ticket.
 *     tags: [Tickets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               fichier: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Fichier stocké
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 fichier_url: { type: string, example: "/uploads/3f2a1b9c-....pdf" }
 *                 fichier_nom: { type: string, example: "facture_corrigee.pdf" }
 *                 fichier_taille: { type: integer, example: 204800 }
 *                 mime_type: { type: string, example: "application/pdf" }
 *                 type_message: { type: string, example: "fichier" }
 *       400:
 *         description: Type de fichier non autorisé ou fichier trop volumineux
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.post(
  '/:id/fichier',
  verifierJWT,
  validationId,
  asyncHandler(ticketsController.autoriserAccesTicket),
  upload.single('fichier'),
  asyncHandler(ticketsController.uploaderFichier)
);

module.exports = router;