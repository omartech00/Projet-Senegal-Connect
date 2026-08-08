const express = require('express');
const router = express.Router();
const { body, param, query: queryVal, validationResult } = require('express-validator');
const db = require('../config/db');
const { verifierJWT, garderRole } = require('../middleware/auth');

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
 * /api/clients:
 *   get:
 *     tags: [Clients]
 *     summary: Liste paginee des clients
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Recherche par nom, MSISDN ou email
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
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Liste de clients avec pagination
 *       401: { description: Non authentifie }
 */
router.get('/', verifierJWT, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limite = Math.min(100, Math.max(1, parseInt(req.query.limite, 10) || 10));
    const offset = (page - 1) * limite;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.query.q) {
      conditions.push(`(u.nom ILIKE $${idx} OR u.prenom ILIKE $${idx} OR c.msisdn ILIKE $${idx} OR u.email ILIKE $${idx})`);
      params.push(`%${req.query.q}%`);
      idx++;
    }
    if (req.query.forfait_id) {
      conditions.push(`c.forfait_id = $${idx}`);
      params.push(parseInt(req.query.forfait_id, 10));
      idx++;
    }
    if (req.query.statut) {
      conditions.push(`c.statut = $${idx}`);
      params.push(req.query.statut);
      idx++;
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await db.query(
      `SELECT COUNT(*) FROM clients c JOIN utilisateurs u ON c.utilisateur_id = u.id ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limite, offset);
    const result = await db.query(
      `SELECT c.id, c.msisdn, c.statut, c.date_inscription, c.forfait_id,
              u.id as utilisateur_id, u.nom, u.prenom, u.email,
              f.nom as forfait_nom, f.prix_mensuel_fcfa
       FROM clients c
       JOIN utilisateurs u ON c.utilisateur_id = u.id
       LEFT JOIN forfaits f ON c.forfait_id = f.id
       ${where}
       ORDER BY c.id
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    res.json({
      data: result.rows,
      pagination: { total, page, limite, total_pages: Math.ceil(total / limite) },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/clients/{id}:
 *   get:
 *     tags: [Clients]
 *     summary: Detail d'un client
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Client avec forfait, derniere facture, ticket en cours }
 *       404: { description: Client introuvable }
 */
router.get('/:id', verifierJWT, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT c.*, u.nom, u.prenom, u.email
       FROM clients c
       JOIN utilisateurs u ON c.utilisateur_id = u.id
       WHERE c.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Client introuvable' });
    }

    const client = result.rows[0];

    const forfaitResult = await db.query('SELECT * FROM forfaits WHERE id = $1', [client.forfait_id]);
    const forfait = forfaitResult.rows.length > 0 ? forfaitResult.rows[0] : null;

    const factureResult = await db.query(
      'SELECT * FROM factures WHERE client_id = $1 ORDER BY date_emission DESC LIMIT 1',
      [id]
    );
    const derniereFacture = factureResult.rows.length > 0 ? factureResult.rows[0] : null;

    const ticketResult = await db.query(
      "SELECT * FROM tickets WHERE client_id = $1 AND statut != 'ferme' ORDER BY ouvert_le DESC LIMIT 1",
      [id]
    );
    const ticketEnCours = ticketResult.rows.length > 0 ? ticketResult.rows[0] : null;

    res.json({ ...client, forfait, derniereFacture, ticketEnCours });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/clients:
 *   post:
 *     tags: [Clients]
 *     summary: Creer un client
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, prenom, email, mot_de_passe, msisdn]
 *             properties:
 *               nom: { type: string, example: 'Fall' }
 *               prenom: { type: string, example: 'Ousmane' }
 *               email: { type: string, format: email, example: 'ousmane.fall@gmail.com' }
 *               mot_de_passe: { type: string, example: 'MonMotDePasse123' }
 *               msisdn: { type: string, example: '+221771234567' }
 *               forfait_id: { type: integer, example: 2 }
 *     responses:
 *       201: { description: Client cree }
 *       403: { description: Acces refuse — role insuffisant }
 *       409: { description: MSISDN ou email deja utilise }
 *       422: { description: Donnees invalides }
 */
router.post('/', verifierJWT, garderRole('admin'), [
  body('nom').trim().notEmpty().withMessage('Le nom est requis'),
  body('prenom').trim().notEmpty().withMessage('Le prenom est requis'),
  body('email').isEmail().withMessage('Email invalide').normalizeEmail(),
  body('mot_de_passe').isLength({ min: 8 }).withMessage('Mot de passe trop court (min 8)'),
  body('msisdn').matches(/^\+221[0-9]{9}$/).withMessage('Format MSISDN invalide (+221XXXXXXXXX)'),
  body('forfait_id').optional({ nullable: true }).isInt().withMessage('forfait_id doit etre un entier'),
], async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const bcrypt = require('bcrypt');
    const { nom, prenom, email, mot_de_passe, msisdn, forfait_id } = req.body;

    const emailExiste = await db.query('SELECT id FROM utilisateurs WHERE email = $1', [email]);
    if (emailExiste.rows.length > 0) {
      return res.status(409).json({ erreur: 'Email deja utilise' });
    }

    const msisdnExiste = await db.query('SELECT id FROM clients WHERE msisdn = $1', [msisdn]);
    if (msisdnExiste.rows.length > 0) {
      return res.status(409).json({ erreur: 'MSISDN deja utilise' });
    }

    if (forfait_id) {
      const forfait = await db.query('SELECT id FROM forfaits WHERE id = $1', [forfait_id]);
      if (forfait.rows.length === 0) {
        return res.status(422).json({ erreur: 'Forfait introuvable' });
      }
    }

    const hash = await bcrypt.hash(mot_de_passe, 12);

    const result = await db.transaction(async (client) => {
      const userResult = await client.query(
        'INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, nom, prenom, email, role',
        [nom, prenom, email, hash, 'client']
      );
      const utilisateur = userResult.rows[0];

      const clientResult = await client.query(
        'INSERT INTO clients (utilisateur_id, msisdn, forfait_id) VALUES ($1, $2, $3) RETURNING *',
        [utilisateur.id, msisdn, forfait_id || null]
      );

      return { ...clientResult.rows[0], utilisateur };
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/clients/{id}:
 *   put:
 *     tags: [Clients]
 *     summary: Modifier un client
 *     security:
 *       - bearerAuth: []
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
 *             properties:
 *               nom: { type: string }
 *               prenom: { type: string }
 *               email: { type: string, format: email }
 *               msisdn: { type: string, example: '+221771234567' }
 *               forfait_id: { type: integer }
 *     responses:
 *       200: { description: Client modifie }
 *       404: { description: Client introuvable }
 *       409: { description: Doublon }
 *       422: { description: Donnees invalides }
 */
router.put('/:id', verifierJWT, garderRole('admin'), [
  param('id').isInt().withMessage('ID invalide'),
  body('nom').optional().trim().notEmpty().withMessage('Le nom ne peut pas etre vide'),
  body('prenom').optional().trim().notEmpty().withMessage('Le prenom ne peut pas etre vide'),
  body('email').optional().isEmail().withMessage('Email invalide').normalizeEmail(),
  body('msisdn').optional().matches(/^\+221[0-9]{9}$/).withMessage('Format MSISDN invalide'),
  body('forfait_id').optional({ nullable: true }).isInt().withMessage('forfait_id invalide'),
], async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const { id } = req.params;
    const existing = await db.query('SELECT * FROM clients WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ erreur: 'Client introuvable' });
    }

    const updates = [];
    const params = [];
    let idx = 1;

    if (req.body.nom !== undefined) { updates.push(`nom = $${idx}`); params.push(req.body.nom); idx++; }
    if (req.body.prenom !== undefined) { updates.push(`prenom = $${idx}`); params.push(req.body.prenom); idx++; }
    if (req.body.email !== undefined) {
      const emailExiste = await db.query('SELECT id FROM utilisateurs WHERE email = $1 AND id != (SELECT utilisateur_id FROM clients WHERE id = $2)', [req.body.email, id]);
      if (emailExiste.rows.length > 0) return res.status(409).json({ erreur: 'Email deja utilise' });
      updates.push(`email = $${idx}`); params.push(req.body.email); idx++;
    }
    if (req.body.msisdn !== undefined) {
      const msisdnExiste = await db.query('SELECT id FROM clients WHERE msisdn = $1 AND id != $2', [req.body.msisdn, id]);
      if (msisdnExiste.rows.length > 0) return res.status(409).json({ erreur: 'MSISDN deja utilise' });
      updates.push(`msisdn = $${idx}`); params.push(req.body.msisdn); idx++;
    }
    if (req.body.forfait_id !== undefined) {
      updates.push(`forfait_id = $${idx}`); params.push(req.body.forfait_id); idx++;
    }

    if (updates.length === 0) {
      return res.json(existing.rows[0]);
    }

    params.push(id);

    await db.query(`UPDATE utilisateurs SET ${updates.filter(u => ['nom','prenom','email'].some(f => u.startsWith(f))).join(', ')} WHERE id = (SELECT utilisateur_id FROM clients WHERE id = $${idx})`, params.slice(0, updates.filter(u => ['nom','prenom','email'].some(f => u.startsWith(f))).length));

    if (req.body.msisdn || req.body.forfait_id) {
      const clientUpdates = [];
      const clientParams = [];
      let ci = 1;
      if (req.body.msisdn) { clientUpdates.push(`msisdn = $${ci}`); clientParams.push(req.body.msisdn); ci++; }
      if (req.body.forfait_id !== undefined) { clientUpdates.push(`forfait_id = $${ci}`); clientParams.push(req.body.forfait_id); ci++; }
      clientParams.push(id);
      if (clientUpdates.length > 0) {
        await db.query(`UPDATE clients SET ${clientUpdates.join(', ')} WHERE id = $${ci}`, clientParams);
      }
    }

    const result = await db.query(
      `SELECT c.*, u.nom, u.prenom, u.email FROM clients c JOIN utilisateurs u ON c.utilisateur_id = u.id WHERE c.id = $1`,
      [id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/clients/{id}/statut:
 *   patch:
 *     tags: [Clients]
 *     summary: Changer le statut d'un client
 *     security:
 *       - bearerAuth: []
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
 *       200: { description: Statut mis a jour }
 *       404: { description: Client introuvable }
 *       409: { description: Impossible de resilier si factures impayees }
 */
router.patch('/:id/statut', verifierJWT, garderRole('admin'), [
  param('id').isInt().withMessage('ID invalide'),
  body('statut').isIn(['actif', 'suspendu', 'resilie']).withMessage('Statut invalide'),
], async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const { id } = req.params;
    const { statut } = req.body;

    const existing = await db.query('SELECT * FROM clients WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ erreur: 'Client introuvable' });
    }

    if (statut === 'resilie') {
      const impayees = await db.query(
        "SELECT COUNT(*) FROM factures WHERE client_id = $1 AND statut IN ('impayee', 'en_retard')",
        [id]
      );
      if (parseInt(impayees.rows[0].count, 10) > 0) {
        return res.status(409).json({ erreur: 'Impossible de resilier — factures impayees en cours' });
      }
    }

    await db.query('UPDATE clients SET statut = $1 WHERE id = $2', [statut, id]);
    const result = await db.query('SELECT * FROM clients WHERE id = $1', [id]);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/clients/{id}:
 *   delete:
 *     tags: [Clients]
 *     summary: Supprimer un client
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204: { description: Client supprime }
 *       404: { description: Client introuvable }
 *       409: { description: Impossible de supprimer — factures impayees }
 */
router.delete('/:id', verifierJWT, garderRole('admin'), [
  param('id').isInt().withMessage('ID invalide'),
], async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await db.query('SELECT * FROM clients WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ erreur: 'Client introuvable' });
    }

    const impayees = await db.query(
      "SELECT COUNT(*) FROM factures WHERE client_id = $1 AND statut IN ('impayee', 'en_retard')",
      [id]
    );
    if (parseInt(impayees.rows[0].count, 10) > 0) {
      return res.status(409).json({ erreur: 'Impossible de supprimer — factures impayees en cours' });
    }

    await db.query('DELETE FROM clients WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
