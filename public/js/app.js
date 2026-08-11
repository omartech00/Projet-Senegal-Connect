// public/js/app.js
// Rôle : logique complète de l'espace support — tableau de bord,
// tickets, chat temps réel, appels audio/vidéo et administration
// (clients, forfaits, factures). Le tableau de bord est la page
// d'accueil après connexion, avec tous les indicateurs intégrés.

SenegalConnectAPI.exigerAuthentification();
const utilisateur = SenegalConnectAPI.obtenirUtilisateur();
const roleUtilisateur = (utilisateur?.role || '').trim().toLowerCase();

if (!utilisateur) {
  window.location.href = 'login.html';
}

const EMOJIS = ['👍', '👎', '😂', '❤️', '😮', '😢', '😡', '🙏', '👏', '🔥', '✅', '🎉'];

const ICONE_TICKET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><path d="M16 8h2"/><path d="M14 12h4"/><path d="M16 16h2"/></svg>';
const ICONE_UTILISATEUR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
const ICONE_CLIENTS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
const ICONE_FACTURE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>';

let socket = null;
let ticketActifId = null;
let peerIdLocal = null;
let appelIdActuel = null;
let dernierEnvoiFrappe = 0;
let minuteurMasquageFrappe = null;
let minuteurAppel = null;
let debutAppelTimestamp = 0;
let dernierEmojiInsere = null;

let ticketsTous = [];
let clientsTous = [];
let forfaitsTous = [];
let facturesTous = [];
let statsCache = null;

const $ = (id) => document.getElementById(id);

// ============================================================
// UTILITAIRES
// ============================================================
function echapper(texte) {
  const div = document.createElement('div');
  div.textContent = texte ?? '';
  return div.innerHTML;
}

function formaterStatut(statut) {
  return (statut || '').replace(/_/g, ' ');
}

function badgeHtml(statut) {
  return `<span class="badge-statut ${echapper(statut || '')}">${formaterStatut(statut)}</span>`;
}

function formaterHeure(iso) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formaterDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formaterDateHeure(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formaterTaille(octets) {
  if (!octets) return '';
  return octets > 1048576 ? `${(octets / 1048576).toFixed(1)} Mo` : `${(octets / 1024).toFixed(0)} Ko`;
}

function formatPrix(n) {
  return Number(n || 0).toLocaleString('fr-FR');
}

function afficherToast(texte, estErreur = false) {
  const toast = document.createElement('div');
  toast.className = `toast${estErreur ? ' erreur' : ''}`;
  toast.textContent = texte;
  $('notifications-toast').appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ============================================================
// MODALES & CONFIRMATION
// ============================================================
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
    texte.className = 'texte-modale';
    texte.textContent = message;
    const annuler = document.createElement('button');
    annuler.type = 'button';
    annuler.className = 'btn btn-ghost';
    annuler.textContent = 'Annuler';
    const confirmer = document.createElement('button');
    confirmer.type = 'button';
    confirmer.className = 'btn btn-danger';
    confirmer.textContent = 'Confirmer';
    $('modale').resoudreConfirmation = resolve;
    annuler.addEventListener('click', () => fermerModale(false));
    confirmer.addEventListener('click', () => fermerModale(true));
    ouvrirModale(titre, texte, [annuler, confirmer]);
  });
}

function demanderReponseAppel(titre, message) {
  return new Promise((resolve) => {
    const texte = document.createElement('p');
    texte.className = 'texte-modale';
    texte.textContent = message;
    const refuser = document.createElement('button');
    refuser.type = 'button';
    refuser.className = 'btn btn-danger';
    refuser.textContent = 'Refuser';
    const accepter = document.createElement('button');
    accepter.type = 'button';
    accepter.className = 'btn btn-primary';
    accepter.textContent = 'Accepter';
    $('modale').resoudreConfirmation = resolve;
    refuser.addEventListener('click', () => fermerModale(false));
    accepter.addEventListener('click', () => fermerModale(true));
    ouvrirModale(titre, texte, [refuser, accepter]);
  });
}

$('bouton-fermer-modale').addEventListener('click', () => fermerModale());
document.querySelector('[data-modale-fermer]').addEventListener('click', () => fermerModale());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('modale').hidden) fermerModale();
});

// ============================================================
// NAVIGATION
// ============================================================
function afficherOnglet(nom) {
  document.querySelectorAll('.nav-item').forEach((bouton) => {
    const actif = bouton.dataset.onglet === nom;
    bouton.classList.toggle('actif', actif);
    if (actif) bouton.setAttribute('aria-current', 'page');
    else bouton.removeAttribute('aria-current');
  });

  document.querySelectorAll('.vue-onglet').forEach((vue) => {
    const visible = vue.id === `vue-${nom}`;
    vue.hidden = !visible;
    vue.classList.toggle('visible', visible);
  });
}

document.querySelectorAll('.nav-item').forEach((bouton) => {
  bouton.addEventListener('click', () => afficherOnglet(bouton.dataset.onglet));
});

document.querySelectorAll('[data-va-a]').forEach((bouton) => {
  bouton.addEventListener('click', () => afficherOnglet(bouton.dataset.vaA));
});

// ============================================================
// SESSION & INITIALISATION
// ============================================================
function initialiserSession() {
  const nomComplet = [utilisateur.prenom, utilisateur.nom].filter(Boolean).join(' ') || utilisateur.nom;
  $('info-utilisateur').textContent = nomComplet;
  $('info-role').textContent = roleUtilisateur;
  $('avatar-user').textContent = (utilisateur.prenom || utilisateur.nom || 'U').charAt(0).toUpperCase();
  $('salutation').textContent = `Bonjour, ${utilisateur.prenom || utilisateur.nom}`;
  $('date-jour').textContent = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  if (['agent', 'admin'].includes(roleUtilisateur)) $('nav-clients').hidden = false;
  if (roleUtilisateur === 'admin') $('nav-factures').hidden = false;
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

  afficherOnglet('dashboard');
}

// ============================================================
// TABLEAU DE BORD
// ============================================================
function carteKpi(titre, valeur, sous, variant) {
  return `
    <div class="kpi-carte variant-${variant}">
      <span class="label-stat">${titre}</span>
      <strong>${valeur}</strong>
      <span class="sous-stat">${sous}</span>
    </div>`;
}

function resumeCard(titre, valeur, meta) {
  return `
    <div class="summary-stat">
      <span class="label-stat">${titre}</span>
      <strong>${valeur}</strong>
      <div class="meta">${meta}</div>
    </div>`;
}

function blocResume(titre, cartes) {
  return `
    <div class="carte">
      <div class="carte-entete"><h3>${titre}</h3></div>
      <div class="resume-sous-grille">${cartes.join('')}</div>
    </div>`;
}

async function chargerStats() {
  if (roleUtilisateur !== 'admin') return;
  try {
    const { data } = await SenegalConnectAPI.appelApi('/api/stats');
    statsCache = data;
  } catch (erreur) {
    console.error('[app] Statistiques indisponibles :', erreur.message);
  }
  renderDashboard();
}

function renderKpi() {
  const conteneur = $('kpi-cartes');
  let cartes = '';

  if (roleUtilisateur === 'admin' && statsCache) {
    cartes += carteKpi('Clients actifs', statsCache.clients_actifs, 'Abonnés en service', 1);
    cartes += carteKpi('MRR', `${formatPrix(statsCache.mrr_fcfa)} FCFA`, 'Revenu mensuel récurrent', 2);
    cartes += carteKpi('Factures impayées', statsCache.factures_impayees, 'Impayées ou en retard', 3);
    cartes += carteKpi('Tickets ouverts', statsCache.tickets_ouverts, 'En attente de traitement', 4);
  } else if (roleUtilisateur === 'agent') {
    const actifs = clientsTous.filter((c) => c.statut === 'actif').length;
    const ouverts = ticketsTous.filter((t) => t.statut === 'ouvert').length;
    const enCours = ticketsTous.filter((t) => t.statut === 'en_cours').length;
    cartes += carteKpi('Tickets ouverts', ouverts, 'En attente', 1);
    cartes += carteKpi('Tickets en cours', enCours, 'Assignés aux agents', 2);
    cartes += carteKpi('Clients actifs', actifs, `Sur ${clientsTous.length} clients`, 3);
    cartes += carteKpi('Forfaits actifs', forfaitsTous.filter((f) => f.actif).length, 'Catalogue commercial', 4);
  } else {
    const ouverts = ticketsTous.filter((t) => t.statut === 'ouvert').length;
    const enCours = ticketsTous.filter((t) => t.statut === 'en_cours').length;
    const fermes = ticketsTous.filter((t) => t.statut === 'ferme').length;
    cartes += carteKpi('Tickets ouverts', ouverts, 'En attente', 1);
    cartes += carteKpi('Tickets en cours', enCours, 'En traitement', 2);
    cartes += carteKpi('Tickets fermés', fermes, 'Historique', 3);
    cartes += carteKpi('Forfaits disponibles', forfaitsTous.length, 'Catalogue', 4);
  }

  conteneur.innerHTML = cartes;
}

function renderTicketsRecents() {
  const conteneur = $('liste-tickets-recents');
  conteneur.innerHTML = '';
  const recents = [...ticketsTous]
    .sort((a, b) => new Date(b.ouvert_le) - new Date(a.ouvert_le))
    .slice(0, 5);

  if (!recents.length) {
    conteneur.innerHTML = '<li class="etat-vide-liste">Aucun ticket pour le moment.</li>';
    return;
  }

  recents.forEach((ticket) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'item-recent';
    item.innerHTML = `
      <span class="icone-conteneur">${ICONE_TICKET}</span>
      <span class="texte-recent">
        <strong>${echapper(ticket.sujet)}</strong>
        <span>#${ticket.id} · ${formaterDateHeure(ticket.ouvert_le)}</span>
      </span>
      ${badgeHtml(ticket.statut)}
    `;
    item.addEventListener('click', () => {
      afficherOnglet('tickets');
      ouvrirTicket(ticket.id);
    });
    conteneur.appendChild(item);
  });
}

function renderActionsRapides() {
  const conteneur = $('actions-rapides');
  conteneur.innerHTML = '';

  const actions = [];
  actions.push({ icone: ICONE_TICKET, libelle: 'Ouvrir un ticket', note: 'Support', action: ouvrirModalNouveauTicket });
  actions.push({ icone: ICONE_UTILISATEUR, libelle: 'Voir mon profil', note: 'Compte', action: ouvrirProfil });
  if (['agent', 'admin'].includes(roleUtilisateur)) {
    actions.push({ icone: ICONE_CLIENTS, libelle: 'Gérer les clients', note: 'Abonnés', action: () => afficherOnglet('clients') });
  }
  if (roleUtilisateur === 'admin') {
    actions.push({ icone: ICONE_FACTURE, libelle: 'Nouvelle facture', note: 'Facturation', action: ouvrirModalFacture });
  }

  actions.forEach((a) => {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'action-rapide';
    bouton.innerHTML = `${a.icone}<span>${a.libelle}</span><span class="note">${a.note}</span>`;
    bouton.addEventListener('click', a.action);
    conteneur.appendChild(bouton);
  });
}

function renderResumes() {
  const conteneur = $('resumes-dashboard');
  const blocs = [];

  const ticketsOuverts = ticketsTous.filter((t) => t.statut === 'ouvert').length;
  const ticketsEnCours = ticketsTous.filter((t) => t.statut === 'en_cours').length;
  const ticketsFermes = ticketsTous.filter((t) => t.statut === 'ferme').length;
  blocs.push(blocResume('Tickets', [
    resumeCard('Total', ticketsTous.length, 'Toutes les demandes'),
    resumeCard('Ouverts', ticketsOuverts, 'En attente de traitement'),
    resumeCard('En cours', ticketsEnCours, 'Assignés aux agents'),
    resumeCard('Fermés', ticketsFermes, 'Demandes traitées'),
  ]));

  if (['agent', 'admin'].includes(roleUtilisateur)) {
    blocs.push(blocResume('Clients', [
      resumeCard('Suivis', clientsTous.length, 'Abonnés enregistrés'),
      resumeCard('Actifs', clientsTous.filter((c) => c.statut === 'actif').length, 'Service actif'),
      resumeCard('Suspendus', clientsTous.filter((c) => c.statut === 'suspendu').length, 'En pause'),
      resumeCard('Résiliés', clientsTous.filter((c) => c.statut === 'resilie').length, 'Comptes fermés'),
    ]));
  }

  const prixMoyen = forfaitsTous.length
    ? forfaitsTous.reduce((acc, f) => acc + Number(f.prix_mensuel_fcfa || 0), 0) / forfaitsTous.length
    : 0;
  blocs.push(blocResume('Forfaits', [
    resumeCard('Offres', forfaitsTous.length, 'Catalogue disponible'),
    resumeCard('Actifs', forfaitsTous.filter((f) => f.actif).length, 'Commercialisés'),
    resumeCard('Abonnés', forfaitsTous.reduce((acc, f) => acc + Number(f.nb_clients || 0), 0), 'Tous statuts confondus'),
    resumeCard('Prix moyen', `${formatPrix(prixMoyen)} FCFA`, 'Roll-up tarifaire'),
  ]));

  if (roleUtilisateur === 'admin') {
    blocs.push(blocResume('Factures', [
      resumeCard('Total', facturesTous.length, 'Factures émises'),
      resumeCard('Payées', facturesTous.filter((f) => f.statut === 'payee').length, 'Encaissements reçus'),
      resumeCard('Impayées', facturesTous.filter((f) => f.statut === 'impayee').length, 'Rappels nécessaires'),
      resumeCard('En retard', facturesTous.filter((f) => f.statut === 'en_retard').length, 'Relances'),
    ]));
  }

  conteneur.innerHTML = blocs.join('');
}

function renderDashboard() {
  renderKpi();
  renderTicketsRecents();
  renderActionsRapides();
  renderResumes();
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
    const accepte = await demanderReponseAppel(`Appel ${type} entrant`, `Appel ${type} entrant de ${initiateur.nom}. Accepter ?`);
    if (!accepte) { socket.emit('appel:refuser', { appelId }); return; }

    $('panneau-appel').hidden = false;
    try {
      await SenegalConnectWebRTC.demarrerFluxLocal({ audio: true, video: type === 'video' });
      SenegalConnectWebRTC.repondreAppelActuel();
      socket.emit('appel:accepter', { appelId, peerId: peerIdLocal }, (rep) => {
        if (!rep.succes) {
          $('statut-appel').textContent = `Erreur : ${rep.message}`;
        } else {
          demarrerChronometreAppel();
        }
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
    demarrerChronometreAppel();
  });

  socket.on('appel:refuse', () => terminerAppelLocalement('Appel refusé'));
  socket.on('appel:termine', ({ duree_secondes }) => terminerAppelLocalement(`Appel terminé (${duree_secondes}s)`));

  socket.on('appel:controle', ({ micro, video, partageEcran }) => {
    const morceaux = [];
    if (micro === false) morceaux.push('Micro coupé (distant)');
    if (video === false) morceaux.push('Caméra coupée (distant)');
    if (partageEcran === true) morceaux.push("Partage d'écran actif (distant)");
    if (morceaux.length) $('statut-appel').textContent = morceaux.join(' — ');
  });

  socket.on('appel:historique', (appel) => {
    if (appel.ticket_id === ticketActifId) afficherAppelDansChat(appel);
  });
}

// ============================================================
// TICKETS
// ============================================================
async function chargerTickets() {
  try {
    const { data } = await SenegalConnectAPI.appelApi('/api/tickets');
    ticketsTous = data;
  } catch (erreur) {
    afficherToast(erreur.message, true);
  }
  renderTicketsListe(ticketsTous);
  afficherResumeTickets(ticketsTous);

  const nbOuverts = ticketsTous.filter((t) => t.statut === 'ouvert').length;
  const badge = $('badge-tickets-ouverts');
  if (nbOuverts > 0) {
    badge.hidden = false;
    badge.textContent = nbOuverts;
  } else {
    badge.hidden = true;
  }

  renderDashboard();
}

function renderTicketsListe(data) {
  const liste = $('liste-tickets');
  const filtre = ($('recherche-tickets').value || '').toLowerCase();
  liste.innerHTML = '';

  const filtres = data.filter((ticket) =>
    !filtre || ticket.sujet.toLowerCase().includes(filtre) || String(ticket.id).includes(filtre)
  );

  if (!filtres.length) {
    liste.innerHTML = '<li class="etat-vide-liste">Aucun ticket trouvé.</li>';
    return;
  }

  filtres.forEach((ticket) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `item-ticket${ticket.id === ticketActifId ? ' actif' : ''}`;
    const agent = ticket.agent_nom ? `${ticket.agent_nom} ${ticket.agent_prenom || ''}` : 'Non assigné';
    item.innerHTML = `
      <span class="sujet">${echapper(ticket.sujet)}</span>
      <span class="meta-ligne">
        <span class="meta">#${ticket.id} · ${echapper(agent)}</span>
        ${badgeHtml(ticket.statut)}
      </span>
    `;
    item.addEventListener('click', () => ouvrirTicket(ticket.id));
    liste.appendChild(item);
  });
}

function afficherResumeTickets(tickets) {
  const conteneur = $('stats-tickets');
  if (!conteneur) return;
  conteneur.innerHTML = [
    resumeCard('Total', tickets.length, 'Toutes les demandes'),
    resumeCard('Ouverts', tickets.filter((t) => t.statut === 'ouvert').length, 'En attente de traitement'),
    resumeCard('En cours', tickets.filter((t) => t.statut === 'en_cours').length, 'Assignés aux agents'),
    resumeCard('Fermés', tickets.filter((t) => t.statut === 'ferme').length, 'Demandes traitées'),
  ].join('');
}

$('recherche-tickets').addEventListener('input', () => renderTicketsListe(ticketsTous));

function ouvrirModalNouveauTicket() {
  const corps = document.createElement('div');
  corps.className = 'form-modal';
  corps.innerHTML = `
    <label>Sujet de la demande
      <input id="champ-sujet-ticket" type="text" maxlength="255" placeholder="Ex : Ma facture FAC-202602-0001 est incorrecte" />
    </label>
  `;
  const valider = document.createElement('button');
  valider.type = 'button';
  valider.className = 'btn btn-primary';
  valider.textContent = 'Ouvrir le ticket';
  valider.addEventListener('click', () => {
    const sujet = $('champ-sujet-ticket').value.trim();
    if (!sujet) { afficherToast('Le sujet est requis', true); return; }
    socket.emit('ticket:ouvrir', { sujet }, (rep) => {
      fermerModale();
      if (rep.succes) {
        afficherToast('Ticket créé avec succès');
        afficherOnglet('tickets');
        ouvrirTicket(rep.ticket.id);
        chargerTickets();
      } else {
        afficherToast(`Erreur : ${rep.message}`, true);
      }
    });
  });
  ouvrirModale('Nouveau ticket', corps, [valider]);
}

$('bouton-ouvrir-ticket').addEventListener('click', ouvrirModalNouveauTicket);
$('bouton-ouvrir-ticket-dash').addEventListener('click', ouvrirModalNouveauTicket);

async function ouvrirTicket(ticketId) {
  ticketActifId = ticketId;
  const { ticket } = await SenegalConnectAPI.appelApi(`/api/tickets/${ticketId}`);

  socket.emit('ticket:rejoindre', { ticketId });

  $('zone-sans-ticket').hidden = true;
  $('zone-ticket').hidden = false;
  $('titre-ticket-actif').textContent = `#${ticket.id} — ${ticket.sujet}`;

  const badge = $('statut-ticket-actif');
  badge.textContent = formaterStatut(ticket.statut);
  badge.className = `badge-statut ${ticket.statut}`;

  const affectation = ticket.agent_nom
    ? `Assigné à ${ticket.agent_nom} ${ticket.agent_prenom || ''}`
    : (ticket.statut === 'ouvert' ? 'En attente d\'un agent' : 'Non assigné');
  $('info-affectation-ticket').textContent = affectation;

  const estAgentOuAdmin = ['agent', 'admin'].includes(roleUtilisateur);
  $('bouton-prendre-en-charge').hidden = !(estAgentOuAdmin && ticket.statut === 'ouvert');
  $('bouton-fermer-ticket').hidden = !(estAgentOuAdmin && ticket.statut !== 'ferme');

  $('liste-messages').innerHTML = '';
  const [reponseMessages, reponseAppels] = await Promise.all([
    SenegalConnectAPI.appelApi(`/api/tickets/${ticketId}/messages`),
    SenegalConnectAPI.appelApi(`/api/tickets/${ticketId}/appels`),
  ]);

  const evenements = [
    ...reponseMessages.data.map((m) => ({ ...m, date: m.envoye_le, typeEvenement: 'message' })),
    ...reponseAppels.data.map((a) => ({ ...a, date: a.debut_le, typeEvenement: 'appel' })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  evenements.forEach((evenement) => {
    if (evenement.typeEvenement === 'appel') afficherAppelDansChat(evenement);
    else afficherMessage(evenement);
  });
  $('liste-messages').scrollTop = $('liste-messages').scrollHeight;

  renderTicketsListe(ticketsTous);
}

$('bouton-prendre-en-charge').addEventListener('click', () => {
  socket.emit('ticket:assigner', { ticketId: ticketActifId }, (rep) => {
    if (rep.succes) ouvrirTicket(ticketActifId);
    else afficherToast(`Erreur : ${rep.message}`, true);
  });
});

$('bouton-fermer-ticket').addEventListener('click', () => {
  socket.emit('ticket:fermer', { ticketId: ticketActifId }, (rep) => {
    if (rep.succes) ouvrirTicket(ticketActifId);
    else afficherToast(`Erreur : ${rep.message}`, true);
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
  bulle.dataset.date = message.envoye_le;

  let contenuHtml = '';
  if (message.type === 'image') {
    contenuHtml = `<img src="${echapper(message.fichier_url)}" alt="${echapper(message.fichier_nom || 'image')}" />`;
  } else if (message.type === 'audio') {
    contenuHtml = `<audio controls src="${echapper(message.fichier_url)}"></audio>`;
  } else if (message.type === 'fichier') {
    contenuHtml = `<a class="fichier-pdf" href="${echapper(message.fichier_url)}" target="_blank" rel="noopener">📄 ${echapper(message.fichier_nom || 'fichier')} (${formaterTaille(message.fichier_taille)})</a>`;
  } else {
    contenuHtml = echapper(message.contenu || '');
  }

  const nomExpediteur = [message.expediteur_prenom, message.expediteur_nom].filter(Boolean).join(' ') || 'Utilisateur';

  bulle.innerHTML = `
    <div class="expediteur">${echapper(nomExpediteur)}${message.expediteur_role ? ` · ${echapper(message.expediteur_role)}` : ''}</div>
    <div class="contenu">${contenuHtml}</div>
    <div class="reactions" data-reactions-pour="${message.id}"></div>
    <div class="horodatage">${formaterHeure(message.envoye_le)} ${estSoi ? '<span class="coche">✓</span>' : ''}</div>
  `;

  bulle.querySelector('.reactions').appendChild(construireBarreReactions(message.id, []));

  $('liste-messages').appendChild(bulle);
  $('liste-messages').scrollTop = $('liste-messages').scrollHeight;
}

function formaterStatutAppel(statut) {
  return ({
    initie: 'en attente',
    accepte: 'accepté',
    refuse: 'refusé',
    termine: 'terminé',
  })[statut] || statut;
}

function formaterDureeAppel(secondes) {
  const total = Number(secondes) || 0;
  const minutes = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function afficherAppelDansChat(appel) {
  if (appel.ticket_id !== ticketActifId) return;

  const existant = document.querySelector(`[data-appel-id="${appel.id}"]`);
  if (existant) existant.remove();

  const bulle = document.createElement('div');
  bulle.className = 'message-bulle systeme-appel';
  bulle.dataset.appelId = appel.id;
  bulle.dataset.date = appel.debut_le;

  const icone = appel.type === 'video' ? '📹' : '📞';
  const libelleType = appel.type === 'video' ? 'Vidéo' : 'Audio';
  const initiateur = [appel.initiateur_nom, appel.destinataire_nom].filter(Boolean).join(' ⇄ ') || 'Appel';
  const duree = (appel.statut === 'termine' && appel.duree_secondes > 0)
    ? ` · ${formaterDureeAppel(appel.duree_secondes)}`
    : '';

  bulle.innerHTML = `
    <div class="contenu">${icone} <strong>Appel ${libelleType}</strong> — ${echapper(initiateur)}<br>
      <span class="statut-appel-liste">${formaterStatutAppel(appel.statut)}</span>${duree}</div>
    <div class="horodatage">${formaterHeure(appel.debut_le)}</div>
  `;

  insererBulleChronologique(bulle);
  $('liste-messages').scrollTop = $('liste-messages').scrollHeight;
}

function insererBulleChronologique(bulle) {
  const liste = $('liste-messages');
  const date = new Date(bulle.dataset.date).getTime();
  const bulles = [...liste.querySelectorAll('.message-bulle')];
  let insere = false;
  for (const autre of bulles) {
    if (new Date(autre.dataset.date).getTime() > date) {
      liste.insertBefore(bulle, autre);
      insere = true;
      break;
    }
  }
  if (!insere) liste.appendChild(bulle);
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
  boutonReagir.title = 'Ajouter une réaction';
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
      const champ = $('champ-message');
      if (dernierEmojiInsere && champ.value.endsWith(dernierEmojiInsere)) {
        champ.value = champ.value.slice(0, -dernierEmojiInsere.length);
        dernierEmojiInsere = null;
      } else {
        champ.value += emoji;
        dernierEmojiInsere = emoji;
      }
      panneau.hidden = true;
      champ.focus();
    });
    panneau.appendChild(span);
  });
  panneau.hidden = !panneau.hidden;
});

function envoyerMessageTexte() {
  const contenu = $('champ-message').value.trim();
  if (!contenu || !ticketActifId) return;
  socket.emit('message:envoyer', { ticketId: ticketActifId, contenu, type: 'texte' }, (rep) => {
    if (!rep.succes) afficherToast(`Erreur : ${rep.message}`, true);
  });
  $('champ-message').value = '';
}
$('bouton-envoyer-message').addEventListener('click', envoyerMessageTexte);
$('champ-message').addEventListener('keydown', (e) => { if (e.key === 'Enter') envoyerMessageTexte(); });

$('champ-message').addEventListener('input', () => {
  dernierEmojiInsere = null;
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
    afficherToast(`Erreur upload : ${erreur.message}`, true);
  }
  e.target.value = '';
});

// ============================================================
// CLIENTS
// ============================================================
async function chargerClients() {
  if (!['agent', 'admin'].includes(roleUtilisateur)) return;
  try {
    const { data } = await SenegalConnectAPI.appelApi('/api/clients');
    clientsTous = data;
  } catch (erreur) {
    afficherToast(erreur.message, true);
  }
  renderClientsTable(clientsTous);
  afficherResumeClients(clientsTous);
  renderDashboard();
}

function renderClientsTable(data) {
  const tbody = $('liste-clients');
  const filtre = ($('recherche-clients').value || '').toLowerCase();
  const statut = $('filtre-client-statut').value;
  tbody.innerHTML = '';

  const filtres = data.filter((client) => {
    const okStatut = !statut || client.statut === statut;
    const okTexte = !filtre
      || `${client.nom} ${client.prenom} ${client.msisdn} ${client.email}`.toLowerCase().includes(filtre);
    return okStatut && okTexte;
  });

  if (!filtres.length) {
    tbody.innerHTML = '<tr class="ligne-vide"><td colspan="5">Aucun client trouvé.</td></tr>';
    return;
  }

  filtres.forEach((client) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="cellule-nom">
        <strong>${echapper(client.prenom)} ${echapper(client.nom)}</strong>
        <span>#${client.id} · inscrit le ${formaterDate(client.date_inscription)}</span>
      </td>
      <td>
        <div>${echapper(client.email)}</div>
        <div class="cellule-mono">${echapper(client.msisdn)}</div>
      </td>
      <td>${client.forfait_nom ? echapper(client.forfait_nom) : '<span class="texte-faible">Aucun</span>'}</td>
      <td>${badgeHtml(client.statut)}</td>
    `;

    const tdActions = document.createElement('td');
    tdActions.className = 'col-actions';

    const boutonStatut = document.createElement('button');
    boutonStatut.type = 'button';
    boutonStatut.className = 'btn btn-ghost btn-sm';
    boutonStatut.textContent = client.statut === 'actif' ? 'Suspendre' : 'Réactiver';
    boutonStatut.addEventListener('click', async () => {
      const nouveauStatut = client.statut === 'actif' ? 'suspendu' : 'actif';
      try {
        await SenegalConnectAPI.appelApi(`/api/clients/${client.id}/statut`, {
          method: 'PATCH',
          body: JSON.stringify({ statut: nouveauStatut }),
        });
        afficherToast(`Statut mis à jour : ${formaterStatut(nouveauStatut)}`);
        chargerClients();
      } catch (erreur) {
        afficherToast(erreur.message, true);
      }
    });

    const boutonSupprimer = document.createElement('button');
    boutonSupprimer.type = 'button';
    boutonSupprimer.className = 'btn btn-danger btn-sm';
    boutonSupprimer.textContent = 'Suppr.';
    boutonSupprimer.addEventListener('click', async () => {
      if (!await demanderConfirmation('Supprimer ce client ?', `${client.prenom} ${client.nom} sera supprimé définitivement.`)) return;
      try {
        await SenegalConnectAPI.appelApi(`/api/clients/${client.id}`, { method: 'DELETE' });
        afficherToast('Client supprimé');
        chargerClients();
      } catch (erreur) {
        afficherToast(erreur.message, true);
      }
    });

    tdActions.append(boutonStatut, boutonSupprimer);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });
}

function afficherResumeClients(clients) {
  const conteneur = $('stats-clients');
  if (!conteneur) return;
  conteneur.innerHTML = [
    resumeCard('Clients suivis', clients.length, 'Abonnés enregistrés'),
    resumeCard('Actifs', clients.filter((c) => c.statut === 'actif').length, 'Service actif'),
    resumeCard('Suspendus', clients.filter((c) => c.statut === 'suspendu').length, 'En pause'),
    resumeCard('Résiliés', clients.filter((c) => c.statut === 'resilie').length, 'Comptes fermés'),
  ].join('');
}

$('recherche-clients').addEventListener('input', () => renderClientsTable(clientsTous));
$('filtre-client-statut').addEventListener('change', () => renderClientsTable(clientsTous));

function ouvrirModalNouveauClient() {
  const optionsForfaits = forfaitsTous
    .map((f) => `<option value="${f.id}">${echapper(f.nom)} — ${formatPrix(f.prix_mensuel_fcfa)} FCFA</option>`)
    .join('');

  const corps = document.createElement('div');
  corps.className = 'form-modal';
  corps.innerHTML = `
    <div class="grille-form">
      <label>Prénom<input id="nc-prenom" /></label>
      <label>Nom<input id="nc-nom" /></label>
      <label>Email<input id="nc-email" type="email" /></label>
      <label>Mot de passe (8 caractères min.)<input id="nc-mdp" type="password" minlength="8" /></label>
      <label>MSISDN<input id="nc-msisdn" placeholder="+221XXXXXXXXX" /></label>
      <label>Forfait
        <select id="nc-forfait">
          <option value="">Aucun forfait</option>
          ${optionsForfaits}
        </select>
      </label>
      <label>Statut
        <select id="nc-statut">
          <option value="actif">Actif</option>
          <option value="suspendu">Suspendu</option>
          <option value="resilie">Résilié</option>
        </select>
      </label>
    </div>
  `;

  const valider = document.createElement('button');
  valider.type = 'button';
  valider.className = 'btn btn-primary';
  valider.textContent = 'Créer le client';
  valider.addEventListener('click', async () => {
    const donnees = {
      prenom: $('nc-prenom').value.trim(),
      nom: $('nc-nom').value.trim(),
      email: $('nc-email').value.trim(),
      mdp: $('nc-mdp').value,
      msisdn: $('nc-msisdn').value.trim(),
      forfait_id: $('nc-forfait').value ? Number($('nc-forfait').value) : null,
      statut: $('nc-statut').value,
    };

    if (!donnees.nom || !donnees.prenom || !donnees.email || !donnees.mdp || !donnees.msisdn) {
      afficherToast('Veuillez remplir tous les champs', true);
      return;
    }

    try {
      const { utilisateur: utilisateurCree } = await SenegalConnectAPI.appelApi('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          nom: donnees.nom,
          prenom: donnees.prenom,
          email: donnees.email,
          mot_de_passe: donnees.mdp,
        }),
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

      fermerModale();
      afficherToast('Client créé avec succès');
      chargerClients();
    } catch (erreur) {
      afficherToast(erreur.message, true);
    }
  });

  ouvrirModale('Nouveau client', corps, [valider]);
}

$('bouton-nouveau-client').addEventListener('click', ouvrirModalNouveauClient);

// ============================================================
// FORFAITS
// ============================================================
async function chargerForfaits() {
  try {
    const { data } = await SenegalConnectAPI.appelApi('/api/forfaits');
    forfaitsTous = data;
  } catch (erreur) {
    afficherToast(erreur.message, true);
  }
  renderForfaitsGrille(forfaitsTous);
  afficherResumeForfaits(forfaitsTous);
  renderDashboard();
}

function renderForfaitsGrille(data) {
  const conteneur = $('liste-forfaits');
  conteneur.innerHTML = '';

  if (!data.length) {
    conteneur.innerHTML = '<p class="etat-vide-liste">Aucun forfait disponible.</p>';
    return;
  }

  data.forEach((forfait) => {
    const carte = document.createElement('div');
    carte.className = 'carte-forfait';
    carte.innerHTML = `
      <div class="forfait-entete">
        <h3>${echapper(forfait.nom)}</h3>
        <span class="badge-statut ${forfait.actif ? 'actif' : 'resilie'}">${forfait.actif ? 'Actif' : 'Inactif'}</span>
      </div>
      <div class="forfait-prix">${formatPrix(forfait.prix_mensuel_fcfa)} <span>FCFA / mois</span></div>
      <div class="forfait-caracteristiques">
        <div class="caracteristique"><span>Data</span><strong>${forfait.quota_data_go} Go</strong></div>
        <div class="caracteristique"><span>Voix</span><strong>${forfait.quota_voix_min} min</strong></div>
      </div>
      <div class="forfait-pied">
        <span class="nb-abonnes">${forfait.nb_clients} abonné(s)</span>
        <div class="forfait-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-action-forfait="editer">Éditer</button>
          <button type="button" class="btn btn-danger btn-sm" data-action-forfait="supprimer">Suppr.</button>
        </div>
      </div>
    `;

    carte.querySelector('[data-action-forfait="editer"]').addEventListener('click', () => ouvrirModalForfait(forfait));
    carte.querySelector('[data-action-forfait="supprimer"]').addEventListener('click', async () => {
      if (!await demanderConfirmation('Supprimer ce forfait ?', `Le forfait « ${forfait.nom} » sera supprimé définitivement.`)) return;
      try {
        await SenegalConnectAPI.appelApi(`/api/forfaits/${forfait.id}`, { method: 'DELETE' });
        afficherToast('Forfait supprimé');
        chargerForfaits();
      } catch (erreur) {
        afficherToast(erreur.message, true);
      }
    });

    conteneur.appendChild(carte);
  });
}

function afficherResumeForfaits(forfaits) {
  const conteneur = $('stats-forfaits');
  if (!conteneur) return;
  const prixMoyen = forfaits.length
    ? forfaits.reduce((acc, f) => acc + Number(f.prix_mensuel_fcfa || 0), 0) / forfaits.length
    : 0;
  conteneur.innerHTML = [
    resumeCard('Forfaits', forfaits.length, 'Offres disponibles'),
    resumeCard('Actifs', forfaits.filter((f) => f.actif).length, 'Commercialisés'),
    resumeCard('Clients abonnés', forfaits.reduce((acc, f) => acc + Number(f.nb_clients || 0), 0), 'Tous statuts confondus'),
    resumeCard('Prix moyen', `${formatPrix(prixMoyen)} FCFA`, 'Roll-up tarifaire'),
  ].join('');
}

function ouvrirModalForfait(forfait = null) {
  const enEdition = Boolean(forfait);
  const corps = document.createElement('div');
  corps.className = 'form-modal';
  corps.innerHTML = `
    <div class="grille-form">
      <label>Nom du forfait<input id="ff-nom" value="${enEdition ? echapper(forfait.nom) : ''}" /></label>
      <label>Prix mensuel (FCFA)<input id="ff-prix" type="number" min="0" step="100" value="${enEdition ? forfait.prix_mensuel_fcfa : ''}" /></label>
      <label>Quota data (Go)<input id="ff-data" type="number" min="0" step="0.1" value="${enEdition ? forfait.quota_data_go : ''}" /></label>
      <label>Quota voix (min)<input id="ff-voix" type="number" min="0" value="${enEdition ? forfait.quota_voix_min : ''}" /></label>
    </div>
    <label class="case-bool">
      <input id="ff-actif" type="checkbox" ${!enEdition || forfait.actif ? 'checked' : ''} />
      Forfait actif
    </label>
  `;

  const valider = document.createElement('button');
  valider.type = 'button';
  valider.className = 'btn btn-primary';
  valider.textContent = enEdition ? 'Enregistrer' : 'Créer le forfait';
  valider.addEventListener('click', async () => {
    const payload = {
      nom: $('ff-nom').value.trim(),
      prix_mensuel_fcfa: Number($('ff-prix').value),
      quota_data_go: Number($('ff-data').value),
      quota_voix_min: Number($('ff-voix').value),
      actif: $('ff-actif').checked,
    };

    if (!payload.nom || Number.isNaN(payload.prix_mensuel_fcfa)) {
      afficherToast('Vérifiez les champs du forfait', true);
      return;
    }

    try {
      if (enEdition) {
        await SenegalConnectAPI.appelApi(`/api/forfaits/${forfait.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        afficherToast('Forfait modifié');
      } else {
        await SenegalConnectAPI.appelApi('/api/forfaits', { method: 'POST', body: JSON.stringify(payload) });
        afficherToast('Forfait créé');
      }
      fermerModale();
      chargerForfaits();
    } catch (erreur) {
      afficherToast(erreur.message, true);
    }
  });

  ouvrirModale(enEdition ? 'Modifier le forfait' : 'Nouveau forfait', corps, [valider]);
}

$('bouton-nouveau-forfait').addEventListener('click', () => ouvrirModalForfait());

// ============================================================
// FACTURES
// ============================================================
async function chargerFactures() {
  if (roleUtilisateur !== 'admin') return;
  const statut = $('filtre-facture-statut').value;
  const periode = $('filtre-facture-periode').value;
  const query = new URLSearchParams();
  if (statut) query.set('statut', statut);
  if (periode) query.set('periode', periode);

  try {
    const { data } = await SenegalConnectAPI.appelApi(`/api/factures${query.toString() ? `?${query.toString()}` : ''}`);
    facturesTous = data;
  } catch (erreur) {
    afficherToast(erreur.message, true);
  }
  renderFacturesTable(facturesTous);
  afficherResumeFactures(facturesTous);
  renderDashboard();
}

function renderFacturesTable(data) {
  const tbody = $('liste-factures');
  tbody.innerHTML = '';

  if (!data.length) {
    tbody.innerHTML = '<tr class="ligne-vide"><td colspan="7">Aucune facture trouvée.</td></tr>';
    return;
  }

  data.forEach((facture) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="cellule-mono">${echapper(facture.reference)}</td>
      <td class="cellule-nom">
        <strong>${echapper(facture.client_prenom)} ${echapper(facture.client_nom)}</strong>
        <span>${echapper(facture.client_msisdn)}</span>
      </td>
      <td>${echapper(facture.periode)}</td>
      <td class="cellule-montant">${formatPrix(facture.montant_fcfa)} FCFA</td>
      <td>${formaterDate(facture.date_echeance)}</td>
      <td>${badgeHtml(facture.statut)}</td>
    `;

    const tdAction = document.createElement('td');
    tdAction.className = 'col-actions';
    const boutonStatut = document.createElement('button');
    boutonStatut.type = 'button';
    boutonStatut.className = 'btn btn-ghost btn-sm';
    boutonStatut.textContent = 'Changer statut';
    boutonStatut.addEventListener('click', async () => {
      const prochainStatut = facture.statut === 'impayee' ? 'en_retard' : facture.statut === 'en_retard' ? 'payee' : 'impayee';
      try {
        await SenegalConnectAPI.appelApi(`/api/factures/${facture.id}/statut`, {
          method: 'PUT',
          body: JSON.stringify({ statut: prochainStatut }),
        });
        afficherToast(`Facture mise à ${formaterStatut(prochainStatut)}`);
        chargerFactures();
      } catch (erreur) {
        afficherToast(erreur.message, true);
      }
    });

    tdAction.appendChild(boutonStatut);
    tr.appendChild(tdAction);
    tbody.appendChild(tr);
  });
}

function afficherResumeFactures(factures) {
  const conteneur = $('stats-factures');
  if (!conteneur) return;
  const totalMontant = factures.reduce((acc, f) => acc + Number(f.montant_fcfa || 0), 0);
  conteneur.innerHTML = [
    resumeCard('Factures', factures.length, 'Total factures'),
    resumeCard('Payées', factures.filter((f) => f.statut === 'payee').length, 'Encaissements reçus'),
    resumeCard('Impayées', factures.filter((f) => f.statut === 'impayee').length, 'Rappels nécessaires'),
    resumeCard('Montant total', `${formatPrix(totalMontant)} FCFA`, 'Portefeuille factures'),
  ].join('');
}

$('filtre-facture-statut').addEventListener('change', chargerFactures);
$('filtre-facture-periode').addEventListener('change', chargerFactures);
$('bouton-recharger-factures').addEventListener('click', chargerFactures);

function ouvrirModalFacture() {
  const optionsClients = clientsTous
    .map((c) => `<option value="${c.id}">${echapper(c.prenom)} ${echapper(c.nom)} — ${echapper(c.msisdn)}</option>`)
    .join('');

  const corps = document.createElement('div');
  corps.className = 'form-modal';
  corps.innerHTML = `
    <div class="grille-form">
      <label>Client
        <select id="nf-client">
          <option value="">Sélectionner un client...</option>
          ${optionsClients}
        </select>
      </label>
      <label>Période<input id="nf-periode" type="month" /></label>
      <label>Montant (FCFA)<input id="nf-montant" type="number" min="0" step="100" /></label>
      <label>Date d'échéance<input id="nf-echeance" type="date" /></label>
      <label>Statut
        <select id="nf-statut">
          <option value="impayee">Impayée</option>
          <option value="payee">Payée</option>
          <option value="en_retard">En retard</option>
        </select>
      </label>
    </div>
  `;

  const valider = document.createElement('button');
  valider.type = 'button';
  valider.className = 'btn btn-primary';
  valider.textContent = 'Créer la facture';
  valider.addEventListener('click', async () => {
    const payload = {
      client_id: Number($('nf-client').value),
      periode: $('nf-periode').value,
      montant_fcfa: Number($('nf-montant').value),
      date_echeance: $('nf-echeance').value,
      statut: $('nf-statut').value,
    };

    if (!payload.client_id || !payload.periode || Number.isNaN(payload.montant_fcfa) || !payload.date_echeance) {
      afficherToast('Veuillez remplir tous les champs', true);
      return;
    }

    try {
      await SenegalConnectAPI.appelApi('/api/factures', { method: 'POST', body: JSON.stringify(payload) });
      fermerModale();
      afficherToast('Facture créée');
      chargerFactures();
    } catch (erreur) {
      afficherToast(erreur.message, true);
    }
  });

  ouvrirModale('Nouvelle facture', corps, [valider]);
}

$('bouton-nouvelle-facture').addEventListener('click', ouvrirModalFacture);

// ============================================================
// PROFIL
// ============================================================
async function ouvrirProfil() {
  try {
    const { utilisateur: profil } = await SenegalConnectAPI.appelApi('/api/auth/profil');
    const detail = document.createElement('div');
    detail.className = 'profil-details';
    const nom = document.createElement('strong');
    nom.textContent = [profil.prenom, profil.nom].filter(Boolean).join(' ') || profil.email;
    detail.appendChild(nom);
    [['Email', profil.email], ['Rôle', profil.role], ['Identifiant', profil.id], ['Compte créé', formaterDate(profil.cree_le)]].forEach(([libelle, valeur]) => {
      const ligne = document.createElement('div');
      ligne.className = 'ligne-profil';
      ligne.innerHTML = `<span>${libelle}</span><span>${echapper(String(valeur ?? '—'))}</span>`;
      detail.appendChild(ligne);
    });
    ouvrirModale('Mon profil', detail);
  } catch (erreur) {
    afficherToast(erreur.message || 'Impossible de charger le profil', true);
  }
}

$('bouton-profil').addEventListener('click', ouvrirProfil);
$('bouton-deconnexion').addEventListener('click', () => {
  SenegalConnectAPI.effacerSession();
  window.location.href = 'login.html';
});

// ============================================================
// APPELS AUDIO / VIDÉO
// ============================================================
$('bouton-appel-audio').addEventListener('click', () => demarrerAppel('audio'));
$('bouton-appel-video').addEventListener('click', () => demarrerAppel('video'));

async function demarrerAppel(type) {
  if (!ticketActifId) return;
  $('panneau-appel').hidden = false;
  try {
    await SenegalConnectWebRTC.demarrerFluxLocal({ audio: true, video: type === 'video' });
  } catch (erreur) {
    $('statut-appel').textContent = `Erreur caméra/micro : ${erreur.message || 'Autorisations requises.'}`;
    return;
  }
  socket.emit('appel:initier', { ticketId: ticketActifId, type, peerId: peerIdLocal }, (rep) => {
    if (rep.succes) {
      appelIdActuel = rep.appelId;
      $('statut-appel').textContent = 'En attente de réponse...';
    } else {
      $('statut-appel').textContent = `Erreur : ${rep.message}`;
      $('panneau-appel').hidden = true;
    }
  });
}

$('bouton-raccrocher').addEventListener('click', () => {
  if (appelIdActuel) socket.emit('appel:terminer', { appelId: appelIdActuel });
  terminerAppelLocalement('Appel terminé');
});

function demarrerChronometreAppel() {
  debutAppelTimestamp = Date.now();
  $('chrono-appel').hidden = false;
  clearInterval(minuteurAppel);
  minuteurAppel = setInterval(() => {
    const secondes = Math.floor((Date.now() - debutAppelTimestamp) / 1000);
    $('chrono-appel').textContent = formaterDureeAppel(secondes);
  }, 500);
  $('chrono-appel').textContent = '00:00';
}

function arreterChronometreAppel() {
  clearInterval(minuteurAppel);
  minuteurAppel = null;
  debutAppelTimestamp = 0;
  $('chrono-appel').hidden = true;
}

function terminerAppelLocalement(message) {
  $('statut-appel').textContent = message;
  arreterChronometreAppel();
  SenegalConnectWebRTC.raccrocher();
  setTimeout(() => { $('panneau-appel').hidden = true; }, 1200);
  appelIdActuel = null;
}

$('bouton-micro').addEventListener('click', () => {
  const actif = SenegalConnectWebRTC.couperMicro();
  $('bouton-micro').textContent = actif ? 'Couper micro' : 'Rétablir micro';
  if (appelIdActuel) socket.emit('appel:controle', { appelId: appelIdActuel, micro: actif });
});

$('bouton-camera').addEventListener('click', () => {
  const actif = SenegalConnectWebRTC.couperCamera();
  $('bouton-camera').textContent = actif ? 'Couper caméra' : 'Rétablir caméra';
  if (appelIdActuel) socket.emit('appel:controle', { appelId: appelIdActuel, video: actif });
});

$('bouton-partage-ecran').addEventListener('click', async () => {
  try {
    if (SenegalConnectWebRTC.partageEcranEstActif()) {
      await SenegalConnectWebRTC.arreterPartageEcran();
      $('bouton-partage-ecran').textContent = "Partager l'écran";
    } else {
      await SenegalConnectWebRTC.demarrerPartageEcran();
      $('bouton-partage-ecran').textContent = "Arrêter le partage";
    }
    if (appelIdActuel) socket.emit('appel:controle', { appelId: appelIdActuel, partageEcran: SenegalConnectWebRTC.partageEcranEstActif() });
  } catch (erreur) {
    $('statut-appel').textContent = `Erreur partage d'écran : ${erreur.message}`;
  }
});

// ============================================================
// DÉMARRAGE
// ============================================================
initialiserSession();
initialiser();
