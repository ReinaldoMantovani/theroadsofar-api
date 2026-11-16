# Checklist de Segurança — The Road So Far

## Backend (NestJS)

### Autenticação e Autorização
- [x] JWT com access token de curta duração (15 minutos)
- [x] Refresh token armazenado como hash SHA-256 (nunca o token raw)
- [x] BCrypt com 12 rounds para senhas
- [x] Verificação de role ADMIN obrigatória em todas as rotas admin
- [x] Guard global JWT com decorador `@Public()` apenas onde necessário
- [x] Rate limiting no login: 5 tentativas / 5 minutos por IP (em memória)
- [x] Rate limiting global via ThrottlerModule
- [x] Logout invalida o refresh token no banco

### Headers HTTP (Helmet.js)
- [x] `X-Frame-Options: DENY`
- [x] `X-Content-Type-Options: nosniff`
- [x] `X-XSS-Protection: 1; mode=block`
- [x] `Strict-Transport-Security` (HSTS)
- [x] `Content-Security-Policy` configurado por ambiente
- [x] `Cross-Origin-Resource-Policy: cross-origin` para uploads

### Validação e Sanitização
- [x] ValidationPipe global com `whitelist: true, forbidNonWhitelisted: true`
- [x] Sanitização HTML com allowlist explícita (sanitize-html)
- [x] Validação de magic bytes em uploads (não apenas Content-Type)
- [x] Limite de tamanho de arquivo no upload (10 MB)
- [x] Apenas formatos de imagem permitidos (JPEG, PNG, WebP, GIF)
- [x] Imagens convertidas para WebP via sharp (remove metadados EXIF)
- [x] Slugify normaliza NFD e remove caracteres especiais

### Banco de Dados
- [x] TypeORM com `synchronize: false` em produção
- [x] Migrations versionadas
- [x] Soft delete (`deleted_at`) — sem deleção permanente de dados
- [x] Charset UTF-8mb4 para suporte completo a Unicode
- [x] Credenciais apenas via variáveis de ambiente

### CORS
- [x] Origens restritas via `CORS_ORIGINS` em produção
- [x] Wildcard apenas em desenvolvimento

### Logs e Auditoria
- [x] IP anonimizado nos logs de auditoria (último octeto IPv4 → `.xxx`)
- [x] Logs assíncronos via `setImmediate` (não bloqueiam a requisição)
- [x] Global exception filter captura e loga erros não tratados
- [x] Interceptor de logging por requisição

---

## Frontend Público (Next.js)

- [x] Zero código admin no bundle público
- [x] Headers de segurança via `next.config.ts`
- [x] CSP configurado
- [x] Imagens de domínios externos restritas via `remotePatterns`
- [x] ISR com revalidação periódica (60s home, 300s artigo)
- [x] Nenhuma chave secreta em variáveis `NEXT_PUBLIC_*`

---

## Painel Admin (theroadsofar-admin)

- [x] Roda apenas localmente (Windows)
- [x] HTTPS obrigatório para API_URL — bloqueia HTTP (exceto localhost)
- [x] Nenhuma conexão direta ao banco de dados
- [x] Tokens armazenados apenas em memória (Zustand) + localStorage
- [x] Auto-refresh de token — redireciona para login se expirado
- [x] Verificação de role ADMIN antes de permitir acesso
- [x] Ollama roda localmente — nenhum dado enviado a serviços externos
- [x] Conteúdo IA mostra aviso de revisão antes de publicar

---

## Produção

### Antes de fazer deploy
- [ ] `JWT_SECRET` ≥ 48 caracteres aleatórios
- [ ] `JWT_REFRESH_SECRET` diferente e ≥ 48 caracteres
- [ ] `DB_PASSWORD` forte e única
- [ ] `NODE_ENV=production`
- [ ] `CORS_ORIGINS` lista apenas domínios reais
- [ ] SSL/HTTPS ativo e forçado (Let's Encrypt)
- [ ] `.env` não commitado no repositório (checar `.gitignore`)
- [ ] Swagger desabilitado (`NODE_ENV=production` já faz isso)
- [ ] Diretório de uploads fora do `public_html`
- [ ] PM2 configurado para reiniciar com o servidor
- [ ] Backup do banco antes de cada migration

### Monitoramento recomendado
- [ ] Alertas de erro via UptimeRobot ou similar
- [ ] Logs centralizados (PM2 + logrotate)
- [ ] Revisar logs de auditoria periodicamente
