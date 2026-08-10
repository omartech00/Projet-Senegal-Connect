// public/js/login.js
// Rôle : POST /api/auth/login, stocke la session, redirige vers l'app.

if (SenegalConnectAPI.estConnecte()) window.location.href = 'index.html';

const formulaire = document.getElementById('formulaire-connexion');
const messageErreur = document.getElementById('message-erreur');
const boutonConnexion = document.getElementById('bouton-connexion');

formulaire.addEventListener('submit', async (evenement) => {
  evenement.preventDefault();
  messageErreur.hidden = true;
  boutonConnexion.disabled = true;
  boutonConnexion.textContent = 'Connexion...';

  const email = document.getElementById('champ-email').value.trim();
  const mot_de_passe = document.getElementById('champ-mot-de-passe').value;

  try {
    const reponse = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, mot_de_passe }),
    });
    const donnees = await reponse.json();
    if (!reponse.ok) throw new Error(donnees.message || 'Connexion refusée');

    SenegalConnectAPI.enregistrerSession(donnees.token, donnees.utilisateur);
    window.location.href = 'index.html';
  } catch (erreur) {
    messageErreur.textContent = erreur.message;
    messageErreur.hidden = false;
    boutonConnexion.disabled = false;
    boutonConnexion.textContent = 'Se connecter';
  }
});
