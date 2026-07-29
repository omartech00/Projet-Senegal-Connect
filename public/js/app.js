// public/js/app.js
// Rôle : logique cliente principale. Version initiale (Phase 26) :
// authentification REST + connexion Socket.IO + flux d'appel
// audio/vidéo (via webrtc.js). Le chat, la liste des clients/tickets
// et le partage d'écran seront ajoutés dans les phases suivantes,
// sans réécrire ce qui suit.

let socket = null;
let utilisateurCourant = null;
let appelIdActuel = null;
let peerIdLocal = null;

const $ = (id) => document.getElementById(id);

// --- Connexion ---
$('bouton-connexion').addEventListener('click', async () => {
  const email = $('champ-email').value;
  const mot_de_passe = $('champ-mot-de-passe').value;

  try {
    const reponse = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, mot_de_passe }),
    });
    const donnees = await reponse.json();
    if (!reponse.ok) throw new Error(donnees.message);

    utilisateurCourant = donnees.utilisateur;
    $('statut-connexion').textContent += `Connecté : ${utilisateurCourant.nom} (${utilisateurCourant.role})`;
    $('section-appel').hidden = false;

    // peerId lisible et unique par session — préfixé par le rôle et
    // l'id utilisateur pour rester facilement identifiable en debug.
    peerIdLocal = `${utilisateurCourant.role}-${utilisateurCourant.id}-${Date.now()}`;
    connecterSocket(donnees.token);
    await SenegalConnectWebRTC.initialiserPeer(peerIdLocal);
    SenegalConnectWebRTC.ecouterAppelsEntrants();

    connecterSocket(donnees.token);
  } catch (erreur) {
    console.error("Le script de connexion a planté ici :", erreur);
    $('statut-connexion').textContent = `Erreur : ${erreur.message}`;
  }
});

function connecterSocket(token) {
  // 1. Initialisation de l'instance locale ou distante (Spécifiez l'URL pour éviter les approximations du navigateur)
  socket = io('http://localhost:3000', { 
    auth: { token },
    transports: ['websocket'] // Force le mode WebSocket direct
  });

  // 2. Pose des écouteurs uniquement si l'instance est valide
  if (!socket) {
    console.error("[socket] Impossible d'initialiser l'instance de communication.");
    return;
  }

  socket.on('connect', () => {
    $('statut-connexion').textContent = `Connecté : ${utilisateurCourant.nom} (${utilisateurCourant.role}) — Socket.IO connecté`;
  });

  // --- Réception d'un appel entrant ---
  socket.on('appel:entrant', async ({ appelId, initiateur, peerId_init, type }) => {
    const accepte = confirm(`Appel ${type} entrant de ${initiateur.nom}. Accepter ?`);
    appelIdActuel = appelId;

    if (!accepte) {
      socket.emit('appel:refuser', { appelId });
      return;
    }

    await SenegalConnectWebRTC.demarrerFluxLocal({ audio: true, video: type === 'video' });
    activerControlesAppel();

    socket.emit('appel:accepter', { appelId, peerId: peerIdLocal }, (rep) => {
      if (!rep.succes) $('statut-appel').textContent = `Erreur : ${rep.message}`;
    });
  });

  socket.on('appel:accepte', ({ peerId_dest }) => {
    SenegalConnectWebRTC.appeler(peerId_dest);
    $('statut-appel').textContent = 'Appel en cours...';
  });

  socket.on('appel:refuse', () => {
    $('statut-appel').textContent = 'Appel refusé par le destinataire';
    SenegalConnectWebRTC.raccrocher();
    desactiverControlesAppel();
  });

  socket.on('appel:termine', ({ duree_secondes }) => {
    $('statut-appel').textContent = `Appel terminé (${duree_secondes}s)`;
    SenegalConnectWebRTC.raccrocher();
    desactiverControlesAppel();
  });
}


// --- Initier un appel ---
$('bouton-appeler').addEventListener('click', async () => {
  const ticketId = parseInt($('champ-ticket-id').value, 10);
  const type = $('champ-type-appel').value;

  await SenegalConnectWebRTC.demarrerFluxLocal({ audio: true, video: type === 'video' });
  activerControlesAppel();

  socket.emit('appel:initier', { ticketId, type, peerId: peerIdLocal }, (rep) => {
    if (rep.succes) {
      appelIdActuel = rep.appelId;
      $('statut-appel').textContent = "En attente de réponse...";
    } else {
      $('statut-appel').textContent = `Erreur : ${rep.message}`;
      desactiverControlesAppel();
    }
  });
});

$('bouton-raccrocher').addEventListener('click', () => {
  if (appelIdActuel) socket.emit('appel:terminer', { appelId: appelIdActuel });
  SenegalConnectWebRTC.raccrocher();
  desactiverControlesAppel();
});

$('bouton-micro').addEventListener('click', () => {
  const actif = SenegalConnectWebRTC.couperMicro();
  $('bouton-micro').textContent = actif ? '🎤 Couper micro' : '🔇 Rétablir micro';
  if (appelIdActuel) socket.emit('appel:controle', { appelId: appelIdActuel, micro: actif });
});

$('bouton-camera').addEventListener('click', () => {
  const actif = SenegalConnectWebRTC.couperCamera();
  $('bouton-camera').textContent = actif ? '📷 Couper caméra' : '📷 OFF — Rétablir';
  if (appelIdActuel) socket.emit('appel:controle', { appelId: appelIdActuel, video: actif });
});

function activerControlesAppel() {
  $('bouton-raccrocher').disabled = false;
  $('bouton-micro').disabled = false;
  $('bouton-camera').disabled = false;
  $('bouton-appeler').disabled = true;
}

function desactiverControlesAppel() {
  $('bouton-raccrocher').disabled = true;
  $('bouton-micro').disabled = true;
  $('bouton-camera').disabled = true;
  $('bouton-appeler').disabled = false;
  appelIdActuel = null;
}
