const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifierJWT, garderRole } = require('../middleware/auth');

/**
 * @openapi
 * /api/stats:
 *   get:
 *     tags: [Stats]
 *     summary: Tableau de bord admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistiques agrgees
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Stats'
 */
router.get('/', verifierJWT, garderRole('admin'), async (req, res, next) => {
  try {
    const result = await db.query(`
      WITH
        clients_actifs AS (
          SELECT COUNT(*) AS total FROM clients WHERE statut = 'actif'
        ),
        mrr AS (
          SELECT COALESCE(SUM(f.prix_mensuel_fcfa), 0) AS total
          FROM clients c
          JOIN forfaits f ON c.forfait_id = f.id
          WHERE c.statut = 'actif'
        ),
        factures_impayees AS (
          SELECT COUNT(*) AS total FROM factures WHERE statut IN ('impayee', 'en_retard')
        ),
        tickets_ouverts AS (
          SELECT COUNT(*) AS total FROM tickets WHERE statut IN ('ouvert', 'en_cours')
        )
      SELECT
        (SELECT total FROM clients_actifs) AS clients_actifs,
        (SELECT total FROM mrr) AS mrr_fcfa,
        (SELECT total FROM factures_impayees) AS factures_impayees,
        (SELECT total FROM tickets_ouverts) AS tickets_ouverts
    `);

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
