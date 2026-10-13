
FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY examples ./examples

EXPOSE 3000

CMD ["npm", "start"]
