FROM node:22-bookworm-slim AS base

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS builder

COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma

RUN npm ci

RUN --network=none DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    npx --no-install prisma generate

RUN npm prune --omit=dev && npm cache clean --force

FROM base AS runtime

ENV NODE_ENV=production

COPY --from=builder --chown=node:node /app/node_modules ./node_modules

COPY --chown=node:node package.json tsconfig.json ./
COPY --chown=node:node prisma/schema.prisma ./prisma/schema.prisma
COPY --chown=node:node src ./src
COPY --from=builder --chown=node:node /app/src/generated/prisma ./src/generated/prisma
COPY --chown=node:node examples ./examples
COPY --chown=node:node sql ./sql
COPY --chown=node:node scripts/migrations ./scripts/migrations

USER node

EXPOSE 3000

CMD ["npm", "start"]
