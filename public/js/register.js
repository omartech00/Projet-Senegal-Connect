// public/js/register.js
// Rôle : POST /api/auth/register. Rappel (Phase 12) : le rôle est
// TOUJOURS forcé à "client" côté serveur — cette page ne propose
// jamais de champ "rôle", volontairement.

if (SenegalConnectAPI.estConnecte()) window.location.href = 'index.html';

const formulaire = document.getElementById('formulaire-inscription');
const messageErreur = document.getElementById('message-erreur');
const messageSucces = document.getElementById('message-succes');
const boutonInscription = document.getElementById('bouton-inscription');

formulaire.addEventListener('submit', async (evenement) => {
  evenement.preventDefault();
  messageErreur.hidden = true;
  messageSucces.hidden = true;
  boutonInscription.disabled = true;
  boutonInscription.textContent = 'Création...';

  const corps = {
    nom: document.getElementById('champ-nom').value.trim(),
    prenom: document.getElementById('champ-prenom').value.trim(),
    email: document.getElementById('champ-email').value.trim(),
    mot_de_passe: document.getElementById('champ-mot-de-passe').value,
  };

  try {
    const reponse = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const donnees = await reponse.json();
    if (!reponse.ok) {
      const details = donnees.erreurs ? donnees.erreurs.map((e) => e.message).join(' — ') : donnees.message;
      throw new Error(details);
    }
    messageSucces.textContent = 'Compte créé ! Redirection vers la connexion...';
    messageSucces.hidden = false;
    setTimeout(() => { window.location.href = 'login.html'; }, 1500);
  } catch (erreur) {
    messageErreur.textContent = erreur.message;
    messageErreur.hidden = false;
    boutonInscription.disabled = false;
    boutonInscription.textContent = 'Créer mon compte';
  }
});
