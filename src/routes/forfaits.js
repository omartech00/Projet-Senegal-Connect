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

/**
 * @openapi
 * /api/forfaits:
 *   get:
 *     tags: [Forfaits]
 *     summary: Liste des forfaits avec nombre d'abonnes
 *     responses:
 *       200:
 *         description: Liste de forfaits actifs avec nb_clients
 */
router.get('/', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT f.*,
              COUNT(c.id) FILTER (WHERE c.statut = 'actif') AS nb_clients
       FROM forfaits f
       LEFT JOIN clients c ON c.forfait_id = f.id
       WHERE f.actif = TRUE
       GROUP BY f.id
       ORDER BY f.prix_mensuel_fcfa`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/forfaits/{id}:
 *   get:
 *     tags: [Forfaits]
 *     summary: Detail d'un forfait avec liste des abonnes
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Detail forfait + clients abonnes }
 *       404: { description: Forfait introuvable }
 */
router.get('/:id', [
  param('id').isInt().withMessage('ID invalide'),
], async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const forfaitResult = await db.query('SELECT * FROM forfaits WHERE id = $1', [req.params.id]);
    if (forfaitResult.rows.length === 0) {
      return res.status(404).json({ erreur: 'Forfait introuvable' });
    }

    const clientsResult = await db.query(
      `SELECT c.id, c.msisdn, c.statut, u.nom, u.prenom
       FROM clients c JOIN utilisateurs u ON c.utilisateur_id = u.id
       WHERE c.forfait_id = $1
       ORDER BY c.id`,
      [req.params.id]
    );

    res.json({ ...forfaitResult.rows[0], clients: clientsResult.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/forfaits:
 *   post:
 *     tags: [Forfaits]
 *     summary: Creer un forfait
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, prix_mensuel_fcfa]
 *             properties:
 *               nom: { type: string, example: 'Yewwi 15Go' }
 *               quota_data_go: { type: number, example: 15 }
 *               quota_voix_min: { type: integer, example: 900 }
 *               prix_mensuel_fcfa: { type: number, example: 15000 }
 *     responses:
 *       201: { description: Forfait cree }
 *       403: { description: Acces refuse }
 *       422: { description: Donnees invalides }
 */
router.post('/', verifierJWT, garderRole('admin'), [
  body('nom').trim().notEmpty().withMessage('Le nom est requis'),
  body('quota_data_go').optional().isFloat({ min: 0 }).withMessage('quota_data_go >= 0'),
  body('quota_voix_min').optional().isInt({ min: 0 }).withMessage('quota_voix_min >= 0'),
  body('prix_mensuel_fcfa').isFloat({ gt: 0 }).withMessage('Le prix doit etre > 0 FCFA'),
], async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const { nom, quota_data_go, quota_voix_min, prix_mensuel_fcfa } = req.body;
    const result = await db.query(
      'INSERT INTO forfaits (nom, quota_data_go, quota_voix_min, prix_mensuel_fcfa) VALUES ($1, $2, $3, $4) RETURNING *',
      [nom, quota_data_go || 0, quota_voix_min || 0, prix_mensuel_fcfa]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/forfaits/{id}:
 *   put:
 *     tags: [Forfaits]
 *     summary: Modifier un forfait
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Forfait modifie }
 *       404: { description: Forfait introuvable }
 */
router.put('/:id', verifierJWT, garderRole('admin'), [
  param('id').isInt().withMessage('ID invalide'),
  body('nom').optional().trim().notEmpty().withMessage('Le nom ne peut pas etre vide'),
  body('quota_data_go').optional().isFloat({ min: 0 }).withMessage('quota_data_go >= 0'),
  body('quota_voix_min').optional().isInt({ min: 0 }).withMessage('quota_voix_min >= 0'),
  body('prix_mensuel_fcfa').optional().isFloat({ gt: 0 }).withMessage('Le prix doit etre > 0 FCFA'),
], async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const existing = await db.query('SELECT * FROM forfaits WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ erreur: 'Forfait introuvable' });
    }

    const updates = [];
    const params = [];
    let idx = 1;

    if (req.body.nom !== undefined) { updates.push(`nom = $${idx}`); params.push(req.body.nom); idx++; }
    if (req.body.quota_data_go !== undefined) { updates.push(`quota_data_go = $${idx}`); params.push(req.body.quota_data_go); idx++; }
    if (req.body.quota_voix_min !== undefined) { updates.push(`quota_voix_min = $${idx}`); params.push(req.body.quota_voix_min); idx++; }
    if (req.body.prix_mensuel_fcfa !== undefined) { updates.push(`prix_mensuel_fcfa = $${idx}`); params.push(req.body.prix_mensuel_fcfa); idx++; }

    if (updates.length === 0) return res.json(existing.rows[0]);

    params.push(req.params.id);
    await db.query(`UPDATE forfaits SET ${updates.join(', ')} WHERE id = $${idx}`, params);

    const result = await db.query('SELECT * FROM forfaits WHERE id = $1', [req.params.id]);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/forfaits/{id}:
 *   delete:
 *     tags: [Forfaits]
 *     summary: Supprimer un forfait
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204: { description: Supprime }
 *       404: { description: Introuvable }
 *       409: { description: Clients encore abonnes }
 */
router.delete('/:id', verifierJWT, garderRole('admin'), [
  param('id').isInt().withMessage('ID invalide'),
], async (req, res, next) => {
  try {
    const existing = await db.query('SELECT * FROM forfaits WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ erreur: 'Forfait introuvable' });
    }

    const abonnes = await db.query(
      "SELECT COUNT(*) FROM clients WHERE forfait_id = $1 AND statut = 'actif'",
      [req.params.id]
    );
    if (parseInt(abonnes.rows[0].count, 10) > 0) {
      return res.status(409).json({ erreur: 'Impossible de supprimer — des clients sont encore abonnes a ce forfait' });
    }

    await db.query('DELETE FROM forfaits WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
