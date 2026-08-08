FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci --only=production

COPY src/ ./src/
COPY public/ ./public/
COPY docs/ ./docs/

RUN mkdir -p uploads logs

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

EXPOSE 3000 9000

CMD ["node", "src/server.js"]
