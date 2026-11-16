/**
 * Roda antes de "npm run build" (script prebuild).
 *
 * Hospedagens como a Hostinger instalam as dependências com NODE_ENV=production,
 * o que pula as devDependencies — e o compilador do NestJS (@nestjs/cli, typescript, @types/*)
 * está lá. Resultado: "sh: nest: command not found". Se faltar, instala aqui e segue o build.
 */
const { execSync } = require('child_process');

const needed = ['@nestjs/cli/package.json', 'typescript/package.json', '@types/node/package.json'];
const missing = needed.filter((m) => { try { require.resolve(m, { paths: [process.cwd()] }); return false; } catch { return true; } });

if (missing.length === 0) process.exit(0);

console.log(`[prebuild] Ferramentas de compilação ausentes (${missing.map((m) => m.split('/package.json')[0]).join(', ')}).`);
console.log('[prebuild] Instalando devDependencies para compilar…');
execSync('npm install --include=dev --no-audit --no-fund', {
  stdio: 'inherit',
  // NODE_ENV=production faria o npm pular as devDependencies de novo
  env: { ...process.env, NODE_ENV: 'development', npm_config_production: 'false' },
});
