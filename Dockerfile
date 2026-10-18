
FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma/schema.prisma ./prisma/schema.prisma

# Placeholder used only for client generation.
# It is not a real database connection or credential.
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    npx prisma generate

COPY tsconfig.json ./
COPY src ./src
COPY examples ./examples

EXPOSE 3000

CMD ["npm", "start"]
