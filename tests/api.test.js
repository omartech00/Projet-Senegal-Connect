// tests/api.test.js
// Rôle : suite Jest + Supertest, BDD entièrement mockée. UN SEUL
// jest.mock('../src/config/db') suffit à intercepter tous les appels
// SQL de l'application, quel que soit le service qui les déclenche —
// bénéfice direct de la séparation stricte des couches (Phase 8).
// 25 tests répartis dans les 6 catégories exactes du PDF (section M5).

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  verifierConnexion: jest.fn().mockResolvedValue(true),
  pool: { on: jest.fn() },
}));

const db = require('../src/config/db');
const app = require('../src/app');

// Hash bcrypt réel (coût 12) du mot de passe "Test1234!" — identique
// à celui inséré dans docs/schema.sql (Phase 7), pour que le test de
// login exécute une VRAIE vérification bcrypt.compare(), pas un mock.
const HASH_TEST_1234 = '$2b$12$ItXUUkXNboaN04iu6MGLGu/fGtOkaJe/2MJBCOWeQp9dlZdrmS7NC';

function genererToken({ id = 1, nom = 'Test', email = 'test@example.sn', role = 'admin' } = {}) {
  return jwt.sign({ id, nom, email, role }, process.env.JWT_SECRET, {
    expiresIn: '24h',
    issuer: 'senegal-connect',
  });
}

beforeEach(() => {
  db.query.mockReset();
  db.transaction.mockReset();
});

// ============================================================
// AUTH (5 tests)
// ============================================================
describe('Auth', () => {
  test('Inscription valide → 201, role forcé à client', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // trouverParEmail : aucun doublon
      .mockResolvedValueOnce({
        rows: [{ id: 10, nom: 'Sow', prenom: 'Modou', email: 'modou.sow@example.sn', role: 'client', cree_le: new Date() }],
      });

    const reponse = await request(app).post('/api/auth/register').send({
      nom: 'Sow',
      prenom: 'Modou',
      email: 'modou.sow@example.sn',
      mot_de_passe: 'Test1234!',
      role: 'admin', // tentative d'injection de rôle — doit être ignorée
    });

    expect(reponse.status).toBe(201);
    expect(reponse.body.utilisateur.role).toBe('client');
  });

  test('Doublon email à l\'inscription → 409 (le PDF mentionne "MSISDN" pour cette catégorie, mais /auth/register n\'a pas de champ msisdn — email est le champ unique réel de ce endpoint, cf. décision documentée en Phase 30)', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, email: 'admin@senegalconnect.sn' }],
    });

    const reponse = await request(app).post('/api/auth/register').send({
      nom: 'Diallo',
      prenom: 'Admin',
      email: 'admin@senegalconnect.sn',
      mot_de_passe: 'Test1234!',
    });

    expect(reponse.status).toBe(409);
  });

  test('Login valide → JWT (vraie vérification bcrypt)', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, nom: 'Admin', email: 'admin@senegalconnect.sn', role: 'admin', mot_de_passe: HASH_TEST_1234 }],
    });

    const reponse = await request(app).post('/api/auth/login').send({
      email: 'admin@senegalconnect.sn',
      mot_de_passe: 'Test1234!',
    });

    expect(reponse.status).toBe(200);
    expect(typeof reponse.body.token).toBe('string');
    expect(reponse.body.utilisateur.role).toBe('admin');
  });

  test('Email inconnu au login → 401 (message générique)', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const reponse = await request(app).post('/api/auth/login').send({
      email: 'inconnu@example.sn',
      mot_de_passe: 'quelconque',
    });

    expect(reponse.status).toBe(401);
    expect(reponse.body.message).toBe('Identifiants incorrects');
  });

  test('Token expiré → 401 "Token expiré — veuillez vous reconnecter"', async () => {
    const tokenExpire = jwt.sign(
      { id: 1, nom: 'Admin', email: 'admin@senegalconnect.sn', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: -10, issuer: 'senegal-connect' } // déjà expiré
    );

    const reponse = await request(app).get('/api/auth/profil').set('Authorization', `Bearer ${tokenExpire}`);

    expect(reponse.status).toBe(401);
    expect(reponse.body.message).toBe('Token expiré — veuillez vous reconnecter');
  });
});

// ============================================================
// CLIENTS (5 tests)
// ============================================================
describe('Clients', () => {
  test('Liste paginée avec objet pagination complet', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: '2' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, nom: 'Ndiaye' }, { id: 2, nom: 'Diop' }] });

    const reponse = await request(app)
      .get('/api/clients?page=1&limite=20')
      .set('Authorization', `Bearer ${genererToken()}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.data).toHaveLength(2);
    expect(reponse.body.pagination).toEqual({ total: 2, page: 1, limite: 20, total_pages: 1 });
  });

  test('Filtrage ?q= transmis correctement', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, nom: 'Ndiaye' }] });

    const reponse = await request(app)
      .get('/api/clients?q=Ndiaye')
      .set('Authorization', `Bearer ${genererToken()}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.data).toHaveLength(1);
  });

  test('Détail client existant → forfait + dernière facture + ticket en cours', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, nom: 'Ndiaye', msisdn: '+221771234501' }] })
      .mockResolvedValueOnce({ rows: [] }) // aucune facture
      .mockResolvedValueOnce({ rows: [] }); // aucun ticket en cours

    const reponse = await request(app).get('/api/clients/1').set('Authorization', `Bearer ${genererToken()}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.client.id).toBe(1);
    expect(reponse.body.derniere_facture).toBeNull();
    expect(reponse.body.ticket_en_cours).toBeNull();
  });

  test('404 sur un ID client inexistant', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const reponse = await request(app).get('/api/clients/999').set('Authorization', `Bearer ${genererToken()}`);

    expect(reponse.status).toBe(404);
  });

  test('MSISDN invalide à la création → 422', async () => {
    const reponse = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${genererToken({ role: 'admin' })}`)
      .send({ utilisateur_id: 2, msisdn: '771234501' }); // sans le préfixe +221

    expect(reponse.status).toBe(422);
    expect(db.query).not.toHaveBeenCalled(); // rejeté avant tout accès BDD
  });
});

// ============================================================
// FORFAITS (4 tests)
// ============================================================
describe('Forfaits', () => {
  test('Liste des forfaits actifs → 200 avec nb_clients (casté en nombre)', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, nom: 'Essentiel', prix_mensuel_fcfa: '4000', nb_clients: '3' }],
    });

    const reponse = await request(app).get('/api/forfaits');

    expect(reponse.status).toBe(200);
    expect(reponse.body.data[0].nb_clients).toBe(3);
    expect(typeof reponse.body.data[0].nb_clients).toBe('number');
  });

  test('Créer un forfait sans token → 401', async () => {
    const reponse = await request(app).post('/api/forfaits').send({ nom: 'Test', quota_data_go: 5, quota_voix_min: 60, prix_mensuel_fcfa: 4000 });

    expect(reponse.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('Créer un forfait avec un prix négatif → 422', async () => {
    const reponse = await request(app)
      .post('/api/forfaits')
      .set('Authorization', `Bearer ${genererToken({ role: 'admin' })}`)
      .send({ nom: 'Test', quota_data_go: 5, quota_voix_min: 60, prix_mensuel_fcfa: -100 });

    expect(reponse.status).toBe(422);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('Supprimer un forfait avec clients actifs abonnés → 409', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 2, nom: 'Confort' }] }) // trouverParId
      .mockResolvedValueOnce({ rows: [{ total: '2' }] }); // compterClientsAbonnes (actifs)

    const reponse = await request(app)
      .delete('/api/forfaits/2')
      .set('Authorization', `Bearer ${genererToken({ role: 'admin' })}`);

    expect(reponse.status).toBe(409);
  });
});

// ============================================================
// FACTURES (4 tests)
// ============================================================
describe('Factures', () => {
  test('Liste filtrée ?client_id=', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, client_id: 1, montant_fcfa: '9000' }] });

    const reponse = await request(app)
      .get('/api/factures?client_id=1')
      .set('Authorization', `Bearer ${genererToken()}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.data).toHaveLength(1);
  });

  test('Créer une facture avec un montant négatif → 422', async () => {
    const reponse = await request(app)
      .post('/api/factures')
      .set('Authorization', `Bearer ${genererToken({ role: 'admin' })}`)
      .send({ client_id: 1, periode: '2026-02', montant_fcfa: -500, date_echeance: '2026-02-20' });

    expect(reponse.status).toBe(422);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('Créer une facture avec client_id inexistant → 422', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // clientsModel.trouverParId

    const reponse = await request(app)
      .post('/api/factures')
      .set('Authorization', `Bearer ${genererToken({ role: 'admin' })}`)
      .send({ client_id: 999, periode: '2026-02', montant_fcfa: 4000, date_echeance: '2026-02-20' });

    expect(reponse.status).toBe(422);
    expect(reponse.body.erreurs[0].champ).toBe('client_id');
  });

  test('Mettre à jour le statut d\'une facture → 200', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, client_id: 1, statut: 'impayee' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, client_id: 1, statut: 'payee' }] });

    const reponse = await request(app)
      .put('/api/factures/1/statut')
      .set('Authorization', `Bearer ${genererToken({ role: 'admin' })}`)
      .send({ statut: 'payee' });

    expect(reponse.status).toBe(200);
    expect(reponse.body.facture.statut).toBe('payee');
  });
});

// ============================================================
// VALIDATION (4 tests)
// ============================================================
describe('Validation transverse', () => {
  test('Email invalide à l\'inscription → 422 avec le champ précisé', async () => {
    const reponse = await request(app).post('/api/auth/register').send({
      nom: 'Test', prenom: 'Test', email: 'pas-un-email', mot_de_passe: 'Test1234!',
    });

    expect(reponse.status).toBe(422);
    expect(reponse.body.erreurs.some((e) => e.champ === 'email')).toBe(true);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('Format MSISDN incorrect sur une modification de client → 422', async () => {
    const reponse = await request(app)
      .put('/api/clients/1')
      .set('Authorization', `Bearer ${genererToken({ role: 'admin' })}`)
      .send({ msisdn: '0771234501' }); // sans +221

    expect(reponse.status).toBe(422);
    expect(reponse.body.erreurs.some((e) => e.champ === 'msisdn')).toBe(true);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('Corps vide à l\'inscription → 422 (toutes les erreurs par champ)', async () => {
    const reponse = await request(app).post('/api/auth/register').send({});

    expect(reponse.status).toBe(422);
    expect(reponse.body.erreurs.length).toBeGreaterThanOrEqual(3); // nom, prenom, email, mot_de_passe
  });

  test('Route inconnue → 404 JSON structuré', async () => {
    const reponse = await request(app).get('/api/route-qui-nexiste-pas');

    expect(reponse.status).toBe(404);
    expect(reponse.body.message).toMatch(/introuvable/);
  });
});

// ============================================================
// MONITORING (3 tests)
// ============================================================
describe('Monitoring', () => {
  test('GET /api/health → 200 avec statut/version/uptime/env', async () => {
    const reponse = await request(app).get('/api/health');

    expect(reponse.status).toBe(200);
    expect(reponse.body).toHaveProperty('statut', 'ok');
    expect(reponse.body).toHaveProperty('version');
    expect(reponse.body).toHaveProperty('uptime');
    expect(reponse.body).toHaveProperty('env', 'test');
  });

  test('GET /api/stats → 200 avec les 4 champs requis, tous numériques', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ clients_actifs: '3', mrr_fcfa: '22000', factures_impayees: '1', tickets_ouverts: '0' }],
    });

    const reponse = await request(app).get('/api/stats').set('Authorization', `Bearer ${genererToken({ role: 'admin' })}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.data).toEqual({
      clients_actifs: 3, mrr_fcfa: 22000, factures_impayees: 1, tickets_ouverts: 0,
    });
  });

  test('GET /api/health répond en moins de 200ms', async () => {
    const debut = Date.now();
    const reponse = await request(app).get('/api/health');
    const duree = Date.now() - debut;

    expect(reponse.status).toBe(200);
    expect(duree).toBeLessThan(200);
  });
});
