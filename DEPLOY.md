# Deploy da API na Hostinger

A API fica no subdomínio **`api.theroadsofar.com.br`** e roda como aplicação Node.js (porta 3001).
O blog (`theroadsofar-web`) é publicado separadamente no domínio principal.

## Pré-requisitos

- Plano com **Node.js** (Business/Cloud ou VPS) e acesso **SSH**
- **MySQL 8** criado no hPanel (banco e usuário ficam com prefixo, ex.: `u123456789_theroadsofar`)
- Subdomínio `api` criado e **SSL** emitido (Let's Encrypt, com Force HTTPS)

## 1. Primeira publicação

Envie esta pasta para o servidor (git ou SFTP), **sem** `node_modules`, `dist`, `uploads` e `.env`:

```bash
ssh usuario@seudominio.com.br
cd ~/domains/api.theroadsofar.com.br
git clone https://github.com/SEU-USUARIO/theroadsofar-api.git app     # ou envie a pasta por SFTP para ~/domains/api.theroadsofar.com.br/app
cd app

cp .env.production.example .env
nano .env          # banco, JWT_SECRET, JWT_REFRESH_SECRET, UPLOAD_DIR, PUBLIC_UPLOAD_URL, CORS_ORIGINS

mkdir -p ~/uploads && chmod 750 ~/uploads      # UPLOAD_DIR=/home/SEU-USUARIO/uploads

npm ci             # instala tudo (o build precisa das devDependencies)
npm run build      # gera dist/
npm run migration:run
npm run migration:show     # todas devem aparecer com [X]

npm install -g pm2
pm2 start dist/main.js --name trsf-api
pm2 save
pm2 startup        # siga a instrução impressa para iniciar junto com o servidor
```

Gere os segredos com `openssl rand -base64 48` (um para cada JWT).

### Proxy do subdomínio

No hPanel, aponte `api.theroadsofar.com.br` para `http://localhost:3001` (proxy reverso), ou crie
`~/domains/api.theroadsofar.com.br/public_html/.htaccess`:

```apache
RewriteEngine On
RewriteRule ^(.*)$ http://127.0.0.1:3001/$1 [P,L]
```

Os arquivos enviados são servidos pela própria API em `/uploads` — não é preciso configurar nada a mais.

### Alternativa: app Node.js do hPanel

Em **Sites › Node.js** (quando disponível no seu plano): pasta da aplicação = esta pasta,
comando de build `npm ci && npm run build`, arquivo de entrada `dist/main.js`, e as variáveis do `.env`
cadastradas no painel. Depois rode `npm run migration:run` pelo SSH.

## 2. Atualizações

```bash
cd ~/domains/api.theroadsofar.com.br/app
mysqldump -u u123456789_trsf -p u123456789_theroadsofar > ~/backup-$(date +%F).sql   # backup antes
git pull                 # ou reenvie os arquivos por SFTP
npm ci
npm run build
npm run migration:run    # aplica só as migrações novas
pm2 restart trsf-api
```

## 3. Conferir

```bash
curl https://api.theroadsofar.com.br/api/v1/articles      # lista JSON
pm2 logs trsf-api --lines 100                              # erros
```

No `.env`, o `CORS_ORIGINS` precisa ter os domínios do blog **e** `http://localhost:3002` (estúdio no seu PC):

```
CORS_ORIGINS=https://theroadsofar.com.br,https://www.theroadsofar.com.br,http://localhost:3002
```

## 4. Desfazer

```bash
npm run migration:revert                                         # desfaz a última migração
mysql -u u123456789_trsf -p u123456789_theroadsofar < ~/backup-AAAA-MM-DD.sql   # volta o backup
```

## DBeaver no banco de produção

- **Hospedagem compartilhada/Cloud:** hPanel › Bancos de dados › **MySQL remoto** › libere seu IP; no DBeaver use o host mostrado lá, porta **3306**.
- **VPS:** não exponha a 3306; use a aba **SSH** do DBeaver (túnel) e host `127.0.0.1`, porta `3306`.

## Checklist

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` e `JWT_REFRESH_SECRET` diferentes, 48+ caracteres
- [ ] `UPLOAD_DIR` fora de `public_html`; `PUBLIC_UPLOAD_URL=https://api.theroadsofar.com.br/uploads`
- [ ] `CORS_ORIGINS` só com os domínios do blog + `http://localhost:3002`
- [ ] Migrações aplicadas antes de iniciar
- [ ] PM2 com `pm2 save` e `pm2 startup`
- [ ] SSL ativo e forçado
