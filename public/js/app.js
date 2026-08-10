let token = localStorage.getItem('sc_token');
let currentUser = null;
let socket = null;
let appInitialized = false;
let currentTicketId = null;
let currentPage = { clients: 1, factures: 1 };
let typingTimeout = null;
let lastTypingSent = 0;

const EMOJIS = ['👍','👎','😊','😂','❤️','🔥','👀','💯','✅','🙏','👋','🎉','👏','💪','🤔','😢'];

const api = async (method, path, body) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api${path}`, opts);
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
};

function showAuthTab(tab, event) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
  if (event && event.target) event.target.classList.add('active');
}

window.addEventListener('DOMContentLoaded', () => {
  showAuthTab('login');
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  try {
    const data = await api('POST', '/auth/login', {
      email: document.getElementById('login-email').value,
      mot_de_passe: document.getElementById('login-password').value,
    });
    token = data.token;
    currentUser = data.utilisateur;
    localStorage.setItem('sc_token', token);
    initApp();
  } catch (err) {
    errEl.textContent = err.erreur || 'Erreur de connexion';
  }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('register-error');
  try {
    await api('POST', '/auth/register', {
      nom: document.getElementById('reg-nom').value,
      prenom: document.getElementById('reg-prenom').value,
      email: document.getElementById('reg-email').value,
      mot_de_passe: document.getElementById('reg-password').value,
      role: document.getElementById('reg-role').value,
    });
    errEl.style.color = '#28a745';
    errEl.textContent = 'Compte cree avec succes ! Connectez-vous.';
  } catch (err) {
    errEl.style.color = '#dc3545';
    errEl.textContent = err.erreur || err.details?.[0]?.message || 'Erreur';
  }
});

function logout() {
  token = null;
  currentUser = null;
  appInitialized = false;
  localStorage.removeItem('sc_token');
  if (socket) socket.disconnect();
  socket = null;
  document.getElementById('login-screen').classList.add('active');
  document.getElementById('main-screen').classList.remove('active');
}

async function initApp() {
  if (!token || appInitialized) return;
  appInitialized = true;
  try {
    currentUser = await api('GET', '/auth/profil');
  } catch {
    logout();
    return;
  }

  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('main-screen').classList.add('active');
  document.getElementById('nav-user-info').textContent = `${currentUser.prenom} ${currentUser.nom} (${currentUser.role})`;

  connectSocket();
  loadDashboard();
}

function connectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  socket = io({
    auth: { token },
    cookie: false,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    console.log('Socket connecte:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.warn('Socket deconnecte:', reason);
    if (reason === 'io server disconnect') {
      console.warn('Deconnecte par le serveur — reconnexion manuelle necessaire');
    }
  });

  socket.on('connect_error', (err) => {
    console.error('Socket erreur connexion:', err.message);
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log('Tentative de reconnexion:', attempt);
  });

  socket.on('reconnect_failed', () => {
    console.error('Echec de reconnexion apres toutes les tentatives');
  });

  socket.on('ticket:nouveau', (ticket) => {
    if (document.getElementById('section-tickets').classList.contains('active')) {
      loadTickets();
    }
  });

  socket.on('ticket:pris_en_charge', (data) => {
    alert(`Ticket #${data.ticket_id} pris en charge par ${data.agent_prenom} ${data.agent_nom}`);
  });

  socket.on('message:nouveau', (msg) => {
    if (currentTicketId && msg.ticket_id == currentTicketId) {
      appendMessage(msg);
      if (msg.expediteur_id !== currentUser.id) {
        socket.emit('message:lu', {
          message_id: msg.id,
          ticket_id: currentTicketId,
          expediteur_id: msg.expediteur_id,
        });
      }
    }
  });

  socket.on('message:statut', (data) => {
    const el = document.getElementById(`read-status-${data.message_id}`);
    if (el) el.textContent = '✓✓ lu';
  });

  socket.on('frappe', (data) => {
    const indicator = document.getElementById('typing-indicator');
    indicator.textContent = `${data.prenom} ${data.nom} est en train d'ecrire...`;
    indicator.style.display = 'block';
    setTimeout(() => { indicator.style.display = 'none'; }, 2500);
  });

  socket.on('appel:entrant', (data) => {
    if (typeof handleIncomingCall === 'function') handleIncomingCall(data);
  });

  socket.on('appel:accepte', (data) => {
    if (typeof handleCallAccepted === 'function') handleCallAccepted(data);
  });

  socket.on('appel:refuse', () => {
    if (typeof handleCallRefused === 'function') handleCallRefused();
  });

  socket.on('appel:termine', (data) => {
    if (typeof handleCallEnded === 'function') handleCallEnded(data);
  });

  socket.on('appel:controle', (data) => {
    if (typeof handleCallControl === 'function') handleCallControl(data);
  });

  socket.on('notification:push', (data) => {
    alert(data.message);
  });

  socket.on('erreur', (data) => {
    console.error('Socket erreur:', data.message);
    const callModal = document.getElementById('video-call-modal');
    if (callModal.style.display === 'flex') {
      document.getElementById('call-status').textContent = 'Erreur: ' + data.message;
      setTimeout(() => {
        endCallCleanup();
        callModal.style.display = 'none';
      }, 3000);
    }
  });
}

function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(`section-${name}`).classList.add('active');
  document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
  document.querySelector(`.menu-item[data-section="${name}"]`).classList.add('active');

  const pageContent = document.querySelector('main.content');
  if (pageContent) pageContent.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (name === 'dashboard') loadDashboard();
  else if (name === 'clients') loadClients();
  else if (name === 'forfaits') loadForfaits();
  else if (name === 'factures') loadFactures();
  else if (name === 'tickets') loadTickets();
}

async function loadDashboard() {
  try {
    const stats = await api('GET', '/stats');
    document.getElementById('stat-clients').textContent = stats.clients_actifs;
    document.getElementById('stat-mrr').textContent = Number(stats.mrr_fcfa).toLocaleString();
    document.getElementById('stat-impayees').textContent = stats.factures_impayees;
    document.getElementById('stat-tickets').textContent = stats.tickets_ouverts;
  } catch {
    document.getElementById('stat-clients').textContent = 'N/A';
    document.getElementById('stat-mrr').textContent = 'N/A';
    document.getElementById('stat-impayees').textContent = 'N/A';
    document.getElementById('stat-tickets').textContent = 'N/A';
  }
}

async function loadClients() {
  try {
    const q = document.getElementById('client-search')?.value || '';
    const statut = document.getElementById('client-filter-statut')?.value || '';
    const page = currentPage.clients;
    let url = `/clients?page=${page}&limite=10`;
    if (q) url += `&q=${encodeURIComponent(q)}`;
    if (statut) url += `&statut=${statut}`;

    const data = await api('GET', url);
    const tbody = document.getElementById('clients-table-body');
    tbody.innerHTML = data.data.map(c => `
      <tr>
        <td>${c.id}</td>
        <td>${c.nom || ''}</td>
        <td>${c.prenom || ''}</td>
        <td>${c.msisdn}</td>
        <td>${c.email || ''}</td>
        <td>${c.forfait_nom || '-'}</td>
        <td><span class="status-badge status-${c.statut}">${c.statut}</span></td>
        <td>
          <button class="table-btn" onclick="deleteClient(${c.id})">Suppr</button>
        </td>
      </tr>
    `).join('');

    const p = data.pagination;
    document.getElementById('clients-pagination').innerHTML = `
      <button class="btn btn-sm" ${p.page <= 1 ? 'disabled' : ''} onclick="currentPage.clients--;loadClients()">Prev</button>
      <span>Page ${p.page}/${p.total_pages}</span>
      <button class="btn btn-sm" ${p.page >= p.total_pages ? 'disabled' : ''} onclick="currentPage.clients++;loadClients()">Next</button>
    `;
  } catch (err) {
    console.error('Erreur loadClients:', err);
  }
}

async function deleteClient(id) {
  showConfirm('Supprimer ce client ?', async () => {
    try {
      await api('DELETE', `/clients/${id}`);
      loadClients();
    } catch (err) {
      alert(err.erreur || 'Erreur');
    }
  });
}

async function loadForfaits() {
  try {
    const data = await api('GET', '/forfaits');
    document.getElementById('forfaits-grid').innerHTML = data.map(f => `
      <div class="forfait-card">
        <h3>${f.nom}</h3>
        <div class="price">${Number(f.prix_mensuel_fcfa).toLocaleString()} <span>FCFA/mois</span></div>
        <div class="details">
          <div>Data: ${f.quota_data_go} Go</div>
          <div>Voix: ${f.quota_voix_min} min</div>
          <div>Abonnes: ${f.nb_clients}</div>
        </div>
        <button class="btn btn-sm btn-danger" style="margin-top:10px" onclick="deleteForfait(${f.id})">Supprimer</button>
      </div>
    `).join('');
  } catch (err) {
    console.error('Erreur loadForfaits:', err);
  }
}

async function deleteForfait(id) {
  showConfirm('Supprimer ce forfait ?', async () => {
    try {
      await api('DELETE', `/forfaits/${id}`);
      loadForfaits();
    } catch (err) {
      alert(err.erreur || 'Erreur');
    }
  });
}

async function loadFactures() {
  try {
    const statut = document.getElementById('facture-filter-statut')?.value || '';
    const periode = document.getElementById('facture-filter-periode')?.value || '';
    const page = currentPage.factures;
    let url = `/factures?page=${page}&limite=10`;
    if (statut) url += `&statut=${statut}`;
    if (periode) url += `&periode=${encodeURIComponent(periode)}`;

    const data = await api('GET', url);
    const tbody = document.getElementById('factures-table-body');
    tbody.innerHTML = data.data.map(f => `
      <tr>
        <td>${f.reference}</td>
        <td>${f.prenom} ${f.nom}</td>
        <td>${f.periode}</td>
        <td>${Number(f.montant_fcfa).toLocaleString()}</td>
        <td><span class="status-badge status-${f.statut}">${f.statut}</span></td>
        <td>${new Date(f.date_echeance).toLocaleDateString('fr-FR')}</td>
        <td>
          <select onchange="updateFactureStatut(${f.id}, this.value)" style="font-size:.8em">
            <option value="">--</option>
            <option value="payee">Payee</option>
            <option value="impayee">Impayee</option>
            <option value="en_retard">En retard</option>
          </select>
        </td>
      </tr>
    `).join('');

    const p = data.pagination;
    document.getElementById('factures-pagination').innerHTML = `
      <button class="btn btn-sm" ${p.page <= 1 ? 'disabled' : ''} onclick="currentPage.factures--;loadFactures()">Prev</button>
      <span>Page ${p.page}/${p.total_pages}</span>
      <button class="btn btn-sm" ${p.page >= p.total_pages ? 'disabled' : ''} onclick="currentPage.factures++;loadFactures()">Next</button>
    `;
  } catch (err) {
    console.error('Erreur loadFactures:', err);
  }
}

async function updateFactureStatut(id, statut) {
  if (!statut) return;
  try {
    await api('PUT', `/factures/${id}/statut`, { statut });
    loadFactures();
  } catch (err) {
    alert(err.erreur || 'Erreur');
  }
}

async function loadTickets() {
  try {
    const data = await api('GET', '/tickets');
    document.getElementById('tickets-list').innerHTML = data.data.map(t => `
      <div class="ticket-item" onclick="openTicket(${t.id}, this)">
        <h4>#${t.id} — ${t.sujet}</h4>
        <p>${t.client_nom ? t.client_prenom + ' ' + t.client_nom : ''} ${t.agent_nom ? '| Agent: ' + t.agent_prenom + ' ' + t.agent_nom : ''}</p>
        <p><span class="status-badge status-${t.statut}">${t.statut}</span></p>
      </div>
    `).join('');
  } catch (err) {
    console.error('Erreur loadTickets:', err);
  }
}

async function openTicket(id, el) {
  currentTicketId = id;
  const chatPanel = document.getElementById('chat-panel');
  const placeholder = document.getElementById('ticket-placeholder');
  placeholder.style.display = 'none';
  chatPanel.style.display = 'flex';
  document.getElementById('chat-ticket-info').textContent = `Ticket #${id}`;

  document.querySelectorAll('.ticket-item').forEach(item => item.classList.remove('active'));
  if (el) el.classList.add('active');

  try {
    const messages = await api('GET', `/tickets/${id}/messages`);
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    messages.forEach(m => appendMessage(m));
    container.scrollTop = container.scrollHeight;

    socket.emit('ticket:rejoindre', { ticket_id: id });
  } catch (err) {
    console.error('Erreur openTicket:', err);
  }
}

function closeChat() {
  currentTicketId = null;
  document.getElementById('chat-panel').style.display = 'none';
  document.getElementById('ticket-placeholder').style.display = 'flex';
}

function appendMessage(msg) {
  const container = document.getElementById('chat-messages');
  const isSent = msg.expediteur_id === currentUser.id;
  const div = document.createElement('div');
  div.className = `message ${isSent ? 'sent' : 'received'}`;

  let content = '';
  if (msg.type === 'image') {
    content = `<div class="file-preview"><img src="${msg.fichier_url}" alt="${msg.fichier_nom}"></div>`;
  } else if (msg.type === 'audio') {
    content = `<div class="file-preview"><audio controls src="${msg.fichier_url}"></audio></div>`;
  } else if (msg.type === 'fichier') {
    content = `<div class="file-link" onclick="window.open('${msg.fichier_url}')">${msg.fichier_nom || 'Fichier'}</div>`;
  } else {
    content = msg.contenu || '';
  }

  const readStatus = isSent
    ? `<div class="read-status" id="read-status-${msg.id}">${msg.statut === 'lu' ? '✓✓ lu' : '✓'}</div>`
    : '';

  const senderName = isSent ? 'Vous' : ([msg.expediteur_prenom, msg.expediteur_nom].filter(Boolean).join(' ') || msg.expediteur_nom || msg.expediteur_prenom || 'Utilisateur');
  div.innerHTML = `
    <div class="sender">${senderName}</div>
    <div>${content}</div>
    <div style="font-size:.65em;opacity:.6;text-align:right">${new Date(msg.envoye_le).toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}</div>
    ${readStatus}
    <div class="reactions" id="reactions-${msg.id}"></div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function sendMessage() {
  const input = document.getElementById('message-input');
  const contenu = input.value.trim();
  if (!contenu || !currentTicketId) return;

  socket.emit('message:envoyer', {
    ticket_id: currentTicketId,
    contenu,
    type: 'texte',
  });
  input.value = '';
}

function handleMessageKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function handleTyping() {
  const now = Date.now();
  if (now - lastTypingSent > 1000) {
    socket.emit('frappe', { ticket_id: currentTicketId });
    lastTypingSent = now;
  }
}

function triggerFileUpload() {
  document.getElementById('file-input').click();
}

async function uploadFile(input) {
  if (!input.files[0] || !currentTicketId) return;
  const formData = new FormData();
  formData.append('fichier', input.files[0]);

  try {
    const res = await fetch(`/api/tickets/${currentTicketId}/fichier`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    const msg = await res.json();
    if (res.ok) {
      socket.emit('fichier:partager', {
        ticket_id: currentTicketId,
        fichierUrl: msg.fichier_url,
        fichierNom: msg.fichier_nom,
        fichierTaille: msg.fichier_taille,
        mimeType: msg.type === 'image' ? 'image/jpeg' : msg.type === 'audio' ? 'audio/mpeg' : 'application/pdf',
      });
    }
  } catch (err) {
    alert('Erreur upload fichier');
  }
  input.value = '';
}

function toggleEmojiPicker() {
  const picker = document.getElementById('emoji-picker');
  if (picker.style.display === 'none') {
    picker.innerHTML = EMOJIS.map(e => `<span onclick="insertEmoji('${e}')">${e}</span>`).join('');
    picker.style.display = 'flex';
  } else {
    picker.style.display = 'none';
  }
}

function insertEmoji(emoji) {
  const input = document.getElementById('message-input');
  input.value += emoji;
  input.focus();
  document.getElementById('emoji-picker').style.display = 'none';
}

function showModal(type) {
  const modal = document.getElementById('generic-modal');
  const content = document.getElementById('generic-modal-content');

  if (type === 'add-client') {
    content.innerHTML = `
      <h3>Nouveau Client</h3>
      <form onsubmit="submitNewClient(event)">
        <div class="form-group"><label>Nom</label><input type="text" id="mc-nom" required></div>
        <div class="form-group"><label>Prenom</label><input type="text" id="mc-prenom" required></div>
        <div class="form-group"><label>Email</label><input type="email" id="mc-email" required></div>
        <div class="form-group"><label>Mot de passe</label><input type="password" id="mc-mdp" required minlength="8"></div>
        <div class="form-group"><label>MSISDN (+221...)</label><input type="text" id="mc-msisdn" required placeholder="+221771234567"></div>
        <div class="form-group"><label>Forfait ID</label><input type="number" id="mc-forfait"></div>
        <button type="submit" class="btn btn-primary">Creer</button>
        <button type="button" class="btn" onclick="closeModal()">Annuler</button>
      </form>`;
  } else if (type === 'add-forfait') {
    content.innerHTML = `
      <h3>Nouveau Forfait</h3>
      <form onsubmit="submitNewForfait(event)">
        <div class="form-group"><label>Nom</label><input type="text" id="mf-nom" required></div>
        <div class="form-group"><label>Quota Data (Go)</label><input type="number" id="mf-data" min="0" step="0.1"></div>
        <div class="form-group"><label>Quota Voix (min)</label><input type="number" id="mf-voix" min="0"></div>
        <div class="form-group"><label>Prix mensuel (FCFA)</label><input type="number" id="mf-prix" min="1" required></div>
        <button type="submit" class="btn btn-primary">Creer</button>
        <button type="button" class="btn" onclick="closeModal()">Annuler</button>
      </form>`;
  } else if (type === 'add-facture') {
    content.innerHTML = `
      <h3>Nouvelle Facture</h3>
      <form onsubmit="submitNewFacture(event)">
        <div class="form-group"><label>Client ID</label><input type="number" id="mfa-client" required></div>
        <div class="form-group"><label>Periode (YYYY-MM)</label><input type="text" id="mfa-periode" required placeholder="2025-03"></div>
        <div class="form-group"><label>Montant (FCFA)</label><input type="number" id="mfa-montant" min="0" required></div>
        <div class="form-group"><label>Date echeance</label><input type="date" id="mfa-echeance" required></div>
        <button type="submit" class="btn btn-primary">Creer</button>
        <button type="button" class="btn" onclick="closeModal()">Annuler</button>
      </form>`;
  } else if (type === 'add-ticket') {
    content.innerHTML = `
      <h3>Nouveau Ticket</h3>
      <form onsubmit="submitNewTicket(event)">
        <div class="form-group"><label>Client ID</label><input type="number" id="mt-client" required></div>
        <div class="form-group"><label>Sujet</label><input type="text" id="mt-sujet" required></div>
        <button type="submit" class="btn btn-primary">Creer</button>
        <button type="button" class="btn" onclick="closeModal()">Annuler</button>
      </form>`;
  }

  modal.style.display = 'flex';
}

function closeModal() {
  document.getElementById('generic-modal').style.display = 'none';
}

function showAlert(message, title = 'Notification') {
  const modal = document.getElementById('generic-modal');
  const content = document.getElementById('generic-modal-content');
  content.innerHTML = `
    <h3>${title}</h3>
    <p>${message}</p>
    <div class="confirm-actions" style="display:flex;gap:12px;margin-top:16px">
      <button class="btn btn-primary" id="alert-ok">OK</button>
    </div>
  `;

  const ok = document.getElementById('alert-ok');
  ok.addEventListener('click', () => closeModal(), { once: true });
  modal.style.display = 'flex';
}

/* Confirmation modal helper */
function showConfirm(message, onConfirm) {
  const modal = document.getElementById('generic-modal');
  const content = document.getElementById('generic-modal-content');
  content.innerHTML = `
    <h3>Confirmation</h3>
    <p>${message}</p>
    <div class="confirm-actions" style="display:flex;gap:12px;margin-top:16px">
      <button class="btn btn-primary" id="confirm-yes">Confirmer</button>
      <button class="btn" id="confirm-no">Annuler</button>
    </div>
  `;

  const yes = document.getElementById('confirm-yes');
  const no = document.getElementById('confirm-no');

  const cleanup = () => { try { yes.removeEventListener('click', yes._cb); } catch(e){} try { no.removeEventListener('click', no._cb); } catch(e){} };

  yes._cb = async () => {
    try {
      await Promise.resolve(onConfirm());
    } finally {
      cleanup();
      closeModal();
    }
  };
  no._cb = () => { cleanup(); closeModal(); };

  yes.addEventListener('click', yes._cb);
  no.addEventListener('click', no._cb);

  modal.style.display = 'flex';
}

function toggleChatFullScreen() {
  const panel = document.getElementById('chat-panel');
  const btn = document.getElementById('btn-fullscreen-chat');
  if (!panel) return;
  const isFull = panel.classList.toggle('chat-fullscreen');
  if (isFull) {
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.classList.add('chat-enter');
    document.body.classList.add('chat-fullscreen-open');
    document.body.style.overflow = 'hidden';
    if (btn) { btn.textContent = '✕'; btn.setAttribute('aria-label', 'Fermer le chat (Esc)'); }
    // listen for Esc to close
    document.addEventListener('keydown', _escCloseChat);
  } else {
    panel.removeAttribute('role');
    panel.removeAttribute('aria-modal');
    document.body.classList.remove('chat-fullscreen-open');
    document.body.style.overflow = '';
    if (btn) { btn.textContent = '⤢'; btn.setAttribute('aria-label', 'Agrandir le chat'); }
    document.removeEventListener('keydown', _escCloseChat);
  }
  // small animation class swap
  setTimeout(() => panel.classList.remove('chat-enter'), 220);
  // ensure messages container resizes and stays scrolled to bottom
  setTimeout(() => {
    const container = document.getElementById('chat-messages');
    if (container) container.scrollTop = container.scrollHeight;
  }, 120);
}

function _escCloseChat(e) {
  if (e.key === 'Escape') {
    const panel = document.getElementById('chat-panel');
    if (panel && panel.classList.contains('chat-fullscreen')) toggleChatFullScreen();
  }
}

async function submitNewClient(e) {
  e.preventDefault();
  try {
    await api('POST', '/clients', {
      nom: document.getElementById('mc-nom').value,
      prenom: document.getElementById('mc-prenom').value,
      email: document.getElementById('mc-email').value,
      mot_de_passe: document.getElementById('mc-mdp').value,
      msisdn: document.getElementById('mc-msisdn').value,
      forfait_id: parseInt(document.getElementById('mc-forfait').value) || null,
    });
    closeModal();
    loadClients();
  } catch (err) {
    alert(err.erreur || err.details?.[0]?.message || 'Erreur');
  }
}

async function submitNewForfait(e) {
  e.preventDefault();
  try {
    await api('POST', '/forfaits', {
      nom: document.getElementById('mf-nom').value,
      quota_data_go: parseFloat(document.getElementById('mf-data').value) || 0,
      quota_voix_min: parseInt(document.getElementById('mf-voix').value) || 0,
      prix_mensuel_fcfa: parseFloat(document.getElementById('mf-prix').value),
    });
    closeModal();
    loadForfaits();
  } catch (err) {
    alert(err.erreur || err.details?.[0]?.message || 'Erreur');
  }
}

async function submitNewFacture(e) {
  e.preventDefault();
  try {
    await api('POST', '/factures', {
      client_id: parseInt(document.getElementById('mfa-client').value),
      periode: document.getElementById('mfa-periode').value,
      montant_fcfa: parseFloat(document.getElementById('mfa-montant').value),
      date_echeance: document.getElementById('mfa-echeance').value,
    });
    closeModal();
    loadFactures();
  } catch (err) {
    alert(err.erreur || err.details?.[0]?.message || 'Erreur');
  }
}

async function submitNewTicket(e) {
  e.preventDefault();
  try {
    await api('POST', '/tickets', {
      client_id: parseInt(document.getElementById('mt-client').value),
      sujet: document.getElementById('mt-sujet').value,
    });
    closeModal();
    loadTickets();
  } catch (err) {
    alert(err.erreur || err.details?.[0]?.message || 'Erreur');
  }
}

if (token) initApp();
