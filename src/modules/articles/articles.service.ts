import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In, Not } from 'typeorm';
import { Article, ArticleStatus, EvidenceItem } from './entities/article.entity';
import { ArticleRevision, RevisionReason } from './entities/article-revision.entity';
import { SlugRedirect } from './entities/slug-redirect.entity';
import { CreateArticleDto, UpdateArticleDto, ArticleQueryDto, BulkActionDto } from './dto/create-article.dto';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../users/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { sanitizeArticleHtml, validateContentJson, estimateReadTime } from '../../common/content/content-sanitizer';
import { SAFE_URL } from '../../common/content/content-policy';

export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 191);

/** Campos copiados para a revisão (além de título e conteúdo) */
const META_FIELDS = [
  'subtitle', 'slug', 'excerpt', 'coverUrl', 'status', 'scheduledAt', 'tags', 'categories', 'featured',
  'seoTitle', 'seoDescription', 'seoFocusKeyword', 'seoKeywords', 'canonicalUrl', 'ogTitle', 'ogDescription', 'ogImageUrl',
  'twitterCard', 'robotsIndex', 'classificationLevel', 'caseNumber', 'caseStatus', 'locationName', 'latitude', 'longitude',
  'phenomenonType', 'entityName', 'eventDate', 'dossierSummary', 'isFiction', 'censoredSegments', 'timeline', 'attachments',
  'connections', 'inspirations', 'purchaseUrl',
] as const;

/** Campos que nunca vão para a resposta pública */
const PRIVATE_FIELDS = ['author', 'authorProfile', 'contentJson', 'previousStatus', 'lastEditedById', 'version', 'trashedAt', 'deletedAt'];

/** Agrupa autosaves do mesmo usuário numa única revisão por este período */
const AUTOSAVE_COALESCE_MS = 10 * 60 * 1000;

const isAdmin = (u: JwtPayload) => (u.roles ?? []).includes(UserRole.ADMIN);

@Injectable()
export class ArticlesService {
  private readonly logger = new Logger(ArticlesService.name);

  constructor(
    @InjectRepository(Article) private readonly articlesRepo: Repository<Article>,
    @InjectRepository(ArticleRevision) private readonly revisionsRepo: Repository<ArticleRevision>,
    @InjectRepository(SlugRedirect) private readonly redirectsRepo: Repository<SlugRedirect>,
    private readonly audit: AuditService,
  ) {}

  // ══ Leitura pública ═══════════════════════════════════════════════
  async findPublished(query: ArticleQueryDto) {
    const page = Math.max(1, parseInt(query.page ?? '1'));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '12')));
    const skip = (page - 1) * limit;

    const qb = this.articlesRepo
      .createQueryBuilder('a')
      .leftJoinAndMapOne('a.authorProfile', 'user_profiles', 'p', 'p.user_id = a.author_id')
      .where('a.status = :status', { status: ArticleStatus.PUBLISHED })
      .andWhere('a.deleted_at IS NULL')
      .orderBy('a.featured', 'DESC')
      .addOrderBy('a.publishedAt', 'DESC');

    if (query.tag) qb.andWhere('JSON_CONTAINS(a.tags_json, :tag)', { tag: JSON.stringify(query.tag) });
    if (query.category) qb.andWhere('JSON_CONTAINS(a.categories_json, :cat)', { cat: JSON.stringify(query.category) });
    if (query.q) qb.andWhere('(a.title LIKE :q OR a.excerpt LIKE :q OR a.subtitle LIKE :q)', { q: `%${query.q}%` });

    const [rows, total] = await qb.skip(skip).take(limit).getManyAndCount();
    return { items: rows.map((a) => this.toPublic(a)), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Remove dados privados (e-mail do autor, controle interno) das respostas públicas. */
  private toPublic(a: Article) {
    const profile = (a as { authorProfile?: { displayName?: string; avatarUrl?: string | null } }).authorProfile;
    const out: Record<string, unknown> = { ...a };
    for (const f of PRIVATE_FIELDS) delete out[f];
    return { ...out, authorName: profile?.displayName ?? 'The Road So Far', authorAvatarUrl: profile?.avatarUrl ?? null };
  }

  /** Artigo publicado por slug. Se o slug mudou, devolve { redirectTo } com o slug atual. */
  async findBySlug(slug: string) {
    const article = await this.articlesRepo
      .createQueryBuilder('a')
      .leftJoinAndMapOne('a.authorProfile', 'user_profiles', 'p', 'p.user_id = a.author_id')
      .where('a.slug = :slug', { slug })
      .andWhere('a.status = :status', { status: ArticleStatus.PUBLISHED })
      .andWhere('a.deleted_at IS NULL')
      .getOne();

    if (!article) {
      const redirect = await this.redirectsRepo.findOne({ where: { oldSlug: slug } });
      if (redirect) {
        const target = await this.articlesRepo.findOne({
          where: { id: redirect.articleId, status: ArticleStatus.PUBLISHED, deletedAt: IsNull() },
          select: ['id', 'slug'],
        });
        if (target) return { redirectTo: target.slug };
      }
      throw new NotFoundException('Artigo não encontrado');
    }
    void this.registerView(article.id);
    return this.toPublic(article);
  }

  private async registerView(id: number) {
    try {
      await this.articlesRepo.increment({ id }, 'viewCount', 1);
      await this.articlesRepo.query(
        'INSERT INTO article_daily_views (article_id, day, views) VALUES (?, CURRENT_DATE(), 1) ON DUPLICATE KEY UPDATE views = views + 1',
        [id],
      );
    } catch (e) {
      this.logger.warn(`Falha ao registrar visualização: ${(e as Error).message}`);
    }
  }

  /** Casos para o Arquivo de Casos/Mapa: artigos publicados com dados de dossiê */
  async findMapCases() {
    const rows = await this.articlesRepo
      .createQueryBuilder('a')
      .select(['a.id', 'a.slug', 'a.title', 'a.subtitle', 'a.excerpt', 'a.coverUrl', 'a.locationName', 'a.latitude', 'a.longitude',
        'a.phenomenonType', 'a.classificationLevel', 'a.categories', 'a.dossierSummary', 'a.evidences', 'a.timeline', 'a.isFiction'])
      .where('a.status = :status', { status: ArticleStatus.PUBLISHED })
      .andWhere('a.deleted_at IS NULL')
      // Livros (dicas de leitura/análises de livros) não são casos do mapa
      .andWhere(`NOT JSON_CONTAINS(COALESCE(a.categories_json, '[]'), '"Livros"')`)
      .andWhere(`(a.location_name IS NOT NULL OR a.case_number IS NOT NULL OR a.dossier_summary IS NOT NULL
                  OR (a.evidences_json IS NOT NULL AND a.evidences_json NOT IN ('', '[]')))`)
      .orderBy('a.publishedAt', 'DESC')
      .getMany();
    return rows.map((a) => ({
      articleId: Number(a.id), slug: a.slug, title: a.title, subtitle: a.subtitle ?? a.excerpt,
      locationName: a.locationName ?? '', latitude: a.latitude ?? undefined, longitude: a.longitude ?? undefined,
      phenomenonType: a.phenomenonType ?? undefined, classificationLevel: a.classificationLevel,
      category: a.categories?.[0] ?? 'Contos', coverImageUrl: a.coverUrl, dossierSummary: a.dossierSummary,
      evidenceCount: a.evidences?.length ?? 0, timelineCount: a.timeline?.length ?? 0, isFiction: a.isFiction,
    }));
  }

  async incrementShare(id: number): Promise<void> {
    await this.articlesRepo.increment({ id }, 'shareCount', 1);
  }

  // ══ Admin: leitura ════════════════════════════════════════════════
  async findAllAdmin(query: ArticleQueryDto) {
    const page = Math.max(1, parseInt(query.page ?? '1'));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20')));
    const skip = (page - 1) * limit;
    const sortMap: Record<string, string> = {
      createdAt: 'a.createdAt', updatedAt: 'a.updatedAt', publishedAt: 'a.publishedAt', title: 'a.title', viewCount: 'a.viewCount',
    };
    const sort = sortMap[query.sort ?? 'updatedAt'] ?? 'a.updatedAt';
    const order = (query.order ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const qb = this.articlesRepo
      .createQueryBuilder('a')
      .leftJoinAndMapOne('a.authorProfile', 'user_profiles', 'p', 'p.user_id = a.author_id')
      .leftJoinAndMapOne('a.editorProfile', 'user_profiles', 'ep', 'ep.user_id = a.last_edited_by_id')
      .where('a.deleted_at IS NULL')
      .orderBy(sort, order);

    // Lixeira só aparece quando pedida explicitamente
    if (query.status) qb.andWhere('a.status = :status', { status: query.status });
    else qb.andWhere('a.status != :trash', { trash: ArticleStatus.TRASH });
    if (query.q) qb.andWhere('(a.title LIKE :q OR a.slug LIKE :q)', { q: `%${query.q}%` });
    if (query.category) qb.andWhere('JSON_CONTAINS(a.categories_json, :cat)', { cat: JSON.stringify(query.category) });
    if (query.tag) qb.andWhere('JSON_CONTAINS(a.tags_json, :tag)', { tag: JSON.stringify(query.tag) });
    if (query.authorId) qb.andWhere('a.author_id = :aid', { aid: Number(query.authorId) });
    if (query.featured) qb.andWhere('a.featured = :f', { f: query.featured === 'true' });
    if (query.hasCase === 'true') {
      qb.andWhere(`(a.location_name IS NOT NULL OR a.case_number IS NOT NULL OR a.dossier_summary IS NOT NULL
                    OR (a.evidences_json IS NOT NULL AND a.evidences_json NOT IN ('', '[]')))`);
    }

    const [rows, total] = await qb.skip(skip).take(limit).getManyAndCount();
    const items = rows.map((a) => {
      const { contentHtml: _c, ...rest } = a as Article & { authorProfile?: { displayName: string }; editorProfile?: { displayName: string } };
      return {
        ...rest,
        authorName: (a as { authorProfile?: { displayName: string } }).authorProfile?.displayName ?? null,
        lastEditedByName: (a as { editorProfile?: { displayName: string } }).editorProfile?.displayName ?? null,
        evidenceCount: a.evidences?.length ?? 0,
      };
    });
    const counts = await this.statusCounts();
    return { items, total, page, limit, totalPages: Math.ceil(total / limit), counts };
  }

  async statusCounts(): Promise<Record<string, number>> {
    const rows: { status: string; n: string }[] = await this.articlesRepo.query(
      'SELECT status, COUNT(*) n FROM articles WHERE deleted_at IS NULL GROUP BY status',
    );
    const out: Record<string, number> = { all: 0 };
    for (const r of rows) {
      out[r.status] = Number(r.n);
      if (r.status !== ArticleStatus.TRASH) out.all += Number(r.n);
    }
    return out;
  }

  /** Artigo completo para o editor (inclui contentJson e quem editou por último) */
  async findOneAdmin(id: number) {
    const article = await this.articlesRepo
      .createQueryBuilder('a')
      .addSelect(['a.contentJson', 'a.previousStatus'])
      .leftJoinAndMapOne('a.authorProfile', 'user_profiles', 'p', 'p.user_id = a.author_id')
      .leftJoinAndMapOne('a.editorProfile', 'user_profiles', 'ep', 'ep.user_id = a.last_edited_by_id')
      .where('a.id = :id', { id })
      .andWhere('a.deleted_at IS NULL')
      .getOne();
    if (!article) throw new NotFoundException('Artigo não encontrado');
    const extra = article as Article & { authorProfile?: { displayName: string }; editorProfile?: { displayName: string } };
    const { authorProfile: _a, editorProfile: _e, ...rest } = extra;
    return { ...rest, authorName: extra.authorProfile?.displayName ?? null, lastEditedByName: extra.editorProfile?.displayName ?? null };
  }

  private async loadEntity(id: number, withJson = false): Promise<Article> {
    const qb = this.articlesRepo.createQueryBuilder('a').where('a.id = :id', { id }).andWhere('a.deleted_at IS NULL');
    if (withJson) qb.addSelect(['a.contentJson', 'a.previousStatus']);
    const a = await qb.getOne();
    if (!a) throw new NotFoundException('Artigo não encontrado');
    return a;
  }

  // ══ Admin: escrita ════════════════════════════════════════════════
  async create(dto: CreateArticleDto, user: JwtPayload) {
    const article = this.articlesRepo.create({
      authorId: user.sub,
      lastEditedById: user.sub,
      version: 1,
      tags: [], categories: [], seoKeywords: [], censoredSegments: [], timeline: [], attachments: [], connections: [],
      inspirations: [], evidences: [],
    });
    this.applyDto(article, dto, true);
    article.slug = await this.ensureUniqueSlug(slugify(dto.slug || dto.title || 'sem-titulo') || 'sem-titulo');
    this.applyStatusRules(article, dto, null);

    const saved = await this.articlesRepo.save(article);
    await this.addRevision(saved, dto.saveReason === 'autosave' ? 'autosave' : 'manual', user, true);
    this.audit.log({ userId: user.sub, action: 'article.create', resourceType: 'article', resourceId: saved.id, metadata: { status: saved.status } });
    return this.findOneAdmin(saved.id);
  }

  async update(id: number, dto: UpdateArticleDto, user: JwtPayload) {
    const article = await this.loadEntity(id, true);
    if (!isAdmin(user) && Number(article.authorId) !== Number(user.sub)) {
      throw new ForbiddenException('Sem permissão para editar este artigo');
    }
    if (article.status === ArticleStatus.TRASH && dto.status !== undefined && dto.status !== ArticleStatus.TRASH) {
      throw new BadRequestException('Restaure o artigo da lixeira antes de editá-lo');
    }

    // Proteção contra edição concorrente
    if (dto.expectedVersion !== undefined && dto.expectedVersion !== article.version) {
      const editor = article.lastEditedById ? await this.displayName(article.lastEditedById) : null;
      throw new ConflictException({
        message: `Este artigo foi alterado${editor ? ` por ${editor}` : ''} depois que você o abriu.`,
        currentVersion: article.version,
        lastEditedByName: editor,
        updatedAt: article.updatedAt,
      });
    }

    const oldSlug = article.slug;
    const previousStatus = article.status;
    this.applyDto(article, dto, false);

    if (dto.slug !== undefined) {
      const wanted = slugify(dto.slug) || oldSlug;
      if (wanted !== oldSlug) article.slug = await this.ensureUniqueSlug(wanted, article.id);
    }
    this.applyStatusRules(article, dto, previousStatus);

    article.version = article.version + 1;
    article.lastEditedById = user.sub;
    const saved = await this.articlesRepo.save(article);

    // Slug alterado num artigo já publicado: o endereço antigo continua funcionando
    if (saved.slug !== oldSlug && article.publishedAt) {
      await this.redirectsRepo.upsert({ oldSlug, articleId: saved.id }, ['oldSlug']);
      await this.redirectsRepo.delete({ oldSlug: saved.slug }); // o novo slug não pode redirecionar para si mesmo
    }

    const reason: RevisionReason =
      dto.saveReason ?? (saved.status === ArticleStatus.PUBLISHED && previousStatus !== ArticleStatus.PUBLISHED ? 'publish' : 'manual');
    await this.addRevision(saved, reason, user);

    if (previousStatus !== saved.status) {
      this.audit.log({ userId: user.sub, action: `article.status.${saved.status.toLowerCase()}`, resourceType: 'article', resourceId: saved.id, metadata: { from: previousStatus } });
    } else if (reason !== 'autosave') {
      this.audit.log({ userId: user.sub, action: 'article.update', resourceType: 'article', resourceId: saved.id });
    }
    return this.findOneAdmin(saved.id);
  }

  /** Copia os campos do DTO para a entidade, sanitizando conteúdo e listas */
  private applyDto(a: Article, dto: CreateArticleDto | UpdateArticleDto, isCreate: boolean) {
    const set = <K extends keyof Article>(key: K, value: Article[K] | undefined) => {
      if (value !== undefined) a[key] = value;
    };
    const str = (v: string | null | undefined) => (v === undefined ? undefined : v === null || v.trim() === '' ? null : v.trim());
    const list = (v: string[] | undefined) => (v === undefined ? undefined : [...new Set(v.map((s) => s.trim()).filter(Boolean))]);
    const url = (v: string | null | undefined) => {
      const s = str(v);
      if (s === undefined || s === null) return s;
      if (!SAFE_URL.test(s)) throw new BadRequestException(`URL inválida: ${s}`);
      return s;
    };

    if (dto.title !== undefined) a.title = dto.title.trim() || 'Sem título';
    if (dto.contentHtml !== undefined || isCreate) {
      const html = sanitizeArticleHtml(dto.contentHtml ?? '');
      a.contentHtml = html;
      a.readTimeMinutes = estimateReadTime(html);
    }
    if (dto.contentJson !== undefined) a.contentJson = validateContentJson(dto.contentJson);

    set('subtitle', str(dto.subtitle));
    set('excerpt', str(dto.excerpt));
    set('coverUrl', url(dto.coverUrl));
    set('tags', list(dto.tags));
    set('categories', list(dto.categories));
    set('featured', dto.featured);
    set('seoTitle', str(dto.seoTitle));
    set('seoDescription', str(dto.seoDescription));
    set('seoFocusKeyword', str(dto.seoFocusKeyword));
    set('seoKeywords', list(dto.seoKeywords));
    set('canonicalUrl', str(dto.canonicalUrl));
    set('ogTitle', str(dto.ogTitle));
    set('ogDescription', str(dto.ogDescription));
    set('ogImageUrl', url(dto.ogImageUrl));
    set('twitterCard', str(dto.twitterCard));
    set('robotsIndex', dto.robotsIndex);
    set('classificationLevel', dto.classificationLevel);
    set('caseNumber', str(dto.caseNumber));
    set('caseStatus', str(dto.caseStatus));
    set('locationName', str(dto.locationName));
    set('latitude', dto.latitude);
    set('longitude', dto.longitude);
    set('phenomenonType', str(dto.phenomenonType));
    set('entityName', str(dto.entityName));
    set('eventDate', str(dto.eventDate));
    set('dossierSummary', str(dto.dossierSummary));
    set('isFiction', dto.isFiction);
    set('censoredSegments', list(dto.censoredSegments));
    set('inspirations', list(dto.inspirations));
    set('purchaseUrl', str(dto.purchaseUrl));
    if (dto.timeline !== undefined) {
      a.timeline = dto.timeline.map((t) => ({ period: t.period.trim(), title: t.title.trim(), description: t.description.trim(), ...(t.mediaUrl ? { mediaUrl: url(t.mediaUrl) as string } : {}) }));
    }
    if (dto.attachments !== undefined) {
      a.attachments = dto.attachments.map((t) => ({ label: t.label.trim(), url: url(t.url) as string, ...(t.kind ? { kind: t.kind } : {}) }));
    }
    if (dto.connections !== undefined) {
      a.connections = dto.connections.map((c) => ({
        title: c.title.trim(), ...(c.articleId ? { articleId: c.articleId } : {}), ...(c.slug ? { slug: slugify(c.slug) } : {}),
        ...(c.relation ? { relation: c.relation } : {}), ...(c.reason ? { reason: c.reason } : {}),
      }));
    }
    // Observação: "evidences" (quadro de investigação) NÃO é alterado aqui — só pela rota do quadro.
  }

  private applyStatusRules(a: Article, dto: CreateArticleDto | UpdateArticleDto, previous: ArticleStatus | null) {
    if (dto.status !== undefined) {
      if (dto.status === ArticleStatus.TRASH) throw new BadRequestException('Use a ação "trash" para mover à lixeira');
      a.status = dto.status;
    } else if (previous === null) {
      a.status = ArticleStatus.DRAFT;
    }
    if (dto.scheduledAt !== undefined) a.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;

    if (a.status === ArticleStatus.SCHEDULED) {
      if (!a.scheduledAt) throw new BadRequestException('Informe a data de agendamento');
      if (a.scheduledAt.getTime() <= Date.now()) throw new BadRequestException('A data de agendamento deve estar no futuro');
    }
    if (a.status === ArticleStatus.PUBLISHED && !a.publishedAt) a.publishedAt = new Date();
    if (a.status === ArticleStatus.PUBLISHED) a.scheduledAt = null;
  }

  // ══ Revisões ══════════════════════════════════════════════════════
  private snapshotMeta(a: Article): Record<string, unknown> {
    const meta: Record<string, unknown> = {};
    for (const f of META_FIELDS) meta[f] = (a as unknown as Record<string, unknown>)[f] ?? null;
    return meta;
  }

  private async addRevision(a: Article, reason: RevisionReason, user: JwtPayload, isNew = false) {
    if (reason === 'autosave' && !isNew) {
      // Idade calculada no próprio banco (não depende de fuso horário)
      const [info]: { id: string; reason: string; createdById: string | null; age: string }[] = await this.revisionsRepo.query(
        'SELECT id, reason, created_by_id createdById, TIMESTAMPDIFF(SECOND, created_at, NOW(6)) age FROM article_revisions WHERE article_id = ? ORDER BY id DESC LIMIT 1',
        [a.id],
      );
      const last = info && info.reason === 'autosave' && Number(info.createdById) === Number(user.sub) && Number(info.age) * 1000 < AUTOSAVE_COALESCE_MS
        ? await this.revisionsRepo.findOne({ where: { id: Number(info.id) } })
        : null;
      if (last) {
        last.version = a.version;
        last.title = a.title;
        last.contentHtml = a.contentHtml;
        last.contentJson = a.contentJson ?? null;
        last.meta = this.snapshotMeta(a);
        await this.revisionsRepo.save(last);
        return last;
      }
    }
    return this.revisionsRepo.save(this.revisionsRepo.create({
      articleId: a.id, version: a.version, reason, title: a.title, contentHtml: a.contentHtml,
      contentJson: a.contentJson ?? null, meta: this.snapshotMeta(a), createdById: user.sub,
    }));
  }

  /** Grava o estado atual como revisão (ex.: antes da IA substituir o conteúdo) */
  async snapshot(id: number, reason: RevisionReason, user: JwtPayload) {
    const a = await this.loadEntity(id, true);
    const rev = await this.addRevision(a, reason, user, true);
    return { id: rev.id, version: rev.version, reason: rev.reason, createdAt: rev.createdAt };
  }

  async listRevisions(id: number) {
    await this.loadEntity(id);
    const rows: { id: string; version: number; reason: string; title: string; createdAt: Date; updatedAt: Date; createdById: string | null; createdByName: string | null; size: number }[] =
      await this.revisionsRepo.query(
        `SELECT r.id, r.version, r.reason, r.title, r.created_at createdAt, r.updated_at updatedAt, r.created_by_id createdById,
                p.display_name createdByName, LENGTH(r.content_html) size
           FROM article_revisions r LEFT JOIN user_profiles p ON p.user_id = r.created_by_id
          WHERE r.article_id = ? ORDER BY r.id DESC LIMIT 100`,
        [id],
      );
    return rows.map((r) => ({ ...r, id: Number(r.id), size: Number(r.size) }));
  }

  async getRevision(articleId: number, revId: number) {
    const rev = await this.revisionsRepo.findOne({ where: { id: revId, articleId } });
    if (!rev) throw new NotFoundException('Revisão não encontrada');
    return rev;
  }

  async restoreRevision(articleId: number, revId: number, user: JwtPayload) {
    const rev = await this.getRevision(articleId, revId);
    const a = await this.loadEntity(articleId, true);
    // Guarda o estado atual antes de restaurar (a restauração também pode ser desfeita)
    await this.addRevision(a, 'manual', user, true);

    a.title = rev.title;
    a.contentHtml = sanitizeArticleHtml(rev.contentHtml);
    a.contentJson = rev.contentJson ? validateContentJson(rev.contentJson) : null;
    a.readTimeMinutes = estimateReadTime(a.contentHtml);
    const meta = rev.meta ?? {};
    for (const f of META_FIELDS) {
      if (f === 'slug' || f === 'status' || f === 'scheduledAt') continue; // não muda URL nem publicação
      if (f in meta) (a as unknown as Record<string, unknown>)[f] = meta[f];
    }
    a.version += 1;
    a.lastEditedById = user.sub;
    const saved = await this.articlesRepo.save(a);
    await this.addRevision(saved, 'restore', user, true);
    this.audit.log({ userId: user.sub, action: 'article.revision.restore', resourceType: 'article', resourceId: articleId, metadata: { revisionId: revId } });
    return this.findOneAdmin(articleId);
  }

  // ══ Ações editoriais ══════════════════════════════════════════════
  async duplicate(id: number, user: JwtPayload) {
    const src = await this.loadEntity(id, true);
    const { id: _id, slug: _s, createdAt: _c, updatedAt: _u, publishedAt: _p, ...fields } = src;
    const copy = this.articlesRepo.create({
      ...fields,
      title: `${src.title} (cópia)`.slice(0, 200),
      slug: await this.ensureUniqueSlug(`${src.slug}-copia`),
      status: ArticleStatus.DRAFT, publishedAt: null, scheduledAt: null, previousStatus: null, trashedAt: null,
      viewCount: 0, likeCount: 0, shareCount: 0, commentCount: 0, featured: false,
      authorId: user.sub, lastEditedById: user.sub, version: 1,
    });
    const saved = await this.articlesRepo.save(copy);
    await this.addRevision(saved, 'manual', user, true);
    this.audit.log({ userId: user.sub, action: 'article.duplicate', resourceType: 'article', resourceId: saved.id, metadata: { from: id } });
    return this.findOneAdmin(saved.id);
  }

  async bulk(dto: BulkActionDto, user: JwtPayload) {
    const destructive = ['trash', 'delete', 'restore'].includes(dto.action);
    if (destructive && !isAdmin(user)) throw new ForbiddenException('Apenas administradores');
    const items = await this.articlesRepo.find({ where: { id: In(dto.ids), deletedAt: IsNull() }, select: ['id', 'status', 'previousStatus', 'publishedAt', 'authorId', 'version', 'scheduledAt'] });
    const done: number[] = [];
    const skipped: { id: number; reason: string }[] = [];

    for (const a of items) {
      if (!isAdmin(user) && Number(a.authorId) !== Number(user.sub)) { skipped.push({ id: Number(a.id), reason: 'sem permissão' }); continue; }
      const patch: Partial<Article> = {};
      switch (dto.action) {
        case 'publish': patch.status = ArticleStatus.PUBLISHED; patch.publishedAt = a.publishedAt ?? new Date(); patch.scheduledAt = null; break;
        case 'draft': patch.status = ArticleStatus.DRAFT; break;
        case 'review': patch.status = ArticleStatus.REVIEW; break;
        case 'archive': patch.status = ArticleStatus.ARCHIVED; break;
        case 'trash':
          if (a.status === ArticleStatus.TRASH) { skipped.push({ id: Number(a.id), reason: 'já está na lixeira' }); continue; }
          patch.previousStatus = a.status; patch.status = ArticleStatus.TRASH; patch.trashedAt = new Date(); patch.featured = false; break;
        case 'restore':
          if (a.status !== ArticleStatus.TRASH) { skipped.push({ id: Number(a.id), reason: 'não está na lixeira' }); continue; }
          // Volta como rascunho se estava publicado (evita republicar sem querer)
          patch.status = (a.previousStatus && a.previousStatus !== ArticleStatus.PUBLISHED ? a.previousStatus : ArticleStatus.DRAFT) as ArticleStatus;
          patch.previousStatus = null; patch.trashedAt = null; break;
        case 'delete':
          if (a.status !== ArticleStatus.TRASH) { skipped.push({ id: Number(a.id), reason: 'mova para a lixeira antes de excluir' }); continue; }
          patch.deletedAt = new Date(); break;
      }
      patch.version = a.version + 1;
      patch.lastEditedById = user.sub;
      await this.articlesRepo.update({ id: a.id }, patch as Parameters<typeof this.articlesRepo.update>[1]);
      done.push(Number(a.id));
      this.audit.log({ userId: user.sub, action: `article.bulk.${dto.action}`, resourceType: 'article', resourceId: a.id });
    }
    for (const id of dto.ids) if (!items.some((a) => Number(a.id) === id)) skipped.push({ id, reason: 'não encontrado' });
    return { done, skipped };
  }

  /** Exclusão definitiva (soft delete) — mantida para compatibilidade com o admin antigo */
  async remove(id: number, user: JwtPayload): Promise<void> {
    if (!isAdmin(user)) throw new ForbiddenException('Apenas administradores podem excluir artigos');
    const a = await this.loadEntity(id);
    a.deletedAt = new Date();
    await this.articlesRepo.save(a);
    this.audit.log({ userId: user.sub, action: 'article.delete', resourceType: 'article', resourceId: id });
  }

  // ══ Quadro de investigação ════════════════════════════════════════
  /** Salva SOMENTE as evidências do quadro (o texto do artigo nunca é tocado aqui) */
  async saveBoard(id: number, evidences: Record<string, unknown>[], user: JwtPayload) {
    const a = await this.loadEntity(id);
    const clean: EvidenceItem[] = evidences.filter((raw) => raw && typeof raw === 'object' && !Array.isArray(raw)).map((raw, i) => {
      const s = (k: string, max: number) => (typeof raw[k] === 'string' ? (raw[k] as string).slice(0, max) : undefined);
      const n = (k: string, min: number, max: number) => (typeof raw[k] === 'number' && isFinite(raw[k] as number) ? Math.min(max, Math.max(min, raw[k] as number)) : undefined);
      const u = (k: string) => { const v = s(k, 500); return v && SAFE_URL.test(v) ? v : undefined; };
      const item: EvidenceItem = {
        id: s('id', 64) || `ev-${Date.now()}-${i}`,
        label: s('label', 200) || 'Evidência',
        description: s('description', 4000) || '',
        type: s('type', 30), paperStyle: s('paperStyle', 30), date: s('date', 60), corruptedMessage: s('corruptedMessage', 300),
        sourceUrl: u('sourceUrl'), referenceUrl: u('referenceUrl'), imageUrl: u('imageUrl'), audioUrl: u('audioUrl'),
        videoUrl: u('videoUrl'), youtubeUrl: u('youtubeUrl'),
        x: n('x', 0, 100), y: n('y', 0, 100), rotation: n('rotation', -45, 45),
        audioOnly: typeof raw.audioOnly === 'boolean' ? raw.audioOnly : undefined,
        linkedEvidenceIds: Array.isArray(raw.linkedEvidenceIds) ? (raw.linkedEvidenceIds as unknown[]).filter((v): v is string => typeof v === 'string').slice(0, 40) : [],
      };
      for (const k of Object.keys(item) as (keyof EvidenceItem)[]) if (item[k] === undefined) delete item[k];
      return item;
    });
    await this.articlesRepo.update({ id: a.id }, { evidences: clean, lastEditedById: user.sub });
    this.audit.log({ userId: user.sub, action: 'article.board.save', resourceType: 'article', resourceId: id, metadata: { evidences: clean.length } });
    const updated = await this.loadEntity(id);
    return { id: updated.id, evidences: updated.evidences, version: updated.version };
  }

  // ══ Agendador ═════════════════════════════════════════════════════
  async publishScheduled(): Promise<number> {
    const now = new Date();
    const result = await this.articlesRepo
      .createQueryBuilder()
      .update(Article)
      .set({ status: ArticleStatus.PUBLISHED, publishedAt: now })
      .where('status = :status', { status: ArticleStatus.SCHEDULED })
      .andWhere('scheduled_at <= :now', { now })
      .andWhere('deleted_at IS NULL')
      .execute();
    return result.affected ?? 0;
  }

  // ══ Utilitários ═══════════════════════════════════════════════════
  private async displayName(userId: number): Promise<string | null> {
    const rows: { display_name: string }[] = await this.articlesRepo.query('SELECT display_name FROM user_profiles WHERE user_id = ?', [userId]);
    return rows[0]?.display_name ?? null;
  }

  private async ensureUniqueSlug(base: string, selfId?: number): Promise<string> {
    let candidate = base.slice(0, 180);
    for (let attempt = 1; ; attempt++) {
      const exists = await this.articlesRepo.findOne({ where: { slug: candidate, ...(selfId ? { id: Not(selfId) } : {}) }, select: ['id'] });
      const redirected = await this.redirectsRepo.findOne({ where: { oldSlug: candidate } });
      if (!exists && (!redirected || (selfId !== undefined && Number(redirected.articleId) === Number(selfId)))) return candidate;
      candidate = `${base.slice(0, 180)}-${attempt}`;
    }
  }
}
