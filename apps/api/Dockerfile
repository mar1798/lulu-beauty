# syntax=docker/dockerfile:1

FROM node:22.23.1-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/website/package.json apps/website/package.json
COPY packages/widgets/package.json packages/widgets/package.json
RUN npm ci

FROM node:22.23.1-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build -w api

FROM node:22.23.1-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S nodegrp && adduser -S nodeusr -G nodegrp
COPY --from=build --chown=nodeusr:nodegrp /app/node_modules ./node_modules
COPY --from=build --chown=nodeusr:nodegrp /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=nodeusr:nodegrp /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=nodeusr:nodegrp /app/apps/api/package.json ./apps/api/package.json
USER nodeusr
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
