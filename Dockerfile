# Image de déploiement tout-en-un : SPA Vite + API Express + Socket.IO.
# Un seul service et une seule origine, ce qui simplifie les cookies,
# le CORS et les WebSockets sur Render Free.
#
# Construction locale :
#   docker build -t allo-togo-store .

FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app/frontend

RUN npm install --global pnpm@10.34.3
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY index.html tsconfig.json vite.config.ts ./
COPY .figma/make ./.figma/make
COPY public ./public
COPY src ./src
RUN pnpm build

FROM node:22-bookworm-slim AS backend-build
WORKDIR /app/backend

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/tsconfig.json ./
COPY backend/prisma ./prisma
COPY backend/src ./src
# Prisma valide les URLs au chargement du schéma, sans se connecter à la base.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    DIRECT_URL=postgresql://build:build@localhost:5432/build \
    npx prisma generate \
  && npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    FRONTEND_DIST_DIR=/app/frontend-dist

COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/package.json ./package.json
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/prisma ./prisma
COPY --from=frontend-build /app/frontend/dist ./frontend-dist

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/prisma/seed.js --bootstrap && node dist/src/server.js"]
