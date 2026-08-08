const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.1',
    info: {
      title: 'Senegal Connect — API REST',
      version: '1.0.0',
      description: "API REST d'operateur telecom avec support client en temps reel.\n\nModule : Technologie Client-Serveur (TCS) — Licence 3, Polytech Diamniadio.\nEnseignant : Dr Keba GUEYE.",
      contact: { name: 'Senegal Connect', email: 'contact@senegalconnect.sn' },
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Developpement local' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Collez le token JWT retourne par POST /api/auth/login',
        },
      },
      schemas: {
        Utilisateur: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            nom: { type: 'string', example: 'Diallo' },
            prenom: { type: 'string', example: 'Amadou' },
            email: { type: 'string', format: 'email', example: 'admin@senegalconnect.sn' },
            role: { type: 'string', enum: ['client', 'agent', 'admin'], example: 'admin' },
            cree_le: { type: 'string', format: 'date-time' },
          },
        },
        Client: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            utilisateur_id: { type: 'integer', example: 4 },
            msisdn: { type: 'string', example: '+221771234567' },
            forfait_id: { type: 'integer', nullable: true, example: 2 },
            statut: { type: 'string', enum: ['actif', 'suspendu', 'resilie'], example: 'actif' },
            date_inscription: { type: 'string', format: 'date-time' },
            utilisateur: { $ref: '#/components/schemas/Utilisateur' },
            forfait: { $ref: '#/components/schemas/Forfait' },
          },
        },
        Forfait: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 2 },
            nom: { type: 'string', example: 'Yewwi 5Go' },
            quota_data_go: { type: 'number', example: 5 },
            quota_voix_min: { type: 'integer', example: 300 },
            prix_mensuel_fcfa: { type: 'number', example: 5000 },
            actif: { type: 'boolean', example: true },
            nb_clients: { type: 'integer', example: 12 },
          },
        },
        Facture: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            client_id: { type: 'integer', example: 1 },
            reference: { type: 'string', example: 'FAC-202501-0001' },
            periode: { type: 'string', example: '2025-01' },
            montant_fcfa: { type: 'number', example: 5000 },
            statut: { type: 'string', enum: ['payee', 'impayee', 'en_retard'], example: 'payee' },
            date_emission: { type: 'string', format: 'date-time' },
            date_echeance: { type: 'string', format: 'date-time' },
          },
        },
        Ticket: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            client_id: { type: 'integer', example: 1 },
            agent_id: { type: 'integer', nullable: true, example: 2 },
            sujet: { type: 'string', example: 'Facture incorrecte' },
            statut: { type: 'string', enum: ['ouvert', 'en_cours', 'ferme'], example: 'ouvert' },
            ouvert_le: { type: 'string', format: 'date-time' },
            ferme_le: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer', example: 25 },
            page: { type: 'integer', example: 1 },
            limite: { type: 'integer', example: 10 },
            total_pages: { type: 'integer', example: 3 },
          },
        },
        Erreur: {
          type: 'object',
          properties: {
            erreur: { type: 'string', example: 'Donnees invalides' },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  champ: { type: 'string', example: 'msisdn' },
                  message: { type: 'string', example: 'Format MSISDN invalide' },
                  valeur: { type: 'string', example: '771234567' },
                },
              },
            },
          },
        },
        Stats: {
          type: 'object',
          properties: {
            clients_actifs: { type: 'integer', example: 3 },
            mrr_fcfa: { type: 'number', example: 16000 },
            factures_impayees: { type: 'integer', example: 2 },
            tickets_ouverts: { type: 'integer', example: 2 },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

const setupSwagger = (app) => {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Senegal Connect — API Docs',
  }));
  app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
};

module.exports = { setupSwagger, swaggerSpec };
