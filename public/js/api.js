// public/js/api.js
// Rôle : stockage de session (localStorage) + wrapper fetch commun à
// login.html, register.html et index.html. Ajoute automatiquement le
// header Authorization, redirige vers login.html sur un 401.

const SenegalConnectAPI = (function () {
  const CLE_TOKEN = 'sc_token';
  const CLE_UTILISATEUR = 'sc_utilisateur';

  function enregistrerSession(token, utilisateur) {
    localStorage.setItem(CLE_TOKEN, token);
    localStorage.setItem(CLE_UTILISATEUR, JSON.stringify(utilisateur));
  }

  function obtenirToken() {
    return localStorage.getItem(CLE_TOKEN);
  }

  function obtenirUtilisateur() {
    const brut = localStorage.getItem(CLE_UTILISATEUR);
    return brut ? JSON.parse(brut) : null;
  }

  function effacerSession() {
    localStorage.removeItem(CLE_TOKEN);
    localStorage.removeItem(CLE_UTILISATEUR);
  }

  function estConnecte() {
    return Boolean(obtenirToken());
  }

  async function appelApi(chemin, options = {}) {
    const entetes = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    const token = obtenirToken();
    if (token) entetes.Authorization = `Bearer ${token}`;

    const reponse = await fetch(chemin, Object.assign({}, options, { headers: entetes }));

    if (reponse.status === 401) {
      effacerSession();
      window.location.href = 'login.html';
      throw new Error('Session expirée');
    }

    const donnees = await reponse.json().catch(() => ({}));
    if (!reponse.ok) {
      const erreur = new Error(donnees.message || 'Erreur inconnue');
      erreur.erreurs = donnees.erreurs;
      erreur.status = reponse.status;
      throw erreur;
    }
    return donnees;
  }

  async function uploaderFichier(chemin, fichier) {
    const formulaire = new FormData();
    formulaire.append('fichier', fichier);
    const reponse = await fetch(chemin, {
      method: 'POST',
      headers: { Authorization: `Bearer ${obtenirToken()}` },
      body: formulaire,
    });
    const donnees = await reponse.json().catch(() => ({}));
    if (!reponse.ok) throw new Error(donnees.message || "Échec de l'upload");
    return donnees;
  }

  function exigerAuthentification() {
    if (!estConnecte()) window.location.href = 'login.html';
  }

  return { enregistrerSession, obtenirToken, obtenirUtilisateur, effacerSession, estConnecte, appelApi, uploaderFichier, exigerAuthentification };
})();
