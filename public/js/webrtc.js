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
  let pisteCameraOriginale = null; // conservée pour restauration après partage d'écran
  let streamEcran = null;

  const etat = { microActif: true, cameraActive: true, partageEcranActif: false };


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
   * Côté DESTINATAIRE : Écoute l'appel WebRTC entrant, conserve sa référence,
   * mais NE RÉPOND PAS tant que le flux de la caméra locale n'est pas prêt.
   */
  function ecouterAppelsEntrants() {
    if (!peer) return;
    
    // Nettoie l'ancien écouteur s'il existe pour éviter le déclenchement en double
    peer.off('call');
    
    peer.on('call', (appelEntrant) => {
      console.log("[webrtc] Signal WebRTC reçu, mise en attente de la validation de l'utilisateur...");
      connexionMedia = appelEntrant;
    });
  }

  /**
   * NOUVELLE FONCTION : Applique la réponse WebRTC avec le flux local enfin prêt.
   * Appelée par app.js après le confirm() et le demarrerFluxLocal().
   */
  function repondreAppelActuel() {
    if (!connexionMedia) {
      console.error("[webrtc] Impossible de répondre : aucune instance d'appel en attente.");
      return;
    }
    if (!streamLocal) {
      console.error("[webrtc] Impossible de répondre : le flux de la caméra n'est pas prêt.");
      return;
    }
    console.log("[webrtc] Envoi du flux local au participant distant.");
    connexionMedia.answer(streamLocal); // Réponse propre avec le flux valide
    connexionMedia.on('stream', afficherFluxDistant);
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

  /**
   * Démarre le partage d'écran et REMPLACE la piste vidéo de la
   * connexion WebRTC déjà établie via replaceTrack() — la connexion
   * n'est jamais fermée ni renégociée, l'autre participant ne voit
   * aucune coupure. frameRate:15 (exigence PDF, contenu peu mobile).
   */
  async function demarrerPartageEcran() {
    if (!connexionMedia || !connexionMedia.peerConnection) {
      throw new Error("Aucune connexion d'appel active pour partager l'écran");
    }

    streamEcran = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 15 },
      audio: false, // jamais l'audio système, exigence PDF
    });
    const pisteEcran = streamEcran.getVideoTracks()[0];

    // Conserve la piste caméra actuelle pour pouvoir la restaurer
    // précisément à l'arrêt du partage (section 4 de cette phase).
    pisteCameraOriginale = streamLocal.getVideoTracks()[0];

    const expediteurVideo = connexionMedia.peerConnection
      .getSenders()
      .find((expediteur) => expediteur.track && expediteur.track.kind === 'video');

    if (!expediteurVideo) {
      throw new Error('Aucun expéditeur vidéo trouvé sur la connexion active');
    }

    await expediteurVideo.replaceTrack(pisteEcran);

    // La miniature locale doit aussi refléter ce qui est réellement
    // partagé, pas la caméra (section 4 de cette phase).
    const videoLocale = document.getElementById('video-locale');
    if (videoLocale) videoLocale.srcObject = streamEcran;

    // Événement natif du navigateur : déclenché quand l'utilisateur
    // clique "Arrêter le partage" dans la barre native — reprise
    // AUTOMATIQUE de la caméra, sans action applicative supplémentaire.
    pisteEcran.onended = () => arreterPartageEcran();

    etat.partageEcranActif = true;
    return true;
  }

  /**
   * Reprend la caméra via un second replaceTrack() — symétrique de
   * demarrerPartageEcran(). Appelée soit manuellement (bouton),
   * soit automatiquement via track.onended ci-dessus.
   */
  async function arreterPartageEcran() {
    if (!etat.partageEcranActif || !connexionMedia) return;
    const expediteurVideo = connexionMedia.peerConnection
      .getSenders()
      .find((expediteur) => expediteur.track && expediteur.track.kind === 'video');
    if (expediteurVideo && pisteCameraOriginale) {
      await expediteurVideo.replaceTrack(pisteCameraOriginale);
    }
    if (streamEcran) {
      streamEcran.getTracks().forEach((piste) => piste.stop());
      streamEcran = null;
    }
    const videoLocale = document.getElementById('video-locale');
    if (videoLocale) videoLocale.srcObject = streamLocal;

    etat.partageEcranActif = false;
  }

  function partageEcranEstActif() {
    return etat.partageEcranActif;
  }

  /** Termine réellement l'appel — ICI on stop() les pistes (fin définitive). */
  function raccrocher() {
    if (streamEcran) streamEcran.getTracks().forEach((piste) => piste.stop());
    if (connexionMedia) connexionMedia.close();
    if (streamLocal) streamLocal.getTracks().forEach((piste) => piste.stop());
    connexionMedia = null;
    streamLocal = null;
    streamEcran = null;
    pisteCameraOriginale = null;
    etat.microActif = true;
    etat.cameraActive = true;
    etat.partageEcranActif = false;
  }

  window.SenegalConnectWebRTC = {
    initialiserPeer,
    demarrerFluxLocal,
    ecouterAppelsEntrants,
    repondreAppelActuel,
    appeler,
    couperMicro,
    couperCamera,
    demarrerPartageEcran,
    arreterPartageEcran,
    partageEcranEstActif,
    raccrocher,
  };
})();
