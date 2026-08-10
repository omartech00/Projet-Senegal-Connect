# Dockerfile
# Rôle : image Docker de l'API Sénégal Connect.
# node:20-alpine (imposé par le PDF) — image officielle légère,
# inclut nativement un utilisateur non-root "node" (uid 1000) et
# busybox (fournit wget, utilisé ci-dessous pour le HEALTHCHECK).

FROM node:20-alpine

WORKDIR /app

# --- Dépendances d'abord (optimisation du cache Docker) ---
# Si seul le code applicatif change entre deux builds, cette couche
# reste en cache et npm ci n'est pas ré-exécuté — gain de temps de
# build significatif en développement itératif.
COPY package.json package-lock.json ./
RUN npm ci --only=production

# --- Code source de l'application ---
COPY . .

# --- Dossiers d'écriture (logs Winston en JSON, fichiers uploadés) ---
# Doivent exister et être accessibles en écriture par l'utilisateur
# non-root "node" AVANT de changer d'utilisateur ci-dessous — sinon
# le conteneur plante au démarrage (EACCES) dès NODE_ENV=production.
RUN mkdir -p uploads logs && chown -R node:node /app

# --- Utilisateur non-root (jamais root en production) ---
USER node

ENV NODE_ENV=production
EXPOSE 3000

# --- Healthcheck ---
# wget natif d'Alpine (busybox), pas curl (absent par défaut,
# éviterait une couche apk supplémentaire pour un simple test).
# --start-period=10s laisse le temps à verifierConnexion() (Phase 5)
# de réussir sa première tentative avant que Docker ne juge le
# conteneur "unhealthy" par erreur.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "src/server.js"]
