const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { verifierJWT } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-at-least-64-chars-long';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '24h';

const validate = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map(e => ({ champ: e.path, message: e.msg, valeur: e.value }));
    res.status(422).json({ erreur: 'Donnees invalides', details });
    return false;
  }
  return true;
};

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Inscription d'un nouvel utilisateur
 *     description: Cree un compte utilisateur. Le mot de passe est hache avec bcrypt (cost 12).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, prenom, email, mot_de_passe, role]
 *             properties:
 *               nom: { type: string, example: 'Fall' }
 *               prenom: { type: string, example: 'Ousmane' }
 *               email: { type: string, format: email, example: 'ousmane.fall@gmail.com' }
 *               mot_de_passe: { type: string, minLength: 8, example: 'MonMotDePasse123' }
 *               role: { type: string, enum: [client, agent, admin], example: 'client' }
 *     responses:
 *       201: { description: Utilisateur cree }
 *       409: { description: Email deja utilise }
 *       422: { description: Donnees invalides }
 */
router.post('/register', [
  body('nom').trim().notEmpty().withMessage('Le nom est requis'),
  body('prenom').trim().notEmpty().withMessage('Le prenom est requis'),
  body('email').isEmail().withMessage('Email invalide').normalizeEmail(),
  body('mot_de_passe').isLength({ min: 8 }).withMessage('Le mot de passe doit contenir au moins 8 caracteres'),
  body('role').isIn(['client', 'agent', 'admin']).withMessage('Role invalide'),
], async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const { nom, prenom, email, mot_de_passe, role } = req.body;

    const existe = await db.query('SELECT id FROM utilisateurs WHERE email = $1', [email]);
    if (existe.rows.length > 0) {
      return res.status(409).json({ erreur: 'Email deja utilise' });
    }

    const hash = await bcrypt.hash(mot_de_passe, 12);
    const result = await db.query(
      'INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, nom, prenom, email, role, cree_le',
      [nom, prenom, email, hash, role]
    );

    res.status(201).json({ message: 'Utilisateur cree avec succes', utilisateur: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Connexion
 *     description: Verifie les identifiants et retourne un JWT valide 24h.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, mot_de_passe]
 *             properties:
 *               email: { type: string, format: email, example: 'admin@senegalconnect.sn' }
 *               mot_de_passe: { type: string, example: 'password123' }
 *     responses:
 *       200: { description: Connexion reussie, token JWT retourne }
 *       401: { description: Identifiants incorrects }
 */
router.post('/login', [
  body('email').isEmail().withMessage('Email invalide').normalizeEmail(),
  body('mot_de_passe').notEmpty().withMessage('Le mot de passe est requis'),
], async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const { email, mot_de_passe } = req.body;

    const result = await db.query('SELECT * FROM utilisateurs WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ erreur: 'Identifiants incorrects' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
    if (!validPassword) {
      return res.status(401).json({ erreur: 'Identifiants incorrects' });
    }

    const payload = { id: user.id, nom: user.nom, email: user.email, role: user.role };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES, issuer: 'senegal-connect' });

    res.json({
      token,
      expires_in: JWT_EXPIRES,
      utilisateur: { id: user.id, nom: user.nom, prenom: user.prenom, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/auth/profil:
 *   get:
 *     tags: [Auth]
 *     summary: Profil de l'utilisateur connecte
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Profil utilisateur }
 *       401: { description: Token manquant ou invalide }
 */
router.get('/profil', verifierJWT, async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT id, nom, prenom, email, role, cree_le FROM utilisateurs WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Utilisateur introuvable' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
