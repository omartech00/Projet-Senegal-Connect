const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const db = require('../config/db');
const { verifierJWT, garderRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

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
 * /api/tickets:
 *   get:
 *     tags: [Tickets]
 *     summary: Liste des tickets
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Liste de tickets }
 */
router.get('/', verifierJWT, async (req, res, next) => {
  try {
    let result;
    if (req.user.role === 'client') {
      const clientResult = await db.query('SELECT id FROM clients WHERE utilisateur_id = $1', [req.user.id]);
      if (clientResult.rows.length === 0) return res.json({ data: [], pagination: { total: 0, page: 1, limite: 10, total_pages: 0 } });
      const clientId = clientResult.rows[0].id;
      result = await db.query(
        `SELECT t.*, u.nom AS agent_nom, u.prenom AS agent_prenom
         FROM tickets t LEFT JOIN utilisateurs u ON t.agent_id = u.id
         WHERE t.client_id = $1 ORDER BY t.ouvert_le DESC`,
        [clientId]
      );
    } else if (req.user.role === 'agent') {
      result = await db.query(
        `SELECT t.*, u.nom AS agent_nom, u.prenom AS agent_prenom,
                cu.nom AS client_nom, cu.prenom AS client_prenom, c.msisdn
         FROM tickets t
         JOIN clients c ON t.client_id = c.id
         JOIN utilisateurs cu ON c.utilisateur_id = cu.id
         LEFT JOIN utilisateurs u ON t.agent_id = u.id
         WHERE t.agent_id = $1 OR t.statut = 'ouvert'
         ORDER BY t.ouvert_le DESC`,
        [req.user.id]
      );
    } else {
      result = await db.query(
        `SELECT t.*, u.nom AS agent_nom, u.prenom AS agent_prenom,
                cu.nom AS client_nom, cu.prenom AS client_prenom, c.msisdn
         FROM tickets t
         JOIN clients c ON t.client_id = c.id
         JOIN utilisateurs cu ON c.utilisateur_id = cu.id
         LEFT JOIN utilisateurs u ON t.agent_id = u.id
         ORDER BY t.ouvert_le DESC`
      );
    }
    res.json({ data: result.rows, pagination: { total: result.rows.length, page: 1, limite: result.rows.length, total_pages: 1 } });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/tickets/{id}:
 *   get:
 *     tags: [Tickets]
 *     summary: Detail d'un ticket
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Ticket detaille }
 *       404: { description: Ticket introuvable }
 */
router.get('/:id', verifierJWT, [
  param('id').isInt().withMessage('ID invalide'),
], async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const result = await db.query(
      `SELECT t.*, u.nom AS agent_nom, u.prenom AS agent_prenom,
              cu.nom AS client_nom, cu.prenom AS client_prenom, c.msisdn
       FROM tickets t
       JOIN clients c ON t.client_id = c.id
       JOIN utilisateurs cu ON c.utilisateur_id = cu.id
       LEFT JOIN utilisateurs u ON t.agent_id = u.id
       WHERE t.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Ticket introuvable' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/tickets:
 *   post:
 *     tags: [Tickets]
 *     summary: Creer un ticket de support
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [client_id, sujet]
 *             properties:
 *               client_id: { type: integer, example: 1 }
 *               sujet: { type: string, example: 'Facture incorrecte' }
 *     responses:
 *       201: { description: Ticket cree }
 */
router.post('/', verifierJWT, [
  body('client_id').isInt().withMessage('client_id invalide'),
  body('sujet').trim().notEmpty().withMessage('Le sujet est requis'),
], async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const { client_id, sujet } = req.body;

    const clientCheck = await db.query('SELECT id FROM clients WHERE id = $1', [client_id]);
    if (clientCheck.rows.length === 0) {
      return res.status(422).json({ erreur: 'Client inexistant' });
    }

    const result = await db.query(
      'INSERT INTO tickets (client_id, sujet) VALUES ($1, $2) RETURNING *',
      [client_id, sujet]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/tickets/{id}/statut:
 *   patch:
 *     tags: [Tickets]
 *     summary: Mettre a jour le statut d'un ticket
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
 *               statut: { type: string, enum: [ouvert, en_cours, ferme] }
 *               agent_id: { type: integer }
 *     responses:
 *       200: { description: Statut mis a jour }
 */
router.patch('/:id/statut', verifierJWT, garderRole('agent', 'admin'), [
  param('id').isInt().withMessage('ID invalide'),
  body('statut').isIn(['ouvert', 'en_cours', 'ferme']).withMessage('Statut invalide'),
], async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const { id } = req.params;
    const { statut, agent_id } = req.body;

    const existing = await db.query('SELECT * FROM tickets WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ erreur: 'Ticket introuvable' });
    }

    const updates = ['statut = $1'];
    const params = [statut];
    let idx = 2;

    if (agent_id) { updates.push(`agent_id = $${idx}`); params.push(agent_id); idx++; }
    if (statut === 'ferme') { updates.push(`ferme_le = NOW()`); }

    params.push(id);
    await db.query(`UPDATE tickets SET ${updates.join(', ')} WHERE id = $${idx}`, params);

    const result = await db.query(
      `SELECT t.*, u.nom AS agent_nom, u.prenom AS agent_prenom
       FROM tickets t LEFT JOIN utilisateurs u ON t.agent_id = u.id
       WHERE t.id = $1`,
      [id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/tickets/{id}/messages:
 *   get:
 *     tags: [Tickets]
 *     summary: Historique des messages d'un ticket
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: avant
 *         schema: { type: string }
 *         description: Curseur timestamp pour pagination
 *       - in: query
 *         name: limite
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200: { description: Messages du ticket }
 */
router.get('/:id/messages', verifierJWT, [
  param('id').isInt().withMessage('ID invalide'),
], async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const limite = Math.min(100, Math.max(1, parseInt(req.query.limite, 10) || 50));
    const params = [req.params.id];
    let cursor = '';

    if (req.query.avant) {
      cursor = 'AND m.envoye_le < $2';
      params.push(req.query.avant);
    }

    params.push(limite);
    const idx = params.length;

    const result = await db.query(
      `SELECT m.*, u.nom AS expediteur_nom, u.prenom AS expediteur_prenom
       FROM messages m
       JOIN utilisateurs u ON m.expediteur_id = u.id
       WHERE m.ticket_id = $1 ${cursor}
       ORDER BY m.envoye_le DESC
       LIMIT $${idx}`,
      params
    );

    res.json(result.rows.reverse());
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/tickets/{id}/fichier:
 *   post:
 *     tags: [Tickets]
 *     summary: Partager un fichier dans un ticket
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               fichier: { type: string, format: binary }
 *     responses:
 *       201: { description: Fichier upload et message cree }
 */
router.post('/:id/fichier', verifierJWT, upload.single('fichier'), [
  param('id').isInt().withMessage('ID invalide'),
], async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    if (!req.file) {
      return res.status(422).json({ erreur: 'Aucun fichier fourni' });
    }

    const ticketCheck = await db.query('SELECT id FROM tickets WHERE id = $1', [req.params.id]);
    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ erreur: 'Ticket introuvable' });
    }

    let type = 'fichier';
    if (req.file.mimetype.startsWith('image/')) type = 'image';
    else if (req.file.mimetype.startsWith('audio/')) type = 'audio';

    const fichierUrl = `/uploads/${req.file.filename}`;

    const result = await db.query(
      `INSERT INTO messages (ticket_id, expediteur_id, type, contenu, fichier_url, fichier_nom, fichier_taille)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.params.id, req.user.id, type, req.file.originalname, fichierUrl, req.file.originalname, req.file.size]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/tickets/{id}/appels:
 *   get:
 *     tags: [Tickets]
 *     summary: Historique des appels d'un ticket
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Historique des appels }
 */
router.get('/:id/appels', verifierJWT, [
  param('id').isInt().withMessage('ID invalide'),
], async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const result = await db.query(
      `SELECT a.*,
              ui.nom AS initiateur_nom, ui.prenom AS initiateur_prenom,
              ud.nom AS destinataire_nom, ud.prenom AS destinataire_prenom
       FROM appels a
       JOIN utilisateurs ui ON a.initiateur_id = ui.id
       JOIN utilisateurs ud ON a.destinataire_id = ud.id
       WHERE a.ticket_id = $1
       ORDER BY a.debut_le DESC`,
      [req.params.id]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
