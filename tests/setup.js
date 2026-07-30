// tests/setup.js
// Rôle : fixe les variables d'environnement de test AVANT que src/
// config/env.js ne s'exécute (setupFiles Jest, exécuté avant chaque
// fichier de test). dotenv ne surécrit jamais une variable déjà
// présente dans process.env — aucun vrai .env n'est donc nécessaire
// pour faire tourner npm test.

process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'test-host';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'test-db';
process.env.DB_USER = 'test-user';
process.env.DB_PASS = 'test-pass';
process.env.JWT_SECRET = 'a'.repeat(64); // >= 64 caractères, exigé par env.js (Phase 4)
process.env.JWT_EXPIRES_IN = '24h';
process.env.LOG_LEVEL = 'error';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.MAX_FILE_SIZE = '10485760';
process.env.PORT = '3000';
