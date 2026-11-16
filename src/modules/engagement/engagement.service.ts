import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Favoritos de artigos e curtidas em comentários.
 * Um registro por usuário (chave primária composta): clicar de novo desfaz.
 * Os contadores ficam na própria linha do artigo/comentário para listagens rápidas.
 */
@Injectable()
export class EngagementService {
  constructor(private readonly db: DataSource) {}

  async toggleArticleLike(articleId: number, userId: number) {
    return this.db.transaction(async (m) => {
      const [art] = await m.query(
        "SELECT id FROM articles WHERE id = ? AND status = 'PUBLISHED' AND deleted_at IS NULL FOR UPDATE", [articleId]);
      if (!art) throw new NotFoundException('Artigo não encontrado');
      const removed = await m.query('DELETE FROM article_likes WHERE article_id = ? AND user_id = ?', [articleId, userId]);
      const liked = !(removed?.affectedRows > 0);
      if (liked) {
        await m.query('INSERT INTO article_likes (article_id, user_id) VALUES (?, ?)', [articleId, userId]);
        await m.query('UPDATE articles SET like_count = like_count + 1 WHERE id = ?', [articleId]);
      } else {
        await m.query('UPDATE articles SET like_count = GREATEST(like_count, 1) - 1 WHERE id = ?', [articleId]);
      }
      const [row] = await m.query('SELECT like_count AS likeCount FROM articles WHERE id = ?', [articleId]);
      return { liked, likeCount: Number(row.likeCount) };
    });
  }

  /** Favoritos do usuário (só artigos ainda publicados), do mais recente para o mais antigo */
  async myArticleLikes(userId: number) {
    const rows: Record<string, unknown>[] = await this.db.query(
      `SELECT a.id, a.slug, a.title, a.excerpt, a.cover_url AS coverUrl, a.categories_json AS categories, l.created_at AS likedAt
         FROM article_likes l JOIN articles a ON a.id = l.article_id
        WHERE l.user_id = ? AND a.status = 'PUBLISHED' AND a.deleted_at IS NULL
        ORDER BY l.created_at DESC LIMIT 500`, [userId]);
    const items = rows.map((r) => {
      // O driver pode devolver a coluna JSON já convertida ou como texto
      let categories: string[] = [];
      if (Array.isArray(r.categories)) categories = r.categories as string[];
      else { try { categories = JSON.parse(String(r.categories ?? '[]')); } catch { /* campo vazio */ } }
      return { id: Number(r.id), slug: r.slug, title: r.title, excerpt: r.excerpt, coverUrl: r.coverUrl, categories, likedAt: r.likedAt };
    });
    return { articleIds: items.map((i) => i.id), items };
  }

  async toggleCommentLike(commentId: number, userId: number) {
    return this.db.transaction(async (m) => {
      const [c] = await m.query(
        "SELECT id FROM comments WHERE id = ? AND status = 'APPROVED' AND deleted_at IS NULL FOR UPDATE", [commentId]);
      if (!c) throw new NotFoundException('Comentário não encontrado');
      const removed = await m.query('DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?', [commentId, userId]);
      const liked = !(removed?.affectedRows > 0);
      if (liked) {
        await m.query('INSERT INTO comment_likes (comment_id, user_id) VALUES (?, ?)', [commentId, userId]);
        await m.query('UPDATE comments SET like_count = like_count + 1 WHERE id = ?', [commentId]);
      } else {
        await m.query('UPDATE comments SET like_count = GREATEST(like_count, 1) - 1 WHERE id = ?', [commentId]);
      }
      const [row] = await m.query('SELECT like_count AS likeCount FROM comments WHERE id = ?', [commentId]);
      return { liked, likeCount: Number(row.likeCount) };
    });
  }

  /** Quais comentários deste artigo o usuário já curtiu */
  async myCommentLikes(articleId: number, userId: number) {
    const rows: { id: number }[] = await this.db.query(
      'SELECT l.comment_id AS id FROM comment_likes l JOIN comments c ON c.id = l.comment_id WHERE c.article_id = ? AND l.user_id = ?',
      [articleId, userId]);
    return { commentIds: rows.map((r) => Number(r.id)) };
  }
}
