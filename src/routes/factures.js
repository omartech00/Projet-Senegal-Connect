const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
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

const genererReference = async () => {
  const now = new Date();
  const annee = now.getFullYear();
  const mois = String(now.getMonth() + 1).padStart(2, '0');
  const prefixe = `FAC-${annee}${mois}-`;

  const last = await db.query(
    "SELECT reference FROM factures WHERE reference LIKE $1 ORDER BY reference DESC LIMIT 1",
    [`${prefixe}%`]
  );

  if (last.rows.length === 0) {
    return `${prefixe}0001`;
  }

  const lastNum = parseInt(last.rows[0].reference.split('-')[2], 10);
  return `${prefixe}${String(lastNum + 1).padStart(4, '0')}`;
};

/**
 * @openapi
 * /api/factures:
 *   get:
 *     tags: [Factures]
 *     summary: Liste paginee des factures
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: client_id
 *         schema: { type: integer }
 *       - in: query
 *         name: statut
 *         schema: { type: string, enum: [payee, impayee, en_retard] }
 *       - in: query
 *         name: periode
 *         schema: { type: string }
 *         description: 'Format YYYY-MM'
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limite
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Liste de factures avec pagination
 */
router.get('/', verifierJWT, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limite = Math.min(100, Math.max(1, parseInt(req.query.limite, 10) || 10));
    const offset = (page - 1) * limite;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.query.client_id) {
      conditions.push(`f.client_id = $${idx}`);
      params.push(parseInt(req.query.client_id, 10));
      idx++;
    }
    if (req.query.statut) {
      conditions.push(`f.statut = $${idx}`);
      params.push(req.query.statut);
      idx++;
    }
    if (req.query.periode) {
      conditions.push(`f.periode = $${idx}`);
      params.push(req.query.periode);
      idx++;
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await db.query(`SELECT COUNT(*) FROM factures f ${where}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limite, offset);
    const result = await db.query(
      `SELECT f.*, c.msisdn, u.nom, u.prenom
       FROM factures f
       JOIN clients c ON f.client_id = c.id
       JOIN utilisateurs u ON c.utilisateur_id = u.id
       ${where}
       ORDER BY f.id DESC
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
 * /api/factures/{id}:
 *   get:
 *     tags: [Factures]
 *     summary: Detail d'une facture
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Detail facture + client }
 *       404: { description: Facture introuvable }
 */
router.get('/:id', verifierJWT, [
  param('id').isInt().withMessage('ID invalide'),
], async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const result = await db.query(
      `SELECT f.*, c.msisdn, u.nom, u.prenom, u.email
       FROM factures f
       JOIN clients c ON f.client_id = c.id
       JOIN utilisateurs u ON c.utilisateur_id = u.id
       WHERE f.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Facture introuvable' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/factures:
 *   post:
 *     tags: [Factures]
 *     summary: Creer une facture
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [client_id, periode, montant_fcfa, date_echeance]
 *             properties:
 *               client_id: { type: integer, example: 1 }
 *               periode: { type: string, example: '2025-03' }
 *               montant_fcfa: { type: number, example: 5000 }
 *               statut: { type: string, enum: [payee, impayee, en_retard], example: 'impayee' }
 *               date_echeance: { type: string, format: date, example: '2025-03-20' }
 *     responses:
 *       201: { description: Facture creee avec reference auto-generee }
 *       422: { description: Donnees invalides }
 */
router.post('/', verifierJWT, garderRole('admin'), [
  body('client_id').isInt().withMessage('client_id invalide'),
  body('periode').matches(/^\d{4}-\d{2}$/).withMessage('Periode invalide (format YYYY-MM)'),
  body('montant_fcfa').isFloat({ min: 0 }).withMessage('montant_fcfa >= 0'),
  body('statut').optional().isIn(['payee', 'impayee', 'en_retard']).withMessage('Statut invalide'),
  body('date_echeance').isISO8601().withMessage('date_echeance invalide'),
], async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const clientCheck = await db.query('SELECT id FROM clients WHERE id = $1', [req.body.client_id]);
    if (clientCheck.rows.length === 0) {
      return res.status(422).json({ erreur: 'Client inexistant' });
    }

    const reference = await genererReference();
    const { client_id, periode, montant_fcfa, statut, date_echeance } = req.body;

    const result = await db.query(
      `INSERT INTO factures (client_id, reference, periode, montant_fcfa, statut, date_echeance)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [client_id, reference, periode, montant_fcfa, statut || 'impayee', date_echeance]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/factures/{id}/statut:
 *   put:
 *     tags: [Factures]
 *     summary: Mettre a jour le statut d'une facture
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
 *               statut: { type: string, enum: [payee, impayee, en_retard] }
 *     responses:
 *       200: { description: Statut mis a jour }
 *       404: { description: Facture introuvable }
 */
router.put('/:id/statut', verifierJWT, garderRole('admin'), [
  param('id').isInt().withMessage('ID invalide'),
  body('statut').isIn(['payee', 'impayee', 'en_retard']).withMessage('Statut invalide'),
], async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const existing = await db.query('SELECT * FROM factures WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ erreur: 'Facture introuvable' });
    }

    await db.query('UPDATE factures SET statut = $1 WHERE id = $2', [req.body.statut, req.params.id]);
    const result = await db.query('SELECT * FROM factures WHERE id = $1', [req.params.id]);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/factures/{id}:
 *   delete:
 *     tags: [Factures]
 *     summary: Supprimer une facture
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204: { description: Supprimee }
 *       404: { description: Introuvable }
 */
router.delete('/:id', verifierJWT, garderRole('admin'), [
  param('id').isInt().withMessage('ID invalide'),
], async (req, res, next) => {
  try {
    const existing = await db.query('SELECT * FROM factures WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ erreur: 'Facture introuvable' });
    }

    await db.query('DELETE FROM factures WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
