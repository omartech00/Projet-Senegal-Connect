// public/js/webrtc.js
// Rôle : client PeerJS + gestion des flux audio/vidéo locaux/distants.
// Boîte à outils autonome consommée par app.js — ne connaît rien de
// Socket.IO ni de l'authentification, uniquement WebRTC/PeerJS.

(function () {
  if (typeof Peer === 'undefined') {
    console.error('[webrtc] La librairie PeerJS ne s\'est pas chargée (vérifie le <script> CDN dans index.html et ta connexion internet).');
  }

  let peer = null;
  let connexionMedia = null; // MediaConnection PeerJS active
  let streamLocal = null;

  const etat = { microActif: true, cameraActive: true };

  /**
   * Initialise l'objet Peer côté client avec un identifiant précis
   * (doit correspondre exactement au peerId envoyé via Socket.IO,
   * Phase 25 — piège rappelé en section 5 de cette phase).
   */

  
    function initialiserPeer(peerId) {
    return new Promise((resolve, reject) => {
      const PeerConstructor = window.Peer || (window.peerjs ? window.peerjs.Peer : null);

      if (!PeerConstructor) {
        console.error("[webrtc] Le constructeur PeerJS est introuvable.");
        return reject(new Error("Constructeur PeerJS introuvable"));
      }

      // CORRECTION : On assigne à la variable locale 'peer' et on passe l'ID requis
      peer = new PeerConstructor(peerId, {
        host: 'localhost',
        port: 3001,
        path: '/peerjs'
      });

      // Reste du code inchangé et maintenant fonctionnel
      peer.on('open', (id) => resolve(id));
      peer.on('error', (erreur) => reject(erreur));
    });
  }


  /**
   * Démarre getUserMedia et affiche le flux dans la vidéo locale
   * (TOUJOURS muted — exigence PDF pour éviter le retour audio).
   */
  async function demarrerFluxLocal({ audio, video }) {
    streamLocal = await navigator.mediaDevices.getUserMedia({ audio, video });
    const videoLocale = document.getElementById('video-locale');
    if (videoLocale) {
      videoLocale.srcObject = streamLocal;
      videoLocale.muted = true;
    }
    return streamLocal;
  }

  function afficherFluxDistant(stream) {
    const videoDistante = document.getElementById('video-distante');
    if (videoDistante) {
      videoDistante.srcObject = stream;
      videoDistante.muted = false; // jamais muted côté distant
    }
  }

  /**
   * Côté INITIATEUR (étape 5 de la signalisation, Phase 25) : appelle
   * le peerId distant avec le flux local déjà ouvert.
   */
  function appeler(peerIdDistant) {
    connexionMedia = peer.call(peerIdDistant, streamLocal);
    connexionMedia.on('stream', afficherFluxDistant);
    return connexionMedia;
  }

  /**
   * Côté DESTINATAIRE : enregistré UNE SEULE FOIS (piège section 5),
   * répond automatiquement à tout appel PeerJS entrant avec le flux
   * local déjà ouvert via demarrerFluxLocal (appelé avant, dans
   * app.js, au moment de "appel:entrant").
   */
  function ecouterAppelsEntrants() {
    peer.on('call', (appelEntrant) => {
      appelEntrant.answer(streamLocal);
      appelEntrant.on('stream', afficherFluxDistant);
      connexionMedia = appelEntrant;
    });
  }

  /** Coupe/rétablit le micro via track.enabled — jamais stop(). */
  function couperMicro() {
    if (!streamLocal) return etat.microActif;
    etat.microActif = !etat.microActif;
    streamLocal.getAudioTracks().forEach((piste) => { piste.enabled = etat.microActif; });
    return etat.microActif;
  }

  /** Coupe/rétablit la caméra via track.enabled — jamais stop(). */
  function couperCamera() {
    if (!streamLocal) return etat.cameraActive;
    etat.cameraActive = !etat.cameraActive;
    streamLocal.getVideoTracks().forEach((piste) => { piste.enabled = etat.cameraActive; });
    return etat.cameraActive;
  }

  /** Termine réellement l'appel — ICI on stop() les pistes (fin définitive). */
  function raccrocher() {
    if (connexionMedia) connexionMedia.close();
    if (streamLocal) streamLocal.getTracks().forEach((piste) => piste.stop());
    connexionMedia = null;
    streamLocal = null;
    etat.microActif = true;
    etat.cameraActive = true;
  }

  window.SenegalConnectWebRTC = {
    initialiserPeer,
    demarrerFluxLocal,
    ecouterAppelsEntrants,
    appeler,
    couperMicro,
    couperCamera,
    raccrocher,
  };
})();
