FROM node:20-alpine

WORKDIR /app

# Copie des manifestes de dépendances
COPY package.json package-lock.json ./

# Installation des dépendances de production uniquement
RUN npm install --omit=dev

# Copie du code source
COPY . .

# Création des dossiers d'écriture et attribution des droits à l'utilisateur node
RUN mkdir -p uploads logs && chown -R node:node /app

USER node

ENV NODE_ENV=production
EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "src/server.js"]