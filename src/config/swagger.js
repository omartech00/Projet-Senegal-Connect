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
        'Projet de fin de module TCS — L3 DSTI, Polytech Diamniadio, UAM.',
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
  apis: [path.join(__dirname, '../routes/*.js')],
};
const specification = swaggerJsdoc(options);

module.exports = specification;
