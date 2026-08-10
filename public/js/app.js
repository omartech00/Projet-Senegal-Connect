// public/js/app.js
// Rôle : logique complète de l'application — tickets, chat temps
// réel, appels audio/vidéo, et administration backend (clients, forfaits,
// factures, stats, profil) exposée dans l'interface.

SenegalConnectAPI.exigerAuthentification();
const utilisateur = SenegalConnectAPI.obtenirUtilisateur();
const roleUtilisateur = (utilisateur?.role || '').trim().toLowerCase();

if (!utilisateur) {
  window.location.href = 'login.html';
}

const EMOJIS = ['👍', '👎', '😂', '❤️', '😮', '😢', '😡', '🙏', '👏', '🔥', '✅', '🎉'];

let socket = null;
let ticketActifId = null;
let peerIdLocal = null;
let appelIdActuel = null;
let dernierEnvoiFrappe = 0;
let minuteurMasquageFrappe = null;
let forfaitEnEdition = null;

const $ = (id) => document.getElementById(id);

function formaterStatut(statut) {
  return (statut || '').replace(/_/g, ' ');
}

function badgeHtml(statut, prefix = '') {
  const libelle = formaterStatut(statut);
  return `<span class="badge-statut ${statut}">${prefix}${libelle}</span>`;
}

// ============================================================
// INITIALISATION
// ============================================================
if (utilisateur) {
  document.getElementById('info-utilisateur').textContent = `${utilisateur.nom} (${roleUtilisateur})`;
  if (['agent', 'admin'].includes(roleUtilisateur)) $('onglet-bouton-clients').hidden = false;
  if (roleUtilisateur === 'client') $('form-nouveau-ticket').hidden = false;
  if (roleUtilisateur === 'admin') {
    $('onglet-bouton-factures').hidden = false;
    $('onglet-bouton-stats').hidden = false;
  }

  initialiser();
}

async function initialiser() {
  peerIdLocal = `${roleUtilisateur}-${utilisateur.id}-${Date.now()}`;
  try {
    await SenegalConnectWebRTC.initialiserPeer(peerIdLocal);
    SenegalConnectWebRTC.ecouterAppelsEntrants();
  } catch (erreur) {
    console.error('[app] PeerJS indisponible :', erreur.message);
  }
  connecterSocket();
  chargerTickets();
  chargerForfaits();
  chargerClients();
  chargerFactures();
  chargerStats();
}

// ============================================================
// SOCKET.IO
// ============================================================
function connecterSocket() {
  socket = io({ auth: { token: SenegalConnectAPI.obtenirToken() } });

  socket.on('connect', () => {
    $('etat-socket').classList.add('connecte');
    $('etat-socket').setAttribute('aria-label', 'Connexion en temps réel active');
  });
  socket.on('disconnect', () => {
    $('etat-socket').classList.remove('connecte');
    $('etat-socket').setAttribute('aria-label', 'Connexion en temps réel indisponible');
  });

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

  const estAgentOuAdmin = ['agent', 'admin'].includes(roleUtilisateur);
  $('bouton-prendre-en-charge').hidden = !(estAgentOuAdmin && ticket.statut === 'ouvert');
  $('bouton-fermer-ticket').hidden = !(estAgentOuAdmin && ticket.statut !== 'ferme');

  $('liste-messages').innerHTML = '';
  const { data: messages } = await SenegalConnectAPI.appelApi(`/api/tickets/${ticketId}/messages`);
  messages.forEach(afficherMessage);
  chargerTickets();
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

$('champ-message').addEventListener('input', () => {
  if (!ticketActifId) return;
  const maintenant = Date.now();
  if (maintenant - dernierEnvoiFrappe > 1000) {
    socket.emit('frappe', { ticketId: ticketActifId });
    dernierEnvoiFrappe = maintenant;
  }
});

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
// CLIENTS / FORFAITS / FACTURES / STATS
// ============================================================
$('onglet-bouton-clients')?.addEventListener('click', chargerClients);
function afficherOnglet(nom) {
  document.querySelectorAll('.onglet-nav').forEach((b) => {
    const actif = b.dataset.onglet === nom;
    b.classList.toggle('onglet-actif', actif);
    b.setAttribute('aria-selected', String(actif));
  });

  document.querySelectorAll('.vue-onglet').forEach((v) => {
    const visible = v.id === `vue-${nom}`;
    v.hidden = !visible;
    v.classList.toggle('visible', visible);
    if (visible) {
      v.style.display = 'flex';
    } else {
      v.style.display = 'none';
    }
  });
}

document.querySelectorAll('.onglet-nav').forEach((bouton) => {
  bouton.addEventListener('click', () => afficherOnglet(bouton.dataset.onglet));
});

document.querySelectorAll('.vue-onglet').forEach((v) => {
  v.hidden = true;
  v.classList.remove('visible');
  v.style.display = 'none';
});
afficherOnglet('tickets');

async function chargerClients() {
  if (!['agent', 'admin'].includes(roleUtilisateur)) return;
  const { data } = await SenegalConnectAPI.appelApi('/api/clients');
  const liste = $('liste-clients');
  const select = $('facture-client-id');
  liste.innerHTML = '';
  select.innerHTML = '<option value="">Sélectionner un client</option>';

  data.forEach((client) => {
    const item = document.createElement('li');
    item.className = 'item-gestion';
    item.innerHTML = `
      <div class="contenu">
        <div class="sujet">${echapper(client.nom)} ${echapper(client.prenom)}</div>
        <div class="meta">${echapper(client.msisdn)} — ${badgeHtml(client.statut)}</div>
      </div>
      <div class="boutons">
        <button type="button" class="secondaire" data-client-action="statut" data-client-id="${client.id}">Statut</button>
        <button type="button" class="danger" data-client-action="supprimer" data-client-id="${client.id}">Suppr.</button>
      </div>
    `;

    item.querySelector('[data-client-action="statut"]').addEventListener('click', async () => {
      const nouveauStatut = client.statut === 'actif' ? 'suspendu' : 'actif';
      await SenegalConnectAPI.appelApi(`/api/clients/${client.id}/statut`, {
        method: 'PATCH',
        body: JSON.stringify({ statut: nouveauStatut }),
      });
      afficherToast(`Statut mis à jour : ${nouveauStatut}`);
      chargerClients();
    });

    item.querySelector('[data-client-action="supprimer"]').addEventListener('click', async () => {
      if (!await demanderConfirmation('Supprimer ce client ?', `${client.nom} ${client.prenom} sera supprimé définitivement.`)) return;
      await SenegalConnectAPI.appelApi(`/api/clients/${client.id}`, { method: 'DELETE' });
      afficherToast('Client supprimé');
      chargerClients();
    });

    liste.appendChild(item);
    const option = document.createElement('option');
    option.value = client.id;
    option.textContent = `${client.nom} ${client.prenom} — ${client.msisdn}`;
    select.appendChild(option);
  });
}

$('form-client').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (roleUtilisateur !== 'admin') {
    afficherToast('Seuls les admins peuvent créer des clients');
    return;
  }

  const donnees = {
    nom: $('client-nom').value.trim(),
    prenom: $('client-prenom').value.trim(),
    email: $('client-email').value.trim(),
    mot_de_passe: $('client-mot-de-passe').value,
    msisdn: $('client-msisdn').value.trim(),
    forfait_id: $('client-forfait-id').value ? Number($('client-forfait-id').value) : null,
    statut: $('client-statut').value,
  };

  if (!donnees.nom || !donnees.prenom || !donnees.email || !donnees.mot_de_passe || !donnees.msisdn) {
    afficherToast('Veuillez remplir tous les champs');
    return;
  }

  const { utilisateur: utilisateurCree } = await SenegalConnectAPI.appelApi('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ nom: donnees.nom, prenom: donnees.prenom, email: donnees.email, mot_de_passe: donnees.mot_de_passe }),
  });

  await SenegalConnectAPI.appelApi('/api/clients', {
    method: 'POST',
    body: JSON.stringify({
      utilisateur_id: utilisateurCree.id,
      msisdn: donnees.msisdn,
      forfait_id: donnees.forfait_id,
      statut: donnees.statut,
    }),
  });

  $('form-client').reset();
  $('client-statut').value = 'actif';
  afficherToast('Client créé avec succès');
  chargerClients();
});

async function chargerForfaits() {
  const { data } = await SenegalConnectAPI.appelApi('/api/forfaits');
  const liste = $('liste-forfaits');
  const select = $('client-forfait-id');
  liste.innerHTML = '';
  select.innerHTML = '<option value="">Aucun forfait</option>';

  data.forEach((forfait) => {
    const item = document.createElement('li');
    item.className = 'item-gestion';
    item.innerHTML = `
      <div class="contenu">
        <div class="sujet">${echapper(forfait.nom)}</div>
        <div class="meta">${Number(forfait.prix_mensuel_fcfa).toLocaleString('fr-FR')} FCFA — ${forfait.nb_clients} abonné(s)</div>
      </div>
      <div class="boutons">
        <button type="button" class="secondaire" data-forfait-action="editer" data-forfait-id="${forfait.id}">Éditer</button>
        <button type="button" class="danger" data-forfait-action="supprimer" data-forfait-id="${forfait.id}">Suppr.</button>
      </div>
    `;

    item.querySelector('[data-forfait-action="editer"]').addEventListener('click', async () => {
      const { forfait: detail } = await SenegalConnectAPI.appelApi(`/api/forfaits/${forfait.id}`);
      forfaitEnEdition = detail;
      $('forfait-id').value = detail.id;
      $('forfait-nom').value = detail.nom;
      $('forfait-data').value = detail.quota_data_go;
      $('forfait-voix').value = detail.quota_voix_min;
      $('forfait-prix').value = detail.prix_mensuel_fcfa;
      $('forfait-actif').checked = Boolean(detail.actif);
      $('vue-forfaits').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    item.querySelector('[data-forfait-action="supprimer"]').addEventListener('click', async () => {
      if (!await demanderConfirmation('Supprimer ce forfait ?', `Le forfait « ${forfait.nom} » sera supprimé définitivement.`)) return;
      await SenegalConnectAPI.appelApi(`/api/forfaits/${forfait.id}`, { method: 'DELETE' });
      afficherToast('Forfait supprimé');
      chargerForfaits();
    });

    liste.appendChild(item);
    const option = document.createElement('option');
    option.value = forfait.id;
    option.textContent = `${forfait.nom} — ${forfait.prix_mensuel_fcfa} FCFA`;
    select.appendChild(option);
  });
}

$('form-forfait').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    nom: $('forfait-nom').value.trim(),
    quota_data_go: Number($('forfait-data').value),
    quota_voix_min: Number($('forfait-voix').value),
    prix_mensuel_fcfa: Number($('forfait-prix').value),
    actif: $('forfait-actif').checked,
  };

  if (!payload.nom || Number.isNaN(payload.quota_data_go) || Number.isNaN(payload.quota_voix_min) || Number.isNaN(payload.prix_mensuel_fcfa)) {
    afficherToast('Vérifiez les champs du forfait');
    return;
  }

  if (forfaitEnEdition) {
    await SenegalConnectAPI.appelApi(`/api/forfaits/${forfaitEnEdition.id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    afficherToast('Forfait modifié');
  } else {
    await SenegalConnectAPI.appelApi('/api/forfaits', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    afficherToast('Forfait créé');
  }

  $('form-forfait').reset();
  $('forfait-actif').checked = true;
  forfaitEnEdition = null;
  chargerForfaits();
});

$('bouton-annuler-forfait').addEventListener('click', () => {
  $('form-forfait').reset();
  $('forfait-actif').checked = true;
  forfaitEnEdition = null;
});

async function chargerFactures() {
  if (roleUtilisateur !== 'admin') return;
  const statut = $('filtre-facture-statut').value;
  const periode = $('filtre-facture-periode').value;
  const query = new URLSearchParams();
  if (statut) query.set('statut', statut);
  if (periode) query.set('periode', periode);

  const { data } = await SenegalConnectAPI.appelApi(`/api/factures${query.toString() ? `?${query.toString()}` : ''}`);
  const liste = $('liste-factures');
  liste.innerHTML = '';

  data.forEach((facture) => {
    const item = document.createElement('li');
    item.className = 'item-gestion';
    item.innerHTML = `
      <div class="contenu">
        <div class="sujet">${echapper(facture.reference)} — ${Number(facture.montant_fcfa).toLocaleString('fr-FR')} FCFA</div>
        <div class="meta">${echapper(facture.client_nom)} ${echapper(facture.client_prenom)} — ${echapper(facture.periode)} — ${badgeHtml(facture.statut)}</div>
      </div>
      <div class="boutons">
        <button type="button" class="secondaire" data-facture-action="suivant" data-facture-id="${facture.id}">Statut</button>
      </div>
    `;

    item.querySelector('[data-facture-action="suivant"]').addEventListener('click', async () => {
      const prochainStatut = facture.statut === 'impayee' ? 'en_retard' : facture.statut === 'en_retard' ? 'payee' : 'impayee';
      await SenegalConnectAPI.appelApi(`/api/factures/${facture.id}/statut`, {
        method: 'PUT',
        body: JSON.stringify({ statut: prochainStatut }),
      });
      afficherToast(`Facture mise à ${prochainStatut}`);
      chargerFactures();
    });

    liste.appendChild(item);
  });
}

$('form-facture').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (roleUtilisateur !== 'admin') {
    afficherToast('Accès réservé à l’admin');
    return;
  }

  const payload = {
    client_id: Number($('facture-client-id').value),
    periode: $('facture-periode').value,
    montant_fcfa: Number($('facture-montant').value),
    date_echeance: $('facture-echeance').value,
    statut: $('facture-statut').value,
  };

  await SenegalConnectAPI.appelApi('/api/factures', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  $('form-facture').reset();
  afficherToast('Facture créée');
  chargerFactures();
});

$('bouton-recharger-factures').addEventListener('click', chargerFactures);
$('filtre-facture-statut').addEventListener('change', chargerFactures);
$('filtre-facture-periode').addEventListener('change', chargerFactures);

async function chargerStats() {
  if (roleUtilisateur !== 'admin') return;
  const { data } = await SenegalConnectAPI.appelApi('/api/stats');
  $('stat-clients-actifs').textContent = data.clients_actifs;
  $('stat-mrr').textContent = `${Number(data.mrr_fcfa).toLocaleString('fr-FR')} FCFA`;
  $('stat-factures-impayees').textContent = data.factures_impayees;
  $('stat-tickets-ouverts').textContent = data.tickets_ouverts;
}

$('bouton-profil').addEventListener('click', async () => {
  try {
    const { utilisateur: profil } = await SenegalConnectAPI.appelApi('/api/auth/profil');
    const detail = document.createElement('div');
    detail.className = 'profil-details';
    const nom = document.createElement('strong');
    nom.textContent = `${profil.nom} ${profil.prenom}`;
    detail.appendChild(nom);
    [['Email', profil.email], ['Rôle', profil.role], ['Identifiant', profil.id]].forEach(([libelle, valeur]) => {
      const ligne = document.createElement('div');
      ligne.textContent = `${libelle} : ${valeur}`;
      detail.appendChild(ligne);
    });
    ouvrirModale('Mon profil', detail);
  } catch (erreur) {
    afficherToast(erreur.message || 'Impossible de charger le profil');
  }
});
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

function ouvrirModale(titre, contenu, actions = []) {
  const modale = $('modale');
  $('titre-modale').textContent = titre;
  $('corps-modale').replaceChildren(contenu);
  $('actions-modale').replaceChildren(...actions);
  modale.hidden = false;
  $('bouton-fermer-modale').focus();
}

function fermerModale(resultat = false) {
  const modale = $('modale');
  const resoudre = modale.resoudreConfirmation;
  modale.resoudreConfirmation = null;
  modale.hidden = true;
  $('corps-modale').replaceChildren();
  $('actions-modale').replaceChildren();
  if (resoudre) resoudre(resultat);
}

function demanderConfirmation(titre, message) {
  return new Promise((resolve) => {
    const texte = document.createElement('p');
    texte.textContent = message;
    const annuler = document.createElement('button');
    annuler.type = 'button';
    annuler.className = 'secondaire';
    annuler.textContent = 'Annuler';
    const confirmer = document.createElement('button');
    confirmer.type = 'button';
    confirmer.className = 'danger';
    confirmer.textContent = 'Supprimer';
    $('modale').resoudreConfirmation = resolve;
    annuler.addEventListener('click', () => fermerModale(false));
    confirmer.addEventListener('click', () => fermerModale(true));
    ouvrirModale(titre, texte, [annuler, confirmer]);
  });
}

$('bouton-fermer-modale').addEventListener('click', fermerModale);
document.querySelector('[data-modale-fermer]').addEventListener('click', fermerModale);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('modale').hidden) fermerModale();
});

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
