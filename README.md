# Senegal Connect

API REST d'operateur telecom avec support client en temps reel.

## Technologies

- **Backend**: Node.js 20 + Express
- **Base de donnees**: PostgreSQL 14
- **Temps reel**: Socket.IO 4
- **Appels video**: PeerJS (WebRTC)
- **Auth**: JWT + bcrypt
- **Tests**: Jest + Supertest
- **Documentation**: Swagger/OpenAPI 3.0
- **Conteneurisation**: Docker + Docker Compose

## Prérequis

- Node.js >= 20
- PostgreSQL 14
- Docker + Docker Compose (optionnel)

## Installation locale

```bash
git clone https://github.com/votre-groupe/senegal-connect.git
cd senegal-connect
npm install
cp .env.example .env
createdb senegal_connect
psql senegal_connect < docs/schema.sql
npm start
```

## Lancement avec Docker

```bash
docker compose up -d
```

L'API sera disponible sur `http://localhost:3000`.

## Documentation Swagger

- **Swagger UI**: http://localhost:3000/api/docs
- **Spec JSON**: http://localhost:3000/api/docs.json

## Endpoints principaux

| Methode | Route | Auth | Description |
|---------|-------|------|-------------|
| POST | /api/auth/register | Non | Inscription |
| POST | /api/auth/login | Non | Connexion (JWT) |
| GET | /api/auth/profil | JWT | Profil utilisateur |
| GET | /api/clients | JWT | Liste clients (pagination) |
| POST | /api/clients | Admin | Creer client |
| GET | /api/forfaits | Non | Liste forfaits |
| POST | /api/forfaits | Admin | Creer forfait |
| GET | /api/factures | JWT | Liste factures |
| POST | /api/factures | Admin | Creer facture |
| GET | /api/tickets | JWT | Liste tickets |
| POST | /api/tickets | JWT | Creer ticket |
| GET | /api/stats | Admin | Tableau de bord |
| GET | /api/health | Non | Healthcheck |

## Modeles de communication TCS

1. **Requete/Reponse (HTTP/REST)**: Toutes les operations CRUD
2. **WebSocket (Socket.IO)**: Chat de support en temps reel
3. **Pair-a-pair (WebRTC)**: Appels audio/video entre client et agent

## Tests

```bash
npm test
npm run test:cov
```

## Auteurs

Binome L3 DSTI — Polytech Diamniadio, UAM
Enseignant: Dr Keba GUEYE
