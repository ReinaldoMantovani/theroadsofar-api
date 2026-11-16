import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { jsonText } from '../../../common/transformers/json-text.transformer';

export type RevisionReason = 'autosave' | 'manual' | 'publish' | 'ai_before' | 'ai_after' | 'restore' | 'import';

@Entity('article_revisions')
@Index(['articleId', 'createdAt'])
export class ArticleRevision {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'article_id', type: 'bigint', unsigned: true })
  articleId: number;

  @Column({ type: 'int', unsigned: true })
  version: number;

  @Column({ type: 'varchar', length: 20 })
  reason: RevisionReason;

  @Column({ length: 200 })
  title: string;

  @Column({ name: 'content_html', type: 'longtext' })
  contentHtml: string;

  @Column({ name: 'content_json', type: 'longtext', nullable: true, transformer: jsonText<unknown>(null) })
  contentJson: unknown | null;

  /** Demais campos do artigo no momento da revisão (SEO, dossiê, taxonomia...) */
  @Column({ name: 'meta_json', type: 'longtext', nullable: true, transformer: jsonText<Record<string, unknown>>({}) })
  meta: Record<string, unknown>;

  @Column({ name: 'created_by_id', type: 'bigint', unsigned: true, nullable: true })
  createdById: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
