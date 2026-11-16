# The Road So Far — API (backend)

API REST do blog **The Road So Far** em **NestJS 10 + TypeORM + MySQL 8**.
Atende o blog público (`theroadsofar-web`) e o estúdio editorial que roda no seu PC (`theroadsofar-admin`).

- Produção: `https://api.theroadsofar.com.br/api/v1`
- Deploy na Hostinger: [DEPLOY.md](./DEPLOY.md)
- Segurança e LGPD: [SECURITY.md](./SECURITY.md) · [LGPD.md](./LGPD.md)

```
theroadsofar-api/
├── src/
│   ├── modules/      auth, users, articles, media, comments, engagement, reports, ai, admin, scheduler, audit
│   ├── common/       guards, filtros, política de conteúdo (sanitização), transformers
│   ├── config/       typeorm.config.ts, validação de ambiente
│   └── migrations/   estrutura do banco (rodam em ordem)
├── test/cms.e2e.mjs  testes de ponta a ponta contra a API real
├── docker/mysql/     init.sql do MySQL local
├── docker-compose.yml  MySQL local (porta 3302) + API opcional
└── Dockerfile
```

## Rodar localmente

```powershell
docker compose up -d db          # MySQL em 127.0.0.1:3302
copy .env.example .env           # já vem apontando para o MySQL local (se ainda não tiver o .env)
npm install
npm run migration:run:dev        # cria/atualiza as tabelas
npm run start:dev                # http://localhost:3001/api/v1  ·  Swagger: http://localhost:3001/api/docs
```

Admin padrão criado pelas migrações: `admin@theroadsofar.com.br` / `Admin@2025!` (troque no primeiro acesso).

### DBeaver (banco local)

| Campo | Valor |
|---|---|
| Host | `127.0.0.1` |
| Porta | `3302` |
| Banco | `theroadsofar` |
| Usuário / senha | `trsf_user` / `trsf9180` (ou `root` / `trsf9180`) |

Driver properties: `allowPublicKeyRetrieval=true` e `useSSL=false`.

> Este projeto usa o mesmo nome de projeto Docker da versão antiga (`theroadsofar`), então o
> banco local que você já tinha continua sendo usado.

## Scripts

| Script | O que faz |
|---|---|
| `npm run start:dev` | desenvolvimento com recarga automática |
| `npm run build` | compila para `dist/` |
| `npm run start:prod` | inicia a versão compilada (`node dist/main`) |
| `npm run migration:run:dev` / `migration:revert:dev` / `migration:show:dev` | migrações no ambiente local (TypeScript) |
| `npm run migration:run` / `migration:revert` / `migration:show` | migrações em produção (a partir do `dist/`) |
| `node test/cms.e2e.mjs` | testes de ponta a ponta (API rodando em `localhost:3001`) |

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `NODE_ENV` | `development` ou `production` |
| `PORT` | porta da API (padrão 3001) |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD` | MySQL (`DB_USER` também é aceito) |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | segredos diferentes, 48+ caracteres |
| `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | padrão `15m` e `7d` |
| `UPLOAD_DIR` | pasta dos uploads (em produção, fora de `public_html`) |
| `PUBLIC_UPLOAD_URL` | endereço público dos uploads, ex.: `https://api.theroadsofar.com.br/uploads` |
| `UPLOAD_MAX_SIZE_MB`, `UPLOAD_MAX_VIDEO_MB`, `UPLOAD_MAX_AUDIO_MB`, `UPLOAD_MAX_DOC_MB` | limites por tipo |
| `CORS_ORIGINS` | domínios do blog + `http://localhost:3002` (estúdio) |

Modelos: `.env.example` (local) e `.env.production.example` (Hostinger).

## Endpoints principais (`/api/v1`)

| Público | Com login | Admin |
|---|---|---|
| `GET /articles`, `GET /articles/:slug`, `GET /articles/map/cases` | `POST /articles/:id/like`, `GET /users/me/likes` | `GET /articles/admin/all`, `POST/PUT /articles`, revisões, ações em massa |
| `GET /comments/article/:id` | `POST /comments/article/:id`, `POST /comments/:id/like` | `PUT /articles/admin/:id/board` (quadro de evidências) |
| `POST /auth/register`, `POST /auth/login` | `GET/PUT /users/me`, `POST/DELETE /users/me/avatar` | mídia, comentários, relatos, usuários, métricas, histórico de IA |
| `POST /reports` (relato de leitor) | | |
