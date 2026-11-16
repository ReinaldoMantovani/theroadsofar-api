# =============================================================================
#  NestJS Backend — Multi-stage Dockerfile
# =============================================================================

# ── Estágio base ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init python3 make g++
COPY package*.json ./
# Sem --ignore-scripts: bcrypt e sharp precisam compilar/baixar binários Linux
RUN npm ci

# ── Estágio de desenvolvimento ────────────────────────────────────────────────
FROM base AS development
COPY . .
EXPOSE 3001
CMD ["dumb-init", "node_modules/.bin/nest", "start", "--watch"]

# ── Estágio de build ──────────────────────────────────────────────────────────
FROM base AS builder
COPY . .
RUN npm run build
# Remove devDependencies para imagem menor
RUN npm prune --omit=dev

# ── Estágio de produção ───────────────────────────────────────────────────────
FROM node:20-alpine AS production

# Usuário não-root por segurança
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copia apenas o necessário do estágio de build
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./

# Diretório de uploads com permissões corretas
RUN mkdir -p /app/uploads && chown nestjs:nodejs /app/uploads

USER nestjs

EXPOSE 3001

# dumb-init para tratamento correto de sinais do processo
CMD ["dumb-init", "node", "dist/main"]
