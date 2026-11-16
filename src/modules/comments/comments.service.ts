import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { createHash } from 'crypto';
import sanitizeHtml from 'sanitize-html';
import { Comment, CommentStatus } from './entities/comment.entity';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../users/entities/user.entity';
import { InjectRepository as IR } from '@nestjs/typeorm';
import { Article } from '../articles/entities/article.entity';

export class CreateCommentDto {
  articleId: number;
  content: string;
  guestName?: string;
}

@Injectable()
export class CommentsService {
  // Rate limit: 10 comentários/min por userId ou IP
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(
    @InjectRepository(Comment)
    private readonly commentsRepo: Repository<Comment>,
    @InjectRepository(Article)
    private readonly articlesRepo: Repository<Article>,
  ) {}

  async findByArticle(articleId: number, page = 1, limit = 20) {
    const [rows, total] = await this.commentsRepo.findAndCount({
      where: { articleId, status: CommentStatus.APPROVED, deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    // Resposta pública: só nome e avatar do autor (nunca e-mail)
    const authorIds = [...new Set(rows.map((c) => c.authorId).filter(Boolean))] as number[];
    const profiles = authorIds.length
      ? await this.commentsRepo.manager.query(
          'SELECT user_id AS userId, display_name AS displayName, avatar_url AS avatarUrl FROM user_profiles WHERE user_id IN (?)',
          [authorIds],
        )
      : [];
    const byId = new Map<string, { displayName: string; avatarUrl: string | null }>(
      profiles.map((p: { userId: number; displayName: string; avatarUrl: string | null }) => [String(p.userId), p]),
    );
    const items = rows.map((c) => {
      const p = c.authorId ? byId.get(String(c.authorId)) : undefined;
      return {
        id: c.id,
        articleId: c.articleId,
        authorId: c.authorId,
        authorName: p?.displayName ?? c.guestName ?? 'Visitante',
        authorAvatarUrl: p?.avatarUrl ?? null,
        content: c.content,
        likeCount: c.likeCount ?? 0,
        createdAt: c.createdAt,
      };
    });
    return { items, total };
  }

  async create(dto: CreateCommentDto, user: JwtPayload | null, ip: string): Promise<Comment> {
    const key = user ? `u-${user.sub}` : `ip-${ip}`;
    this.checkRateLimit(key);

    const sanitized = sanitizeHtml(dto.content, { allowedTags: ['b', 'i', 'em', 'strong', 'p', 'br'] });
    if (sanitized.length < 3 || sanitized.length > 2000) {
      throw new ForbiddenException('Comentário inválido (3-2000 chars)');
    }

    const ipHash = createHash('sha256').update(ip).digest('hex');

    const comment = this.commentsRepo.create({
      articleId: dto.articleId,
      authorId: user?.sub ?? null,
      guestName: user ? null : (dto.guestName ?? 'Visitante'),
      content: sanitized,
      status: user ? CommentStatus.APPROVED : CommentStatus.PENDING,
      ipHash,
    });

    const saved = await this.commentsRepo.save(comment);
    if (user) {
      await this.articlesRepo.increment({ id: dto.articleId }, 'commentCount', 1);
    }
    return saved;
  }

  async approve(id: number): Promise<Comment> {
    return this.setStatus(id, CommentStatus.APPROVED);
  }

  /** Moderação: mantém comment_count do artigo coerente com os aprovados */
  async setStatus(id: number, status: CommentStatus): Promise<Comment> {
    const comment = await this.commentsRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!comment) throw new NotFoundException('Comentário não encontrado');
    if (comment.status === status) return comment;
    if (status === CommentStatus.APPROVED) await this.articlesRepo.increment({ id: comment.articleId }, 'commentCount', 1);
    if (comment.status === CommentStatus.APPROVED) await this.decrementCount(comment.articleId);
    comment.status = status;
    return this.commentsRepo.save(comment);
  }

  private async decrementCount(articleId: number) {
    await this.articlesRepo.query('UPDATE articles SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = ?', [articleId]);
  }

  /** Lista para moderação, com título do artigo e nome do autor */
  async findForModeration(status: string | undefined, page = 1, limit = 30) {
    const where: string[] = ['c.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) { where.push('c.status = ?'); params.push(status); }
    const offset = (Math.max(1, page) - 1) * limit;
    const items = await this.commentsRepo.query(
      `SELECT c.id, c.article_id articleId, a.title articleTitle, a.slug articleSlug, c.content, c.status, c.created_at createdAt,
              COALESCE(p.display_name, c.guest_name, 'Visitante') authorName, c.author_id authorId
         FROM comments c JOIN articles a ON a.id = c.article_id
         LEFT JOIN user_profiles p ON p.user_id = c.author_id
        WHERE ${where.join(' AND ')} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const [{ n }] = await this.commentsRepo.query(`SELECT COUNT(*) n FROM comments c WHERE ${where.join(' AND ')}`, params);
    const counts = await this.commentsRepo.query("SELECT status, COUNT(*) n FROM comments WHERE deleted_at IS NULL GROUP BY status");
    return {
      items: items.map((r: Record<string, unknown>) => ({ ...r, id: Number(r.id), articleId: Number(r.articleId) })),
      total: Number(n), page, limit,
      counts: Object.fromEntries(counts.map((r: { status: string; n: string }) => [r.status, Number(r.n)])),
    };
  }

  async delete(id: number, userId: number, isAdmin: boolean): Promise<void> {
    const comment = await this.commentsRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!comment) throw new NotFoundException('Comentário não encontrado');
    if (!isAdmin && Number(comment.authorId) !== Number(userId)) {
      throw new ForbiddenException('Você só pode remover seus próprios comentários');
    }
    if (comment.status === CommentStatus.APPROVED) await this.decrementCount(comment.articleId);
    comment.deletedAt = new Date();
    await this.commentsRepo.save(comment);
  }

  async remove(id: number): Promise<void> {
    const comment = await this.commentsRepo.findOneOrFail({ where: { id } });
    comment.deletedAt = new Date();
    await this.commentsRepo.save(comment);
  }

  private checkRateLimit(key: string): void {
    const bucket = this.buckets.get(key);
    if (!bucket || Date.now() > bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: Date.now() + 60_000 });
      return;
    }
    if (bucket.count >= 10) throw new ForbiddenException('Limite de comentários atingido');
    bucket.count++;
  }
}
