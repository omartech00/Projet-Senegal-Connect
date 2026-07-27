// src/routes/auth.js
// Rôle : déclare POST /register, POST /login, GET /profil.
// Validation express-validator déclarée ici, exécutée avant le
// controller (le controller vérifie ensuite validationResult).

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const asyncHandler = require('../utils/asyncHandler');
const { verifierJWT } = require('../middleware/auth');

const validationInscription = [
  body('nom').trim().notEmpty().withMessage('Le nom est requis'),
  body('prenom').trim().notEmpty().withMessage('Le prénom est requis'),
  body('email').isEmail().withMessage('Email invalide').normalizeEmail(),
  body('mot_de_passe')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères'),
];

const validationConnexion = [
  body('email').isEmail().withMessage('Email invalide').normalizeEmail(),
  body('mot_de_passe').notEmpty().withMessage('Le mot de passe est requis'),
];

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Inscription d'un nouveau client
 *     description: Crée un compte utilisateur avec le rôle "client" (forcé côté serveur, ignoré si envoyé dans le body). Hache le mot de passe avec bcrypt (coût 12).
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, prenom, email, mot_de_passe]
 *             properties:
 *               nom: { type: string, example: "Ndiaye" }
 *               prenom: { type: string, example: "Fatou" }
 *               email: { type: string, format: email, example: "fatou.ndiaye@example.sn" }
 *               mot_de_passe: { type: string, format: password, example: "MotDePasse123!" }
 *     responses:
 *       201:
 *         description: Compte créé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 utilisateur: { type: object }
 *       409:
 *         description: Email déjà utilisé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 *       422:
 *         description: Données invalides
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.post('/register', validationInscription, asyncHandler(authController.register));

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Connexion
 *     description: Vérifie les identifiants et retourne un JWT valable 24h. Message d'erreur générique volontaire si email inconnu ou mot de passe incorrect.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, mot_de_passe]
 *             properties:
 *               email: { type: string, format: email, example: "admin@senegalconnect.sn" }
 *               mot_de_passe: { type: string, format: password, example: "Test1234!" }
 *     responses:
 *       200:
 *         description: Connexion réussie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 expires_in: { type: string, example: "24h" }
 *                 utilisateur: { type: object }
 *       401:
 *         description: Identifiants incorrects
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.post('/login', validationConnexion, asyncHandler(authController.login));

/**
 * @openapi
 * /api/auth/profil:
 *   get:
 *     summary: Profil de l'utilisateur connecté
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Profil trouvé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 utilisateur: { type: object }
 *       401:
 *         description: Token manquant, expiré ou invalide
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erreur' }
 */
router.get('/profil', verifierJWT, asyncHandler(authController.profil));

module.exports = router;
