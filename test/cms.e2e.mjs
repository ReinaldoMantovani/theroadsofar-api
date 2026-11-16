/**
 * Teste de ponta a ponta das rotas do CMS.
 * Requer a API rodando e o banco migrado (com o admin padrão).
 *
 *   node test/cms.e2e.mjs                         (usa http://localhost:3001/api/v1)
 *   API=http://localhost:3001/api/v1 ADMIN_PASSWORD=... node test/cms.e2e.mjs
 *
 * Cria dados de teste com o prefixo "[e2e]" e os move para a lixeira/exclui ao final.
 */
const API = process.env.API || 'http://localhost:3001/api/v1';
const ORIGIN = new URL(API).origin;
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@theroadsofar.com.br', password: process.env.ADMIN_PASSWORD || 'Admin@2025!' };

let passed = 0, failed = 0;
const results = [];
function check(name, cond, extra) {
  if (cond) { passed++; results.push(`  ✓ ${name}`); }
  else { failed++; results.push(`  ✗ ${name}${extra !== undefined ? ` — ${typeof extra === 'string' ? extra : JSON.stringify(extra).slice(0, 300)}` : ''}`); }
}

async function call(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

const login = async (email, password) => (await call('POST', '/auth/login', { body: { email, password } })).data?.accessToken;
const doc = (...blocks) => ({ schema: 'trsf-blocks', version: 1, doc: { type: 'doc', content: blocks } });
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

// PNG 1x1 válido (e uma variação com outro conteúdo)
const PNG_A = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PNG_B = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const fileForm = (buf, name, type, fields = {}) => {
  const f = new FormData();
  f.append('file', new Blob([buf], { type }), name);
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};

async function main() {
  const admin = await login(ADMIN.email, ADMIN.password);
  check('login do admin', !!admin);
  if (!admin) return finish();

  // Leitor comum para testar permissões
  const readerEmail = `e2e-${Date.now()}@teste.com`;
  await call('POST', '/auth/register', { body: { email: readerEmail, password: 'Leitor#2026x', displayName: 'Leitor E2E', consentTerms: true, consentPrivacy: true } });
  const reader = await login(readerEmail, 'Leitor#2026x');
  check('cadastro + login de leitor', !!reader);

  // ── Criação com blocos e dossiê ─────────────────────────────────────
  const created = await call('POST', '/articles', { token: admin, body: {
    title: '[e2e] Caso da Estrada Velha',
    subtitle: 'Um dossiê de teste',
    contentHtml: '<p>Texto <script>alert(1)</script>seguro</p><iframe src="https://www.youtube-nocookie.com/embed/abc"></iframe><iframe src="https://evil.com/x"></iframe><figure class="trsf-figure" style="width: 50%; color: red"><img src="https://exemplo.com/a.jpg" onerror="x()"></figure><a href="javascript:alert(1)">x</a>',
    contentJson: doc({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Seção' }] }, para('Primeiro parágrafo')),
    categories: ['Relatos Reais'], tags: ['estrada', 'e2e'],
    locationName: 'Penápolis, SP', caseNumber: 'TRSF-0042', dossierSummary: 'Resumo do caso',
    timeline: [{ period: '1987', title: 'Primeiro avistamento', description: 'Luzes na estrada' }],
    censoredSegments: ['nome da testemunha'], classificationLevel: 'confidencial',
    seoTitle: 'Caso da Estrada Velha', seoDescription: 'Dossiê de teste', seoFocusKeyword: 'estrada velha',
  } });
  check('cria artigo com blocos e dossiê', created.status === 201, created.data);
  const art = created.data;
  const id = art?.id;
  check('versão inicial = 1', art?.version === 1, art?.version);
  check('script removido do HTML', !/script|alert/.test(art?.contentHtml || ''), art?.contentHtml);
  check('iframe do YouTube mantido', /youtube-nocookie\.com\/embed\/abc/.test(art?.contentHtml || ''));
  check('iframe de outro domínio removido', !/evil\.com/.test(art?.contentHtml || ''));
  check('estilo width permitido, color removido', /width:\s*50%/.test(art?.contentHtml || '') && !/color/.test(art?.contentHtml || ''), art?.contentHtml);
  check('onerror e javascript: removidos', !/onerror|javascript:/.test(art?.contentHtml || ''));
  check('contentJson salvo', art?.contentJson?.doc?.content?.length === 2);
  check('timeline salva', art?.timeline?.[0]?.title === 'Primeiro avistamento');

  const bad = await call('POST', '/articles', { token: admin, body: { title: '[e2e] ruim', contentHtml: '<p>x</p>', contentJson: doc({ type: 'scriptBlock' }) } });
  check('bloco desconhecido rejeitado (400)', bad.status === 400, bad.data);
  const badUrl = await call('POST', '/articles', { token: admin, body: { title: '[e2e] ruim', contentHtml: '<p>x</p>', coverUrl: 'javascript:alert(1)' } });
  check('URL de capa insegura rejeitada (400)', badUrl.status === 400);

  // ── Edição concorrente ──────────────────────────────────────────────
  const upd = await call('PUT', `/articles/${id}`, { token: admin, body: { title: '[e2e] Caso da Estrada Velha (rev)', contentHtml: '<p>Versão 2</p>', expectedVersion: 1 } });
  check('atualiza com expectedVersion correto', upd.status === 200 && upd.data?.version === 2, upd.data);
  const conflict = await call('PUT', `/articles/${id}`, { token: admin, body: { contentHtml: '<p>Desatualizado</p>', expectedVersion: 1 } });
  check('conflito de versão responde 409 com detalhes', conflict.status === 409 && conflict.data?.details?.currentVersion === 2, conflict.data);

  // ── Autosave agrupado ───────────────────────────────────────────────
  const revBefore = (await call('GET', `/articles/admin/${id}/revisions`, { token: admin })).data.length;
  await call('PUT', `/articles/${id}`, { token: admin, body: { contentHtml: '<p>Autosave 1</p>', saveReason: 'autosave', expectedVersion: 2 } });
  await call('PUT', `/articles/${id}`, { token: admin, body: { contentHtml: '<p>Autosave 2</p>', saveReason: 'autosave', expectedVersion: 3 } });
  const revs = (await call('GET', `/articles/admin/${id}/revisions`, { token: admin })).data;
  check('dois autosaves seguidos geram uma revisão só', revs.length === revBefore + 1, { revBefore, after: revs.length });

  // ── Quadro de evidências preservado ─────────────────────────────────
  const board = await call('PUT', `/articles/admin/${id}/board`, { token: admin, body: { evidences: [
    { id: 'ev1', label: 'Foto da estrada', description: 'Polaroid', type: 'imagem', x: 30, y: 40, linkedEvidenceIds: ['ev2'] },
    { id: 'ev2', label: 'Gravação', description: 'Áudio', type: 'audio', x: 70, y: 60, sourceUrl: 'javascript:alert(1)' },
  ] } });
  check('salva quadro de evidências', board.status === 200 && board.data?.evidences?.length === 2, board.data);
  check('URL insegura removida da evidência', board.data?.evidences?.[1]?.sourceUrl === undefined);
  const afterText = await call('PUT', `/articles/${id}`, { token: admin, body: { contentHtml: '<p>Texto novo</p>', evidences: [] } });
  check('salvar o texto NÃO apaga evidências (campo é ignorado)', afterText.status === 400 || afterText.data?.evidences?.length === 2, afterText.data);
  const afterText2 = await call('PUT', `/articles/${id}`, { token: admin, body: { contentHtml: '<p>Texto novo</p>' } });
  check('evidências continuam após salvar texto', afterText2.data?.evidences?.length === 2);

  // ── Publicação e blog público ───────────────────────────────────────
  const pub = await call('PUT', `/articles/${id}`, { token: admin, body: { status: 'PUBLISHED' } });
  check('publica', pub.data?.status === 'PUBLISHED' && !!pub.data?.publishedAt);
  const slug = pub.data.slug;
  const pubGet = await call('GET', `/articles/${slug}`);
  check('blog recebe o artigo publicado', pubGet.status === 200 && pubGet.data?.title?.includes('Estrada Velha'));
  check('resposta pública traz o dossiê', pubGet.data?.caseNumber === 'TRSF-0042' && pubGet.data?.evidences?.length === 2);
  check('resposta pública sem e-mail nem contentJson', !JSON.stringify(pubGet.data).includes('@') && pubGet.data?.contentJson === undefined && pubGet.data?.version === undefined);
  const cases = await call('GET', '/articles/map/cases');
  check('caso aparece no Arquivo de Casos', cases.data?.some?.((c) => c.slug === slug && c.evidenceCount === 2));

  // ── Mudança de slug com redirecionamento ────────────────────────────
  const slugChange = await call('PUT', `/articles/${id}`, { token: admin, body: { slug: `${slug}-novo` } });
  check('altera o slug', slugChange.data?.slug === `${slug}-novo`, slugChange.data?.slug);
  const old = await call('GET', `/articles/${slug}`);
  check('slug antigo redireciona para o novo', old.data?.redirectTo === `${slug}-novo`, old.data);

  const back = await call('PUT', `/articles/${id}`, { token: admin, body: { slug } });
  check('voltar ao slug antigo é permitido (sem sufixo -1)', back.data?.slug === slug, back.data?.slug);
  const fwd = await call('GET', `/articles/${slug}-novo`);
  check('e o slug intermediário passa a redirecionar', fwd.data?.redirectTo === slug, fwd.data);

  // ── Revisões ────────────────────────────────────────────────────────
  const revList = (await call('GET', `/articles/admin/${id}/revisions`, { token: admin })).data;
  const first = revList[revList.length - 1];
  const restored = await call('POST', `/articles/admin/${id}/revisions/${first.id}/restore`, { token: admin });
  check('restaura a primeira revisão', restored.status === 201 && /Primeiro parágrafo|seguro/.test(restored.data?.contentHtml || ''), restored.data?.contentHtml);
  check('restauração mantém o slug e as evidências', restored.data?.slug === slug && restored.data?.evidences?.length === 2);
  const snap = await call('POST', `/articles/admin/${id}/revisions`, { token: admin, body: { reason: 'ai_before' } });
  check('snapshot "antes da IA"', snap.status === 201 && snap.data?.reason === 'ai_before');

  // ── Duplicar, lote, lixeira ─────────────────────────────────────────
  const dup = await call('POST', `/articles/admin/${id}/duplicate`, { token: admin });
  check('duplica como rascunho', dup.status === 201 && dup.data?.status === 'DRAFT' && Number(dup.data?.id) !== Number(id));
  const del1 = await call('POST', '/articles/admin/bulk', { token: admin, body: { ids: [dup.data.id], action: 'delete' } });
  check('excluir exige estar na lixeira', del1.data?.skipped?.[0]?.reason?.includes('lixeira'));
  const trash = await call('POST', '/articles/admin/bulk', { token: admin, body: { ids: [id, dup.data.id], action: 'trash' } });
  check('move para a lixeira em lote', trash.data?.done?.length === 2);
  check('artigo na lixeira some do blog', (await call('GET', `/articles/${slug}-novo`)).status === 404);
  const listTrash = await call('GET', '/articles/admin/all?status=TRASH', { token: admin });
  check('lista da lixeira', listTrash.data?.items?.some?.((a) => Number(a.id) === Number(id)));
  const restoreBulk = await call('POST', '/articles/admin/bulk', { token: admin, body: { ids: [id], action: 'restore' } });
  const afterRestore = await call('GET', `/articles/admin/${id}`, { token: admin });
  check('restaurar volta como rascunho (não republica sozinho)', restoreBulk.data?.done?.length === 1 && afterRestore.data?.status === 'DRAFT', afterRestore.data?.status);
  const del2 = await call('POST', '/articles/admin/bulk', { token: admin, body: { ids: [dup.data.id], action: 'delete' } });
  check('exclui definitivamente da lixeira', del2.data?.done?.length === 1);

  // ── Permissões ──────────────────────────────────────────────────────
  for (const [m, p, label] of [
    ['GET', '/admin/metrics', 'métricas'], ['GET', '/articles/admin/all', 'lista admin'], ['PUT', `/articles/admin/${id}/board`, 'quadro'],
    ['GET', '/users/admin/list', 'usuários'], ['GET', '/comments/admin', 'moderação'], ['GET', '/reports/admin', 'relatos'], ['POST', '/ai/generations', 'histórico IA'],
  ]) {
    const r = await call(m, p, { token: reader, body: m === 'GET' ? undefined : { evidences: [] } });
    check(`leitor bloqueado em ${label} (403)`, r.status === 403, r.status);
  }
  check('sem token bloqueado (401)', (await call('GET', '/admin/metrics')).status === 401);
  const readerUpload = await call('POST', '/media/upload', { token: reader, form: fileForm(PNG_A, 'a.png', 'image/png') });
  check('leitor não pode enviar mídia (403)', readerUpload.status === 403);

  // ── Mídia ───────────────────────────────────────────────────────────
  const up1 = await call('POST', '/media/upload', { token: admin, form: fileForm(PNG_A, 'estrada.png', 'image/png', { altText: 'Estrada à noite', caption: 'Foto de arquivo', aiGenerated: 'true', aiModel: 'teste' }) });
  check('upload de imagem vira WebP com metadados', up1.status === 201 && up1.data?.mimeType === 'image/webp' && up1.data?.altText === 'Estrada à noite' && up1.data?.aiGenerated === true, up1.data);
  const up2 = await call('POST', '/media/upload', { token: admin, form: fileForm(PNG_A, 'copia.png', 'image/png') });
  check('mesmo arquivo não é duplicado', up2.data?.duplicate === true && up2.data?.id === up1.data?.id);
  const exe = await call('POST', '/media/upload', { token: admin, form: fileForm(Buffer.from('MZ\x90\x00 executavel falso ....'), 'foto.png', 'image/png') });
  check('arquivo falso com extensão .png rejeitado', exe.status === 400);
  const pdf = await call('POST', '/media/upload', { token: admin, form: fileForm(Buffer.from('%PDF-1.4\n% e2e\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'), 'laudo.pdf', 'application/pdf') });
  check('upload de PDF', pdf.status === 201 && pdf.data?.kind === 'document');
  const staticFile = await fetch(up1.data.url.startsWith('http') ? up1.data.url : `${ORIGIN}${up1.data.url}`);
  check('arquivo servido em /uploads', staticFile.status === 200 && staticFile.headers.get('content-type') === 'image/webp', staticFile.status);
  const meta = await call('PUT', `/media/${up1.data.id}`, { token: admin, body: { caption: 'Legenda editada', credit: 'Arquivo TRSF' } });
  check('edita metadados', meta.data?.caption === 'Legenda editada' && meta.data?.credit === 'Arquivo TRSF');
  await call('PUT', `/articles/${id}`, { token: admin, body: { coverUrl: up1.data.url } });
  const usage = await call('GET', `/media/${up1.data.id}/usage`, { token: admin });
  check('detecta uso da imagem (capa)', usage.data?.some?.((u) => Number(u.id) === Number(id) && u.fields.includes('capa')), usage.data);
  const delUsed = await call('DELETE', `/media/${up1.data.id}`, { token: admin });
  check('excluir mídia em uso pede confirmação (409)', delUsed.status === 409 && delUsed.data?.details?.usage?.length >= 1);
  const replaced = await call('PUT', `/media/${up1.data.id}/file`, { token: admin, form: fileForm(PNG_B, 'nova.png', 'image/png') });
  check('substitui arquivo mantendo o endereço', replaced.status === 200 && replaced.data?.url === up1.data.url);
  const filtered = await call('GET', '/media?kind=document', { token: admin });
  check('filtra biblioteca por tipo', filtered.data?.items?.every?.((m) => m.kind === 'document') && filtered.data.items.length >= 1);
  check('remove mídia com confirmação', (await call('DELETE', `/media/${up1.data.id}?force=true`, { token: admin })).status === 204);
  await call('DELETE', `/media/${pdf.data.id}?force=true`, { token: admin });

  // ── Comentários e moderação ─────────────────────────────────────────
  await call('PUT', `/articles/${id}`, { token: admin, body: { status: 'PUBLISHED' } });
  const cmt = await call('POST', `/comments/article/${id}`, { token: reader, body: { content: 'Eu passei por essa estrada.' } });
  check('leitor comenta (aprovado)', cmt.status === 201 && cmt.data?.status === 'APPROVED');

  // ── Favoritos, curtidas e foto de perfil ─────────────────────────────
  check('favoritar exige login', (await call('POST', `/articles/${id}/like`)).status === 401);
  const fav = await call('POST', `/articles/${id}/like`, { token: reader });
  check('leitor favorita o artigo', fav.data?.liked === true && fav.data?.likeCount >= 1, fav.data);
  const favs = await call('GET', '/users/me/likes', { token: reader });
  check('favorito aparece em /users/me/likes', favs.data?.articleIds?.map(Number).includes(Number(id)));
  const unfav = await call('POST', `/articles/${id}/like`, { token: reader });
  check('clicar de novo desfavorita', unfav.data?.liked === false && unfav.data?.likeCount === fav.data.likeCount - 1);
  const cl = await call('POST', `/comments/${cmt.data.id}/like`, { token: reader });
  check('curte comentário', cl.data?.liked === true && cl.data?.likeCount === 1);
  const pubComments = await call('GET', `/comments/article/${id}`);
  check('lista pública mostra o total de curtidas', pubComments.data?.items?.some?.((c) => Number(c.id) === Number(cmt.data.id) && c.likeCount === 1));
  const mineC = await call('GET', `/comments/article/${id}/my-likes`, { token: reader });
  check('sabe quais comentários o leitor curtiu', mineC.data?.commentIds?.map(Number).includes(Number(cmt.data.id)));
  check('descurte comentário', (await call('POST', `/comments/${cmt.data.id}/like`, { token: reader })).data?.likeCount === 0);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const avForm = new FormData(); avForm.append('file', new Blob([png], { type: 'image/png' }), 'eu.png');
  const av = await call('POST', '/users/me/avatar', { token: reader, form: avForm });
  check('envia foto de perfil (vira WebP em /avatars)', av.status === 201 && /\/avatars\/u\d+-\d+\.webp$/.test(av.data?.avatarUrl || ''), av.data);
  const avFile = await fetch(av.data.avatarUrl.startsWith('http') ? av.data.avatarUrl : `${API.replace(/\/api\/v1$/, '')}${av.data.avatarUrl}`);
  check('foto de perfil acessível', avFile.status === 200);
  const badForm = new FormData(); badForm.append('file', new Blob([Buffer.from('<script>alert(1)</script>')], { type: 'image/png' }), 'x.png');
  check('recusa arquivo que não é imagem (mesmo com nome .png)', (await call('POST', '/users/me/avatar', { token: reader, form: badForm })).status === 400);
  const withAv = await call('GET', `/comments/article/${id}`);
  check('comentário traz a foto do autor', withAv.data?.items?.some?.((c) => Number(c.id) === Number(cmt.data.id) && c.authorAvatarUrl === av.data.avatarUrl));
  check('remove foto de perfil', (await call('DELETE', '/users/me/avatar', { token: reader })).data?.avatarUrl === null);
  const before = (await call('GET', `/articles/admin/${id}`, { token: admin })).data.commentCount;
  const mod = await call('GET', '/comments/admin?status=APPROVED', { token: admin });
  check('lista de moderação com título do artigo', mod.data?.items?.some?.((c) => c.articleTitle?.includes('Estrada Velha')));
  await call('PUT', `/comments/${cmt.data.id}/status`, { token: admin, body: { status: 'REJECTED' } });
  const after = (await call('GET', `/articles/admin/${id}`, { token: admin })).data.commentCount;
  check('rejeitar diminui o contador', after === before - 1, { before, after });

  // ── Relatos de leitores ─────────────────────────────────────────────
  const rep = await call('POST', '/reports', { token: reader, body: { title: '[e2e] Vulto na cozinha', narrative: 'Todas as noites às 3h algo se move na cozinha de casa.', locationName: 'Bauru' } });
  check('leitor envia relato', rep.status === 201 && rep.data?.status === 'PENDING', rep.data);
  const reps = await call('GET', '/reports/admin?status=PENDING', { token: admin });
  check('admin vê o relato', reps.data?.items?.some?.((r) => Number(r.id) === Number(rep.data.id) && r.reporterName === 'Leitor E2E'));
  const repMod = await call('PUT', `/reports/admin/${rep.data.id}`, { token: admin, body: { status: 'APPROVED', adminNotes: 'virar pauta' } });
  check('modera relato', repMod.data?.status === 'APPROVED');

  // ── Histórico de IA ─────────────────────────────────────────────────
  const job = `e2e-${Date.now()}`;
  const gen = await call('POST', '/ai/generations', { token: admin, body: { jobId: job, kind: 'article', status: 'done', provider: 'openrouter', model: 'teste/modelo:free', articleId: id, tokensIn: 100, tokensOut: 900, durationMs: 1234, attempts: [{ provider: 'groq', model: 'x', ok: false, status: 429, error: 'rate limit' }, { provider: 'openrouter', model: 'teste/modelo:free', ok: true }] } });
  check('registra geração de IA', gen.status === 201);
  const stats = await call('GET', '/ai/generations/stats?days=30', { token: admin });
  check('consumo por modelo', stats.data?.some?.((s) => s.model === 'teste/modelo:free' && s.tokensOut >= 900));

  // ── Dashboard e taxonomia ───────────────────────────────────────────
  const m = await call('GET', '/admin/metrics?days=30', { token: admin });
  check('métricas do dashboard', m.status === 200 && m.data?.series?.length === 30 && typeof m.data?.articles?.published === 'number' && m.data?.cases >= 1, m.data);
  check('gráfico de visualizações com dados reais', m.data?.series?.some?.((d) => d.views > 0));
  const tax = await call('GET', '/admin/taxonomy', { token: admin });
  check('lista categorias e tags', tax.data?.tags?.some?.((t) => t.name === 'e2e'));
  const ren = await call('POST', '/admin/taxonomy/rename', { token: admin, body: { type: 'tag', from: 'e2e', to: 'e2e-renomeada' } });
  check('renomeia tag em todos os artigos', ren.data?.affected >= 1);
  await call('POST', '/admin/taxonomy/delete', { token: admin, body: { type: 'tag', name: 'e2e-renomeada' } });

  // ── Usuários ────────────────────────────────────────────────────────
  const users = await call('GET', '/users/admin/list?q=e2e-', { token: admin });
  check('lista usuários sem dados sensíveis', users.data?.items?.length >= 1 && !JSON.stringify(users.data).includes('password'));
  const me = await call('GET', '/users/me', { token: admin });
  const selfDemote = await call('PUT', `/users/admin/${me.data.id}`, { token: admin, body: { roles: ['READER'] } });
  check('admin não remove o próprio acesso (403)', selfDemote.status === 403);
  const readerId = users.data.items[0].id;
  const deact = await call('PUT', `/users/admin/${readerId}`, { token: admin, body: { isActive: false } });
  check('desativa usuário', deact.status === 200);
  check('usuário desativado perde acesso', (await call('GET', '/users/me', { token: reader })).status === 401);

  // Limpeza
  await call('POST', '/articles/admin/bulk', { token: admin, body: { ids: [id], action: 'trash' } });
  await call('POST', '/articles/admin/bulk', { token: admin, body: { ids: [id], action: 'delete' } });
  finish();
}

function finish() {
  console.log(results.join('\n'));
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
