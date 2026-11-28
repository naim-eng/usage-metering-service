FROM node:22-bookworm-slim AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Non-secret configuration for Next.js build-time module evaluation.
# These values are scoped to this command and are not runtime credentials.
RUN --network=none PRODUCTION_IMAGE_BUILD=1 DEPLOYMENT_ENV=local \
    AUTH_DATABASE_URL=postgresql://build:build@127.0.0.1:1/build \
    BETTER_AUTH_SECRET=synthetic-build-only-secret-not-for-production \
    BETTER_AUTH_URL=http://localhost:3000 \
    METERING_API_URL=http://localhost:3000 \
    METERING_ADMIN_API_KEY=synthetic-build-only-admin-not-for-production \
    npm run build

FROM node:22-bookworm-slim AS production-dependencies

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV DEPLOYMENT_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/next.config.ts ./next.config.ts

USER node

EXPOSE 3000

CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0"]
