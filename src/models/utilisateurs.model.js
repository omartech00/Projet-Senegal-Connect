// src/models/utilisateurs.model.js
// Rôle : requêtes SQL sur la table utilisateurs. Aucune règle métier
// ici (le forçage du role="client" vit dans le service, pas ici).

const { query } = require('../config/db');
async function trouverParEmail(email) {
  const resultat = await query('SELECT * FROM utilisateurs WHERE email = $1', [email]);
  return resultat.rows[0] || null;
}
// Exclut volontairement mot_de_passe : cette fonction sert au profil
// et ne doit jamais pouvoir exposer le hash, même par erreur future.
async function trouverParId(id) {
  const resultat = await query(
    'SELECT id, nom, prenom, email, role, cree_le FROM utilisateurs WHERE id = $1', [id]
  );
  return resultat.rows[0] || null;
}
async function creer({ nom, prenom, email, motDePasseHache, role }) {
  const resultat = await query(
    `INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, nom, prenom, email, role, cree_le`,
    [nom, prenom, email, motDePasseHache, role]
  );
  return resultat.rows[0];
}
module.exports = { trouverParEmail, trouverParId, creer };
