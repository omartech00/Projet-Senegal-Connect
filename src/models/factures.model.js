// src/models/factures.model.js
// Rôle : requêtes SQL sur factures, jointes à clients/utilisateurs
// pour le détail enrichi. La génération de référence vit ici mais
// à l'intérieur d'une transaction fournie par le service (voir
// creerAvecReference) — jamais de règle métier "flottante" ailleurs.

const { query, transaction } = require('../config/db');

const SELECT_DETAIL = `
  SELECT
    fa.*,
    u.nom AS client_nom, u.prenom AS client_prenom, u.email AS client_email,
    c.msisdn AS client_msisdn
  FROM factures fa
  JOIN clients c ON c.id = fa.client_id
  JOIN utilisateurs u ON u.id = c.utilisateur_id
`;

function construireFiltres({ client_id, statut, periode }) {
  const conditions = [];
  const parametres = [];

  if (client_id) {
    parametres.push(client_id);
    conditions.push(`fa.client_id = $${parametres.length}`);
  }
  if (statut) {
    parametres.push(statut);
    conditions.push(`fa.statut = $${parametres.length}`);
  }
  if (periode) {
    parametres.push(periode);
    conditions.push(`fa.periode = $${parametres.length}`);
  }

  const clauseWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { clauseWhere, parametres };
}

async function compter(filtres) {
  const { clauseWhere, parametres } = construireFiltres(filtres);
  const resultat = await query(`SELECT COUNT(*) AS total FROM factures fa ${clauseWhere}`, parametres);
  return parseInt(resultat.rows[0].total, 10);
}

async function lister(filtres, { page, limite }) {
  const { clauseWhere, parametres } = construireFiltres(filtres);
  const offset = (page - 1) * limite;
  parametres.push(limite, offset);

  const resultat = await query(
    `${SELECT_DETAIL} ${clauseWhere} ORDER BY fa.id DESC LIMIT $${parametres.length - 1} OFFSET $${parametres.length}`,
    parametres
  );
  return resultat.rows;
}

async function trouverParId(id) {
  const resultat = await query(`${SELECT_DETAIL} WHERE fa.id = $1`, [id]);
  return resultat.rows[0] || null;
}

/**
 * Génère la référence (FAC-YYYYMM-XXXX) ET insère la facture dans
 * UNE SEULE transaction verrouillée sur la période, pour garantir
 * l'unicité même en cas de créations concurrentes.
 */
async function creerAvecReference({ client_id, periode, montant_fcfa, statut, date_echeance }) {
  return transaction(async (client) => {
    // Verrou consultatif transactionnel : sérialise les créations
    // pour une même période, libéré automatiquement au COMMIT/ROLLBACK.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [periode]);

    const { rows } = await client.query(
      `SELECT COUNT(*) AS total FROM factures WHERE periode = $1`,
      [periode]
    );
    const sequence = parseInt(rows[0].total, 10) + 1;
    const reference = `FAC-${periode.replace('-', '')}-${String(sequence).padStart(4, '0')}`;

    const insertion = await client.query(
      `INSERT INTO factures (client_id, reference, periode, montant_fcfa, statut, date_echeance)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'impayee'), $6)
       RETURNING *`,
      [client_id, reference, periode, montant_fcfa, statut || null, date_echeance]
    );
    return insertion.rows[0];
  });
}

async function mettreAJourStatut(id, statut) {
  const resultat = await query(
    'UPDATE factures SET statut = $1 WHERE id = $2 RETURNING *',
    [statut, id]
  );
  return resultat.rows[0] || null;
}

async function supprimer(id) {
  await query('DELETE FROM factures WHERE id = $1', [id]);
}

module.exports = {
  compter,
  lister,
  trouverParId,
  creerAvecReference,
  mettreAJourStatut,
  supprimer,
};
