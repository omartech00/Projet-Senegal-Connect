let peer = null;
let localStream = null;
let remoteStream = null;
let currentCall = null;
let screenStream = null;
let callTimer = null;
let callStartTime = null;
let incomingCallData = null;
let localPeerId = null;
let callAppelId = null;

const PEER_SERVER_HOST = window.location.hostname;
const PEER_SERVER_PORT = 9000;
const PEER_PATH = '/';

function getPeerConfig() {
  return {
    host: PEER_SERVER_HOST,
    port: PEER_SERVER_PORT,
    path: PEER_PATH,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
    },
  };
}

function initPeer() {
  return new Promise((resolve, reject) => {
    if (peer) peer.destroy();
    localPeerId = null;
    peer = new Peer(undefined, getPeerConfig());

    peer.on('open', (id) => {
      localPeerId = id;
      console.log('Peer ID:', id);
      resolve(id);
    });

    peer.on('call', (call) => {
      handleIncomingPeerCall(call);
    });

    peer.on('error', (err) => {
      console.error('PeerJS erreur:', err);
    });

    peer.on('disconnected', () => {
      console.warn('PeerJS deconnecte du serveur de signalisation');
    });

    peer.on('close', () => {
      console.warn('PeerJS connection fermee');
    });

    setTimeout(() => {
      if (!localPeerId) {
        reject(new Error('Impossible de se connecter au serveur PeerJS'));    
        endCallCleanup();
      }
    }, 10000);
  });
}

function showVideoModal(type) {
  document.getElementById('video-call-modal').style.display = 'flex';
  document.getElementById('call-status').textContent = 'Appel en cours...';
  document.getElementById('call-timer').textContent = '00:00';
  document.getElementById('remote-video').style.display = type === 'video' ? 'block' : 'none';
  document.getElementById('remote-audio').style.display = type === 'audio' ? 'block' : 'none';
  document.getElementById('btn-screen').style.display = type === 'video' ? 'block' : 'none';
}

function attachRemoteStream(remote) {
  const remoteVideo = document.getElementById('remote-video');
  const remoteAudio = document.getElementById('remote-audio');
  remoteStream = remote;

  if (remote.getVideoTracks().length > 0) {
    remoteVideo.srcObject = remote;
    remoteVideo.style.display = 'block';
    remoteAudio.style.display = 'none';
  } else {
    remoteAudio.srcObject = remote;
    remoteAudio.style.display = 'block';
    remoteVideo.style.display = 'none';
  }
}

async function initAppel(type) {
  if (!currentTicketId) return alert('Ouvrez un ticket d\'abord');

  try {
    if (!peer || !localPeerId) {
      await initPeer();
    }

    if (type === 'video') {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } else {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }

    document.getElementById('local-video').srcObject = localStream;
    document.getElementById('local-video').muted = true;

    if (type === 'audio') {
      document.getElementById('local-video').style.display = 'none';
    } else {
      document.getElementById('local-video').style.display = 'block';
    }

    showVideoModal(type);

    socket.emit('appel:initier', {
      ticket_id: currentTicketId,
      type,
      peerId: localPeerId,
    });
  } catch (err) {
    alert('Impossible d\'acceder au micro/camera: ' + err.message);
  }
  if (!currentTicketId) return alert('Ouvrez un ticket d\'abord');

  try {
    if (type === 'video') {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } else {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }

    document.getElementById('local-video').srcObject = localStream;
    document.getElementById('local-video').muted = true;

    if (type === 'audio') {
      document.getElementById('local-video').style.display = 'none';
    } else {
      document.getElementById('local-video').style.display = 'block';
    }

    showVideoModal(type);

    initPeer(() => {
      socket.emit('appel:initier', {
        ticket_id: currentTicketId,
        type,
        peerId: localPeerId,
      });
    });
  } catch (err) {
    alert('Impossible d\'acceder au micro/camera: ' + err.message);
  }
}

function showVideoModal(type) {
  document.getElementById('video-call-modal').style.display = 'flex';
  document.getElementById('call-status').textContent = 'Appel en cours...';
  document.getElementById('call-timer').textContent = '00:00';
  document.getElementById('remote-video').style.display = type === 'video' ? 'block' : 'none';
  document.getElementById('btn-screen').style.display = type === 'video' ? 'block' : 'none';
}

function handleIncomingCall(data) {
  incomingCallData = data;
  const initiateur = data?.initiateur || {};
  const prenom = initiateur.prenom || data?.prenom || '';
  const nom = initiateur.nom || data?.nom || '';
  const callerName = [prenom, nom].filter(Boolean).join(' ') || 'Un utilisateur';
  const callTypeLabel = data?.type === 'audio' ? 'audio' : 'vidéo';

  document.getElementById('incoming-call-info').textContent =
    `${callerName} — Appel ${callTypeLabel}`;
  document.getElementById('incoming-call-modal').style.display = 'flex';
}

async function accepterAppel() {
  document.getElementById('incoming-call-modal').style.display = 'none';

  if (!incomingCallData) return;

  try {
    if (!peer || !localPeerId) {
      await initPeer();
    }

    const type = incomingCallData.type;
    if (type === 'video') {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } else {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }

    document.getElementById('local-video').srcObject = localStream;
    document.getElementById('local-video').muted = true;
    showVideoModal(type);

    socket.emit('appel:accepter', {
      appelId: incomingCallData.appelId,
      peerId: localPeerId,
    });
  } catch (err) {
    alert('Impossible d\'acceder au micro/camera: ' + err.message);
  }
}

function refuserAppel() {
  document.getElementById('incoming-call-modal').style.display = 'none';
  if (incomingCallData) {
    socket.emit('appel:refuser', { appelId: incomingCallData.appelId });
  }
  incomingCallData = null;
}

function handleCallAccepted(data) {
  if (!peer || !localStream) return;

  if (data.appelId) {
    callAppelId = data.appelId;
    incomingCallData = { appelId: data.appelId };
  }

  const call = peer.call(data.peerId_dest, localStream);
  if (!call) return;

  currentCall = call;

  call.on('stream', (remote) => {
    attachRemoteStream(remote);
    startCallTimer();
  });

  call.on('close', () => {
    endCallCleanup();
  });
}

function handleIncomingPeerCall(call) {
  if (!peer || !localPeerId) return;
  if (!localStream) {
    console.warn('Aucun flux local pour repondre a l\'appel');
    return;
  }

  call.answer(localStream);
  currentCall = call;

  call.on('stream', (remote) => {
    attachRemoteStream(remote);
    startCallTimer();
  });

  call.on('close', () => {
    endCallCleanup();
  });
}

function startCallTimer() {
  callStartTime = Date.now();
  callTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    document.getElementById('call-timer').textContent = `${mins}:${secs}`;
  }, 1000);
}

function terminerAppel() {
  const appelId = callAppelId || incomingCallData?.appelId;
  if (appelId) {
    socket.emit('appel:terminer', { appelId });
  }
  endCallCleanup();
}

function handleCallEnded() {
  endCallCleanup();
}

function handleCallRefused() {
  if (typeof showAlert === 'function') {
    showAlert('Votre appel a été refusé.', 'Appel refusé');
  } else {
    alert('Appel refuse');
  }
  endCallCleanup();
}

function endCallCleanup() {
  if (!peer && !localStream && !currentCall) return;

  if (callTimer) { clearInterval(callTimer); callTimer = null; }
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }
  if (peer) {
    peer.destroy();
    peer = null;
  }
  remoteStream = null;
  incomingCallData = null;
  callAppelId = null;
  localPeerId = null;

  document.getElementById('local-video').srcObject = null;
  document.getElementById('remote-video').srcObject = null;
  document.getElementById('video-call-modal').style.display = 'none';
  document.getElementById('call-timer').textContent = '00:00';
  document.getElementById('call-status').textContent = '';
}

function toggleMicro() {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    document.getElementById('btn-mute').textContent = audioTrack.enabled ? 'Micro' : 'Micro OFF';
    const appelId = callAppelId || incomingCallData?.appelId;
    if (appelId) {
      socket.emit('appel:controle', {
        appelId,
        micro: audioTrack.enabled,
        video: document.getElementById('btn-camera').textContent !== 'Camera OFF',
        partageEcran: !!screenStream,
      });
    }
  }
}

function toggleCamera() {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    document.getElementById('btn-camera').textContent = videoTrack.enabled ? 'Camera' : 'Camera OFF';
    const appelId = callAppelId || incomingCallData?.appelId;
    if (appelId) {
      socket.emit('appel:controle', {
        appelId,
        micro: document.getElementById('btn-mute').textContent !== 'Micro OFF',
        video: videoTrack.enabled,
        partageEcran: !!screenStream,
      });
    }
  }
}

async function toggleScreenShare() {
  if (screenStream) {
    const videoTrack = localStream?.getVideoTracks()[0];
    if (videoTrack && currentCall && currentCall.peerConnection) {
      const sender = currentCall.peerConnection.getSenders().find(s => s.track?.kind === 'video');
      if (sender) sender.replaceTrack(videoTrack);
    }
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
    document.getElementById('btn-screen').textContent = 'Ecran';
    document.getElementById('local-video').srcObject = localStream;

    const appelId = callAppelId || incomingCallData?.appelId;
    if (appelId) {
      socket.emit('appel:controle', {
        appelId,
        micro: document.getElementById('btn-mute').textContent !== 'Micro OFF',
        video: document.getElementById('btn-camera').textContent !== 'Camera OFF',
        partageEcran: false,
      });
    }
    return;
  }

  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
    const screenTrack = screenStream.getVideoTracks()[0];

    if (currentCall && currentCall.peerConnection) {
      const sender = currentCall.peerConnection.getSenders().find(s => s.track?.kind === 'video');
      if (sender) sender.replaceTrack(screenTrack);
    }

    document.getElementById('local-video').srcObject = screenStream;
    document.getElementById('btn-screen').textContent = 'Arreter';

    screenTrack.onended = () => {
      const videoTrack = localStream?.getVideoTracks()[0];
      if (videoTrack && currentCall && currentCall.peerConnection) {
        const sender = currentCall.peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
      }
      screenStream = null;
      document.getElementById('btn-screen').textContent = 'Ecran';
      document.getElementById('local-video').srcObject = localStream;
    };

    const appelId = callAppelId || incomingCallData?.appelId;
    if (appelId) {
      socket.emit('appel:controle', {
        appelId,
        micro: document.getElementById('btn-mute').textContent !== 'Micro OFF',
        video: true,
        partageEcran: true,
      });
    }
  } catch (err) {
    console.error('Erreur partage ecran:', err);
  }
}

function handleCallControl(data) {
  const status = `${data.nom}: ${!data.micro ? '🔇 Micro OFF' : ''} ${!data.video ? '📷 Camera OFF' : ''} ${data.partageEcran ? '🖥️ Partage ecran' : ''}`.trim();
  document.getElementById('call-status').textContent = status || `${data.nom}: connecte`;
}
