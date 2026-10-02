FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
COPY scripts/prisma-postinstall.cjs ./scripts/prisma-postinstall.cjs
RUN PRISMA_SKIP_POSTINSTALL_GENERATE=1 npm ci
COPY . .
RUN DATABASE_URL=postgresql://atlas_build:atlas_build@127.0.0.1:5432/atlas_build npm run prisma:generate && npm run build
RUN npm prune --omit=dev --ignore-scripts

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
EXPOSE 8080
CMD ["node", "dist/main.js"]
