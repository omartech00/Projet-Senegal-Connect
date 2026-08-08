// public/js/app.js
// Rôle : logique complète de l'application — tickets, chat temps
// réel (texte, fichiers, émojis, réactions, accusés, frappe),
// appels audio/vidéo (via webrtc.js, inchangé depuis Phases 26-27).
// Toute action à effet temps réel passe par Socket.IO ; REST ne
// sert qu'au chargement initial des listes/historiques.

SenegalConnectAPI.exigerAuthentification();
const utilisateur = SenegalConnectAPI.obtenirUtilisateur();

const EMOJIS = ['👍', '👎', '😂', '❤️', '😮', '😢', '😡', '🙏', '👏', '🔥', '✅', '🎉'];

let socket = null;
let ticketActifId = null;
let peerIdLocal = null;
let appelIdActuel = null;
let dernierEnvoiFrappe = 0;
let minuteurMasquageFrappe = null;

const $ = (id) => document.getElementById(id);

// ============================================================
// INITIALISATION
// ============================================================
document.getElementById('info-utilisateur').textContent = `${utilisateur.nom} (${utilisateur.role})`;
if (['agent', 'admin'].includes(utilisateur.role)) $('onglet-bouton-clients').hidden = false;
if (utilisateur.role === 'client') $('form-nouveau-ticket').hidden = false;

initialiser();

async function initialiser() {
  peerIdLocal = `${utilisateur.role}-${utilisateur.id}-${Date.now()}`;
  try {
    await SenegalConnectWebRTC.initialiserPeer(peerIdLocal);
    SenegalConnectWebRTC.ecouterAppelsEntrants();
  } catch (erreur) {
    console.error('[app] PeerJS indisponible :', erreur.message);
  }
  connecterSocket();
  chargerTickets();
  chargerForfaits();
}

// ============================================================
// SOCKET.IO
// ============================================================
function connecterSocket() {
  socket = io({ auth: { token: SenegalConnectAPI.obtenirToken() } });

  socket.on('connect', () => $('etat-socket').classList.add('connecte'));
  socket.on('disconnect', () => $('etat-socket').classList.remove('connecte'));

  socket.on('ticket:nouveau', (ticket) => {
    afficherToast(`Nouveau ticket : ${ticket.sujet}`);
    chargerTickets();
  });
  socket.on('ticket:pris_en_charge', (ticket) => {
    afficherToast('Votre ticket a été pris en charge');
    chargerTickets();
    if (ticket.id === ticketActifId) ouvrirTicket(ticket.id);
  });
  socket.on('ticket:ferme', (ticket) => {
    afficherToast('Un ticket a été fermé');
    chargerTickets();
    if (ticket.id === ticketActifId) ouvrirTicket(ticket.id);
  });

  socket.on('message:nouveau', (message) => {
    if (message.ticket_id === ticketActifId) {
      afficherMessage(message);
      if (message.expediteur_id !== utilisateur.id) {
        socket.emit('message:lu', { messageId: message.id });
      }
    } else {
      afficherToast('Nouveau message reçu sur un autre ticket');
    }
  });

  socket.on('message:statut', ({ message_id }) => {
    const bulle = document.querySelector(`[data-message-id="${message_id}"] .coche`);
    if (bulle) bulle.textContent = '✓✓';
  });

  socket.on('message:reaction', ({ message_id, reactions }) => {
    mettreAJourReactions(message_id, reactions);
  });

  socket.on('frappe', ({ nom }) => {
    $('indicateur-frappe').textContent = `${nom} est en train d'écrire...`;
    clearTimeout(minuteurMasquageFrappe);
    minuteurMasquageFrappe = setTimeout(() => { $('indicateur-frappe').textContent = ''; }, 2500);
  });

  socket.on('notification:push', (notif) => afficherToast(notif.message));

  // --- Appels (identique Phases 26-27, inchangé) ---
  socket.on('appel:entrant', async ({ appelId, initiateur, peerId_init, type }) => {
    appelIdActuel = appelId;
    const accepte = confirm(`Appel ${type} entrant de ${initiateur.nom}. Accepter ?`);
    if (!accepte) { socket.emit('appel:refuser', { appelId }); return; }

    $('panneau-appel').hidden = false;
    try {
      await SenegalConnectWebRTC.demarrerFluxLocal({ audio: true, video: type === 'video' });
      SenegalConnectWebRTC.repondreAppelActuel();
      socket.emit('appel:accepter', { appelId, peerId: peerIdLocal }, (rep) => {
        if (!rep.succes) $('statut-appel').textContent = `Erreur : ${rep.message}`;
      });
    } catch (erreur) {
      console.error('[app] Échec du démarrage du flux multimédia :', erreur);
      $('statut-appel').textContent = `Erreur caméra/micro : ${erreur.message || 'Vérifiez que l’appareil est disponible et que les autorisations sont accordées.'}`;
      $('panneau-appel').hidden = true;
    }
  });

  socket.on('appel:accepte', ({ peerId_dest }) => {
    SenegalConnectWebRTC.appeler(peerId_dest);
    $('statut-appel').textContent = 'Appel en cours...';
  });

  socket.on('appel:refuse', () => terminerAppelLocalement('Appel refusé'));
  socket.on('appel:termine', ({ duree_secondes }) => terminerAppelLocalement(`Appel terminé (${duree_secondes}s)`));

  socket.on('appel:controle', ({ micro, video, partageEcran }) => {
    const morceaux = [];
    if (micro === false) morceaux.push('🔇 Micro coupé (distant)');
    if (video === false) morceaux.push('📷 OFF (distant)');
    if (partageEcran === true) morceaux.push("🖥️ Partage d'écran actif (distant)");
    if (morceaux.length) $('statut-appel').textContent = morceaux.join(' — ');
  });
}

// ============================================================
// TICKETS
// ============================================================
async function chargerTickets() {
  const { data } = await SenegalConnectAPI.appelApi('/api/tickets');
  const liste = $('liste-tickets');
  liste.innerHTML = '';
  data.forEach((ticket) => {
    const item = document.createElement('li');
    item.className = ticket.id === ticketActifId ? 'ticket-actif' : '';
    item.innerHTML = `<div class="sujet">${echapper(ticket.sujet)}</div><div class="meta">#${ticket.id} — ${ticket.statut}</div>`;
    item.addEventListener('click', () => ouvrirTicket(ticket.id));
    liste.appendChild(item);
  });
}

$('bouton-ouvrir-ticket').addEventListener('click', () => {
  const sujet = $('champ-sujet-ticket').value.trim();
  if (!sujet) return;
  socket.emit('ticket:ouvrir', { sujet }, (rep) => {
    if (rep.succes) {
      $('champ-sujet-ticket').value = '';
      chargerTickets();
      ouvrirTicket(rep.ticket.id);
    } else {
      afficherToast(`Erreur : ${rep.message}`);
    }
  });
});

async function ouvrirTicket(ticketId) {
  ticketActifId = ticketId;
  const { ticket } = await SenegalConnectAPI.appelApi(`/api/tickets/${ticketId}`);

  socket.emit('ticket:rejoindre', { ticketId });

  $('zone-sans-ticket').hidden = true;
  $('zone-ticket').hidden = false;
  $('titre-ticket-actif').textContent = `#${ticket.id} — ${ticket.sujet}`;
  const badge = $('statut-ticket-actif');
  badge.textContent = ticket.statut;
  badge.className = `badge-statut ${ticket.statut}`;

  const estAgentOuAdmin = ['agent', 'admin'].includes(utilisateur.role);
  $('bouton-prendre-en-charge').hidden = !(estAgentOuAdmin && ticket.statut === 'ouvert');
  $('bouton-fermer-ticket').hidden = !(estAgentOuAdmin && ticket.statut !== 'ferme');

  $('liste-messages').innerHTML = '';
  const { data: messages } = await SenegalConnectAPI.appelApi(`/api/tickets/${ticketId}/messages`);
  messages.forEach(afficherMessage);
  chargerTickets(); // rafraîchit le surlignage "ticket actif"
}

$('bouton-prendre-en-charge').addEventListener('click', () => {
  socket.emit('ticket:assigner', { ticketId: ticketActifId }, (rep) => {
    if (rep.succes) ouvrirTicket(ticketActifId);
    else afficherToast(`Erreur : ${rep.message}`);
  });
});

$('bouton-fermer-ticket').addEventListener('click', () => {
  socket.emit('ticket:fermer', { ticketId: ticketActifId }, (rep) => {
    if (rep.succes) ouvrirTicket(ticketActifId);
    else afficherToast(`Erreur : ${rep.message}`);
  });
});

// ============================================================
// CHAT — messages, fichiers, émojis, réactions, frappe
// ============================================================
function afficherMessage(message) {
  const estSoi = message.expediteur_id === utilisateur.id;
  const bulle = document.createElement('div');
  bulle.className = `message-bulle ${estSoi ? 'soi' : 'autre'}`;
  bulle.dataset.messageId = message.id;

  let contenuHtml = '';
  if (message.type === 'image') {
    contenuHtml = `<img src="${message.fichier_url}" alt="${echapper(message.fichier_nom || 'image')}" />`;
  } else if (message.type === 'audio') {
    contenuHtml = `<audio controls src="${message.fichier_url}"></audio>`;
  } else if (message.type === 'fichier') {
    contenuHtml = `<a class="fichier-pdf" href="${message.fichier_url}" target="_blank">📄 ${echapper(message.fichier_nom || 'fichier')} (${formaterTaille(message.fichier_taille)})</a>`;
  } else {
    contenuHtml = echapper(message.contenu || '');
  }

  bulle.innerHTML = `
    <div class="expediteur">${echapper(message.expediteur_nom || '')} ${message.expediteur_role ? `(${message.expediteur_role})` : ''}</div>
    <div class="contenu">${contenuHtml}</div>
    <div class="reactions" data-reactions-pour="${message.id}"></div>
    <div class="horodatage">${formaterHeure(message.envoye_le)} ${estSoi ? '<span class="coche">✓</span>' : ''}</div>
  `;

  bulle.querySelector('.reactions').appendChild(construireBarreReactions(message.id, []));

  $('liste-messages').appendChild(bulle);
  $('liste-messages').scrollTop = $('liste-messages').scrollHeight;
}

function construireBarreReactions(messageId, reactionsActuelles) {
  const conteneur = document.createElement('div');
  conteneur.className = 'reactions';
  reactionsActuelles.forEach(({ emoji, total }) => {
    const pastille = document.createElement('span');
    pastille.className = 'reaction-pastille';
    pastille.textContent = `${emoji} ${total}`;
    pastille.addEventListener('click', () => reagir(messageId, emoji));
    conteneur.appendChild(pastille);
  });
  const boutonReagir = document.createElement('span');
  boutonReagir.className = 'bouton-reagir';
  boutonReagir.textContent = '➕';
  boutonReagir.addEventListener('click', () => afficherSelecteurReaction(messageId));
  conteneur.appendChild(boutonReagir);
  return conteneur;
}

function afficherSelecteurReaction(messageId) {
  const panneau = $('selecteur-emoji');
  panneau.innerHTML = '';
  EMOJIS.forEach((emoji) => {
    const span = document.createElement('span');
    span.textContent = emoji;
    span.addEventListener('click', () => { reagir(messageId, emoji); panneau.hidden = true; });
    panneau.appendChild(span);
  });
  panneau.hidden = false;
}

function reagir(messageId, emoji) {
  socket.emit('message:reaction', { messageId, emoji });
}

function mettreAJourReactions(messageId, reactions) {
  const conteneur = document.querySelector(`[data-reactions-pour="${messageId}"]`);
  if (!conteneur) return;
  const nouveauConteneur = construireBarreReactions(messageId, reactions);
  conteneur.replaceWith(nouveauConteneur);
  nouveauConteneur.dataset.reactionsPour = messageId;
}

$('bouton-emoji').addEventListener('click', () => {
  const panneau = $('selecteur-emoji');
  panneau.innerHTML = '';
  EMOJIS.forEach((emoji) => {
    const span = document.createElement('span');
    span.textContent = emoji;
    span.addEventListener('click', () => {
      $('champ-message').value += emoji;
      panneau.hidden = true;
      $('champ-message').focus();
    });
    panneau.appendChild(span);
  });
  panneau.hidden = !panneau.hidden;
});

function envoyerMessageTexte() {
  const contenu = $('champ-message').value.trim();
  if (!contenu || !ticketActifId) return;
  socket.emit('message:envoyer', { ticketId: ticketActifId, contenu, type: 'texte' }, (rep) => {
    if (!rep.succes) afficherToast(`Erreur : ${rep.message}`);
  });
  $('champ-message').value = '';
}
$('bouton-envoyer-message').addEventListener('click', envoyerMessageTexte);
$('champ-message').addEventListener('keydown', (e) => { if (e.key === 'Enter') envoyerMessageTexte(); });

// Frappe — throttlée à 1/s CÔTÉ CLIENT (le serveur relaie sans throttle, Phase 20)
$('champ-message').addEventListener('input', () => {
  if (!ticketActifId) return;
  const maintenant = Date.now();
  if (maintenant - dernierEnvoiFrappe > 1000) {
    socket.emit('frappe', { ticketId: ticketActifId });
    dernierEnvoiFrappe = maintenant;
  }
});

// Partage de fichiers — upload REST puis diffusion via fichier:partager (Phase 22)
$('bouton-joindre-fichier').addEventListener('click', () => $('champ-fichier').click());
$('champ-fichier').addEventListener('change', async (e) => {
  const fichier = e.target.files[0];
  if (!fichier || !ticketActifId) return;
  try {
    const resultat = await SenegalConnectAPI.uploaderFichier(`/api/tickets/${ticketActifId}/fichier`, fichier);
    socket.emit('fichier:partager', {
      ticketId: ticketActifId,
      fichierUrl: resultat.fichier_url,
      fichierNom: resultat.fichier_nom,
      fichierTaille: resultat.fichier_taille,
      mimeType: resultat.mime_type,
    });
  } catch (erreur) {
    afficherToast(`Erreur upload : ${erreur.message}`);
  }
  e.target.value = '';
});

// ============================================================
// CLIENTS / FORFAITS (listes en lecture, REST classique)
// ============================================================
$('onglet-bouton-clients')?.addEventListener('click', chargerClients);
document.querySelectorAll('.onglet-nav').forEach((bouton) => {
  bouton.addEventListener('click', () => {
    document.querySelectorAll('.onglet-nav').forEach((b) => b.classList.remove('onglet-actif'));
    document.querySelectorAll('.vue-onglet').forEach((v) => { v.hidden = true; });
    bouton.classList.add('onglet-actif');
    $(`vue-${bouton.dataset.onglet}`).hidden = false;
  });
});

async function chargerClients() {
  const { data } = await SenegalConnectAPI.appelApi('/api/clients');
  const liste = $('liste-clients');
  liste.innerHTML = '';
  data.forEach((client) => {
    const item = document.createElement('li');
    item.innerHTML = `<div class="sujet">${echapper(client.nom)} ${echapper(client.prenom)}</div><div class="meta">${client.msisdn} — ${client.statut}</div>`;
    liste.appendChild(item);
  });
}

async function chargerForfaits() {
  const { data } = await SenegalConnectAPI.appelApi('/api/forfaits');
  const liste = $('liste-forfaits');
  liste.innerHTML = '';
  data.forEach((forfait) => {
    const item = document.createElement('li');
    item.innerHTML = `<div class="sujet">${echapper(forfait.nom)}</div><div class="meta">${forfait.prix_mensuel_fcfa} FCFA/mois — ${forfait.nb_clients} abonné(s)</div>`;
    liste.appendChild(item);
  });
}

// ============================================================
// APPELS (identique Phases 26-27)
// ============================================================
$('bouton-appel-audio').addEventListener('click', () => demarrerAppel('audio'));
$('bouton-appel-video').addEventListener('click', () => demarrerAppel('video'));

async function demarrerAppel(type) {
  $('panneau-appel').hidden = false;
  await SenegalConnectWebRTC.demarrerFluxLocal({ audio: true, video: type === 'video' });
  socket.emit('appel:initier', { ticketId: ticketActifId, type, peerId: peerIdLocal }, (rep) => {
    if (rep.succes) { appelIdActuel = rep.appelId; $('statut-appel').textContent = 'En attente de réponse...'; }
    else { $('statut-appel').textContent = `Erreur : ${rep.message}`; $('panneau-appel').hidden = true; }
  });
}

$('bouton-raccrocher').addEventListener('click', () => {
  if (appelIdActuel) socket.emit('appel:terminer', { appelId: appelIdActuel });
  terminerAppelLocalement('Appel terminé');
});

function terminerAppelLocalement(message) {
  $('statut-appel').textContent = message;
  SenegalConnectWebRTC.raccrocher();
  setTimeout(() => { $('panneau-appel').hidden = true; }, 1200);
  appelIdActuel = null;
}

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

$('bouton-partage-ecran').addEventListener('click', async () => {
  try {
    if (SenegalConnectWebRTC.partageEcranEstActif()) {
      await SenegalConnectWebRTC.arreterPartageEcran();
      $('bouton-partage-ecran').textContent = "🖥️ Partager l'écran";
    } else {
      await SenegalConnectWebRTC.demarrerPartageEcran();
      $('bouton-partage-ecran').textContent = '🖥️ Arrêter le partage';
    }
    if (appelIdActuel) socket.emit('appel:controle', { appelId: appelIdActuel, partageEcran: SenegalConnectWebRTC.partageEcranEstActif() });
  } catch (erreur) {
    $('statut-appel').textContent = `Erreur partage d'écran : ${erreur.message}`;
  }
});

// ============================================================
// UTILITAIRES
// ============================================================
$('bouton-deconnexion').addEventListener('click', () => {
  SenegalConnectAPI.effacerSession();
  window.location.href = 'login.html';
});

function afficherToast(texte) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = texte;
  $('notifications-toast').appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function echapper(texte) {
  const div = document.createElement('div');
  div.textContent = texte || '';
  return div.innerHTML;
}

function formaterHeure(iso) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formaterTaille(octets) {
  if (!octets) return '';
  return octets > 1048576 ? `${(octets / 1048576).toFixed(1)} Mo` : `${(octets / 1024).toFixed(0)} Ko`;
}
