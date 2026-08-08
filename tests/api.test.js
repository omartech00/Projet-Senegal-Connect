process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-at-least-64-characters-long-for-testing-purposes-ok';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DB_HOST = 'localhost';
process.env.DB_NAME = 'senegal_connect_test';
process.env.DB_USER = 'postgres';
process.env.DB_PASS = 'postgres';

const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockQuery = jest.fn();
const mockTransaction = jest.fn();
const mockPool = { connect: jest.fn(), on: jest.fn(), end: jest.fn() };

jest.mock('../src/config/db', () => ({
  query: (...args) => mockQuery(...args),
  transaction: (...args) => mockTransaction(...args),
  pool: mockPool,
}));

const { app } = require('../src/server');

const JWT_SECRET = process.env.JWT_SECRET;

function makeToken(payload = {}) {
  return jwt.sign(
    { id: 1, nom: 'Test', email: 'test@test.sn', role: 'admin', ...payload },
    JWT_SECRET,
    { expiresIn: '1h', issuer: 'senegal-connect' }
  );
}

const adminToken = makeToken({ role: 'admin' });
const clientToken = makeToken({ role: 'client', id: 4 });
const agentToken = makeToken({ role: 'agent', id: 2 });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Auth (5 tests)', () => {
  test('POST /api/auth/register — 201 si donnees valides', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 9, nom: 'Fall', prenom: 'Ousmane', email: 'ousmane@test.sn', role: 'client', cree_le: new Date() }],
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ nom: 'Fall', prenom: 'Ousmane', email: 'ousmane@test.sn', mot_de_passe: 'password123', role: 'client' });

    expect(res.status).toBe(201);
    expect(res.body.utilisateur).toBeDefined();
    expect(res.body.utilisateur.email).toBe('ousmane@test.sn');
  });

  test('POST /api/auth/register — 409 si email doublon', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ nom: 'Fall', prenom: 'Ousmane', email: 'admin@senegalconnect.sn', mot_de_passe: 'password123', role: 'client' });

    expect(res.status).toBe(409);
    expect(res.body.erreur).toMatch(/Doublon|Email/i);
  });

  test('POST /api/auth/login — 200 si identifiants valides', async () => {
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash('password123', 12);
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, nom: 'Diallo', prenom: 'Amadou', email: 'admin@senegalconnect.sn', mot_de_passe: hash, role: 'admin' }],
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@senegalconnect.sn', mot_de_passe: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.expires_in).toBe('1h');
    expect(res.body.utilisateur.role).toBe('admin');
  });

  test('POST /api/auth/login — 401 si email inconnu', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inconnu@test.sn', mot_de_passe: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.erreur).toMatch(/incorrects/i);
  });

  test('GET /api/auth/profil — 401 si token expire', async () => {
    const expiredToken = jwt.sign({ id: 1, role: 'admin' }, JWT_SECRET, { expiresIn: '0s', issuer: 'senegal-connect' });
    await new Promise(r => setTimeout(r, 1100));

    const res = await request(app)
      .get('/api/auth/profil')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.erreur).toMatch(/expir/i);
  });
});

describe('Clients (5 tests)', () => {
  test('GET /api/clients — 200 avec pagination', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, msisdn: '+221771234567', statut: 'actif', nom: 'Fall', prenom: 'Ousmane', email: 'ousmane@test.sn', forfait_nom: 'Yewwi 5Go', prix_mensuel_fcfa: 5000 },
        { id: 2, msisdn: '+221782345678', statut: 'actif', nom: 'Ba', prenom: 'Aissatou', email: 'aissatou@test.sn', forfait_nom: 'Yewwi 1Go', prix_mensuel_fcfa: 1000 },
      ],
    });

    const res = await request(app)
      .get('/api/clients')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(2);
  });

  test('GET /api/clients — filtre ?q=', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, msisdn: '+221771234567', statut: 'actif', nom: 'Fall', prenom: 'Ousmane', email: 'ousmane@test.sn' }],
    });

    const res = await request(app)
      .get('/api/clients?q=Fall')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test('GET /api/clients/:id — 200 si client existe', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, msisdn: '+221771234567', statut: 'actif', utilisateur_id: 4, forfait_id: 2, nom: 'Fall', prenom: 'Ousmane', email: 'ousmane@test.sn' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 2, nom: 'Yewwi 5Go' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, montant_fcfa: 5000 }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/clients/1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.msisdn).toBe('+221771234567');
    expect(res.body.forfait).toBeDefined();
  });

  test('GET /api/clients/:id — 404 si inexistant', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/clients/999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.erreur).toMatch(/introuvable/i);
  });

  test('POST /api/clients — 422 si MSISDN invalide', async () => {
    const res = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nom: 'Fall', prenom: 'Ousmane', email: 'ousmane@test.sn', mot_de_passe: 'password123', msisdn: '771234567' });

    expect(res.status).toBe(422);
    expect(res.body.details).toBeDefined();
    expect(res.body.details.some(d => d.champ === 'msisdn')).toBe(true);
  });
});

describe('Forfaits (4 tests)', () => {
  test('GET /api/forfaits — 200 avec nb_clients', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, nom: 'Yewwi 1Go', quota_data_go: 1, prix_mensuel_fcfa: 1000, nb_clients: '1' },
        { id: 2, nom: 'Yewwi 5Go', quota_data_go: 5, prix_mensuel_fcfa: 5000, nb_clients: '2' },
      ],
    });

    const res = await request(app).get('/api/forfaits');

    expect(res.status).toBe(200);
    expect(res.body[0].nb_clients).toBeDefined();
  });

  test('POST /api/forfaits — 401 sans token', async () => {
    const res = await request(app)
      .post('/api/forfaits')
      .send({ nom: 'Test', prix_mensuel_fcfa: 5000 });

    expect(res.status).toBe(401);
    expect(res.body.erreur).toMatch(/Token/i);
  });

  test('POST /api/forfaits — 422 si prix negatif', async () => {
    const res = await request(app)
      .post('/api/forfaits')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nom: 'Test', prix_mensuel_fcfa: -1000 });

    expect(res.status).toBe(422);
    expect(res.body.details).toBeDefined();
  });

  test('DELETE /api/forfaits/:id — 409 si clients abonnes', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });

    const res = await request(app)
      .delete('/api/forfaits/1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(res.body.erreur).toMatch(/abonnes/i);
  });
});

describe('Factures (4 tests)', () => {
  test('GET /api/factures — filtre ?client_id=', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, reference: 'FAC-202501-0001', periode: '2025-01', montant_fcfa: 5000, statut: 'payee', nom: 'Fall', prenom: 'Ousmane' },
        { id: 2, reference: 'FAC-202502-0002', periode: '2025-02', montant_fcfa: 5000, statut: 'payee', nom: 'Fall', prenom: 'Ousmane' },
      ],
    });

    const res = await request(app)
      .get('/api/factures?client_id=1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  test('POST /api/factures — 422 si montant negatif', async () => {
    const res = await request(app)
      .post('/api/factures')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ client_id: 1, periode: '2025-03', montant_fcfa: -500, date_echeance: '2025-03-20' });

    expect(res.status).toBe(422);
  });

  test('POST /api/factures — 422 si client_id inexistant', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/factures')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ client_id: 999, periode: '2025-03', montant_fcfa: 5000, date_echeance: '2025-03-20' });

    expect(res.status).toBe(422);
    expect(res.body.erreur).toMatch(/inexistant/i);
  });

  test('PUT /api/factures/:id/statut — 200 si valide', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, reference: 'FAC-202501-0001', statut: 'payee' }] });

    const res = await request(app)
      .put('/api/factures/1/statut')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statut: 'payee' });

    expect(res.status).toBe(200);
    expect(res.body.statut).toBe('payee');
  });
});

describe('Validation (4 tests)', () => {
  test('POST /api/auth/register — 422 si email invalide', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ nom: 'Test', prenom: 'User', email: 'pas-un-email', mot_de_passe: 'password123', role: 'client' });

    expect(res.status).toBe(422);
    expect(res.body.details.some(d => d.champ === 'email')).toBe(true);
  });

  test('POST /api/clients — 422 si format MSISDN incorrect', async () => {
    const res = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nom: 'Test', prenom: 'User', email: 'test@test.sn', mot_de_passe: 'password123', msisdn: '771234' });

    expect(res.status).toBe(422);
    expect(res.body.details.some(d => d.champ === 'msisdn')).toBe(true);
  });

  test('POST /api/auth/register — 422 si corps vide', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  test('GET /api/route-inexistante — 404', async () => {
    const res = await request(app).get('/api/route-inexistante');
    expect(res.status).toBe(404);
  });
});

describe('Monitoring (3 tests)', () => {
  test('GET /api/health — 200 avec champs requis', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.statut).toBe('ok');
    expect(res.body.version).toBeDefined();
    expect(res.body.uptime).toBeDefined();
    expect(res.body.env).toBeDefined();
  });

  test('GET /api/stats — 200 avec champs requis', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ clients_actifs: 4, mrr_fcfa: 16000, factures_impayees: 2, tickets_ouverts: 2 }],
    });

    const res = await request(app)
      .get('/api/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.clients_actifs).toBeDefined();
    expect(res.body.mrr_fcfa).toBeDefined();
    expect(res.body.factures_impayees).toBeDefined();
    expect(res.body.tickets_ouverts).toBeDefined();
  });

  test('Reponse API < 200ms', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    const start = Date.now();
    await request(app).get('/api/health');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(200);
  });
});
