// src/config/swagger.js
// Rôle : génère la spécification OpenAPI 3.0 à partir des annotations
// @openapi présentes dans src/routes/*.js, et définit les éléments
// transverses (schémas réutilisables, sécurité BearerAuth) une seule
// fois pour que chaque route n'ait qu'à les référencer via $ref.

const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');
const { version } = require('../../package.json');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Sénégal Connect — API opérateur télécom',
      version,
      description:
        "API REST d'un opérateur télécom sénégalais (clients, forfaits, factures) " +
        'avec support client temps réel (Socket.IO) et appels audio/vidéo (WebRTC/PeerJS). ' +
        'Projet de fin de module TCS — L3 DSTI, Polytech Diamniadio, UAM. Réalisé par Baye Lahad & Elhadji Omar.',
      contact: {
        name: 'Baye Lahad',
      },
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Développement local' },
    ],
    tags: [
      { name: 'Auth', description: "Inscription, connexion, profil" },
      { name: 'Clients', description: 'Gestion des abonnés' },
      { name: 'Forfaits', description: 'Offres commerciales' },
      { name: 'Factures', description: 'Facturation' },
      { name: 'Tickets', description: 'Support client (tickets, messages, fichiers, appels)' },
      { name: 'Stats', description: 'Tableau de bord administrateur' },
      { name: 'Health', description: 'Supervision technique' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Jeton JWT obtenu via POST /api/auth/login. À fournir dans le header ' +
            'Authorization: Bearer <token>. Cliquer sur "Authorize" ci-dessus pour le tester directement.',
        },
      },
      schemas: {
        Client: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 3 },
            utilisateur_id: { type: 'integer', example: 4 },
            nom: { type: 'string', example: 'Ndiaye' },
            prenom: { type: 'string', example: 'Fatou' },
            email: { type: 'string', format: 'email', example: 'fatou.ndiaye@example.sn' },
            msisdn: {
              type: 'string',
              pattern: '^\\+221[0-9]{9}$',
              example: '+221771234501',
            },
            forfait_id: { type: 'integer', nullable: true, example: 2 },
            statut: {
              type: 'string',
              enum: ['actif', 'suspendu', 'resilie'],
              example: 'actif',
            },
            date_inscription: { type: 'string', format: 'date', example: '2025-09-01' },
          },
        },
        Utilisateur: {
          type: 'object',
          description: 'Compte applicatif. Le mot de passe n’est jamais renvoyé par l’API.',
          properties: {
            id: { type: 'integer', example: 4 },
            nom: { type: 'string', maxLength: 100, example: 'Ndiaye' },
            prenom: { type: 'string', maxLength: 100, example: 'Fatou' },
            email: { type: 'string', format: 'email', example: 'fatou.ndiaye@sc.sn' },
            role: { type: 'string', enum: ['client', 'agent', 'admin'], example: 'client' },
            cree_le: { type: 'string', format: 'date-time', example: '2026-01-15T10:30:00.000Z' },
          },
        },
        Forfait: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 2 },
            nom: { type: 'string', example: 'Sénégal Connect Confort' },
            quota_data_go: { type: 'number', example: 15 },
            quota_voix_min: { type: 'integer', example: 200 },
            prix_mensuel_fcfa: { type: 'number', example: 9000 },
            actif: { type: 'boolean', example: true },
            nb_clients: {
              type: 'integer',
              example: 12,
              description: "Nombre d'abonnés actifs (calculé via COUNT/JOIN)",
            },
          },
        },
        Facture: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 15 },
            client_id: { type: 'integer', example: 3 },
            reference: { type: 'string', example: 'FAC-202601-0042' },
            periode: { type: 'string', example: '2026-01' },
            montant_fcfa: { type: 'number', example: 9000 },
            statut: {
              type: 'string',
              enum: ['payee', 'impayee', 'en_retard'],
              example: 'impayee',
            },
            date_emission: { type: 'string', format: 'date', example: '2026-01-05' },
            date_echeance: { type: 'string', format: 'date', example: '2026-01-20' },
          },
        },
        Ticket: {
          type: 'object',
          description: 'Demande de support. Les champs de nom et d’email sont fournis par les jointures lors de la consultation.',
          properties: {
            id: { type: 'integer', example: 7 },
            client_id: { type: 'integer', example: 3 },
            agent_id: { type: 'integer', nullable: true, example: 2 },
            sujet: { type: 'string', maxLength: 255, example: 'Problème de connexion data' },
            statut: { type: 'string', enum: ['ouvert', 'en_cours', 'ferme'], example: 'en_cours' },
            ouvert_le: { type: 'string', format: 'date-time', example: '2026-01-15T10:30:00.000Z' },
            ferme_le: { type: 'string', format: 'date-time', nullable: true },
            client_utilisateur_id: { type: 'integer', example: 4 },
            client_nom: { type: 'string', example: 'Ndiaye' },
            client_prenom: { type: 'string', example: 'Fatou' },
            agent_nom: { type: 'string', nullable: true, example: 'Diallo' },
            agent_prenom: { type: 'string', nullable: true, example: 'Amadou' },
          },
        },
        Message: {
          type: 'object',
          description: 'Message de conversation associé à un ticket. Les fichiers sont téléversés par HTTP puis partagés via Socket.IO.',
          properties: {
            id: { type: 'integer', example: 25 },
            ticket_id: { type: 'integer', example: 7 },
            expediteur_id: { type: 'integer', example: 4 },
            type: { type: 'string', enum: ['texte', 'fichier', 'image', 'audio'], example: 'texte' },
            contenu: { type: 'string', nullable: true, example: 'Ma connexion ne fonctionne plus.' },
            fichier_url: { type: 'string', nullable: true, example: '/uploads/0f08d5f4.pdf' },
            fichier_nom: { type: 'string', nullable: true, example: 'capture.pdf' },
            fichier_taille: { type: 'integer', format: 'int64', nullable: true, example: 204800 },
            envoye_le: { type: 'string', format: 'date-time', example: '2026-01-15T10:42:00.000Z' },
            expediteur_nom: { type: 'string', example: 'Ndiaye' },
            expediteur_prenom: { type: 'string', example: 'Fatou' },
          },
        },
        Appel: {
          type: 'object',
          description: 'Historique d’un appel audio ou vidéo d’un ticket. La signalisation est gérée avec Socket.IO/WebRTC.',
          properties: {
            id: { type: 'integer', example: 12 },
            ticket_id: { type: 'integer', example: 7 },
            initiateur_id: { type: 'integer', example: 4 },
            destinataire_id: { type: 'integer', example: 2 },
            type: { type: 'string', enum: ['audio', 'video'], example: 'audio' },
            statut: { type: 'string', enum: ['en_attente', 'accepte', 'refuse', 'termine'], example: 'termine' },
            duree_secondes: { type: 'integer', nullable: true, example: 185 },
            debut_le: { type: 'string', format: 'date-time', example: '2026-01-15T11:00:00.000Z' },
            fin_le: { type: 'string', format: 'date-time', nullable: true, example: '2026-01-15T11:03:05.000Z' },
          },
        },
        StatistiquesTableauDeBord: {
          type: 'object',
          description: 'Indicateurs agrégés réservés aux administrateurs.',
          properties: {
            clients_actifs: { type: 'integer', example: 38 },
            mrr_fcfa: { type: 'number', example: 285000 },
            factures_impayees: { type: 'integer', example: 5 },
            tickets_ouverts: { type: 'integer', example: 6 },
          },
        },
        Health: {
          type: 'object',
          description: 'État de disponibilité du processus Node.js. Cette sonde ne vérifie pas PostgreSQL.',
          required: ['statut', 'version', 'uptime', 'env'],
          properties: {
            statut: { type: 'string', enum: ['ok'], example: 'ok' },
            version: { type: 'string', example: '1.0.0' },
            uptime: { type: 'number', format: 'float', example: 1234.56 },
            env: { type: 'string', example: 'development' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer', example: 42 },
            page: { type: 'integer', example: 1 },
            limite: { type: 'integer', example: 20 },
            total_pages: { type: 'integer', example: 3 },
          },
        },
        Erreur: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Données invalides' },
            erreurs: {
              type: 'array',
              nullable: true,
              items: {
                type: 'object',
                properties: {
                  champ: { type: 'string', example: 'msisdn' },
                  message: { type: 'string', example: 'Format invalide, attendu +221XXXXXXXXX' },
                  valeur: { type: 'string', example: '771234501' },
                },
              },
            },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
  },
  // swagger-jsdoc s'appuie sur glob pour lire les annotations. Sous Windows,
  // les antislashs d'un chemin absolu ne sont pas reconnus par glob et la
  // spécification était alors générée sans aucune route (`paths: {}`).
  // Les slashs sont valides sur toutes les plateformes pour ce motif.
  apis: [path.resolve(__dirname, '../routes/*.js').replace(/\\/g, '/')],
};
const specification = swaggerJsdoc(options);

module.exports = specification;
