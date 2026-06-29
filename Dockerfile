# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS client-build
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

FROM node:20-alpine AS server-build
WORKDIR /app/serwer

COPY serwer/package*.json ./
RUN npm ci --omit=dev

COPY serwer/ ./

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY client/package*.json ./client/
RUN cd client && npm ci --omit=dev

COPY --from=server-build /app/serwer ./serwer
COPY --from=client-build /app/client/dist ./client/dist

EXPOSE 3000

CMD ["node", "serwer/src/server.js"]
