import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { jsonText, decimalNumber } from '../../../common/transformers/json-text.transformer';

export enum ArticleStatus {
  DRAFT = 'DRAFT',
  REVIEW = 'REVIEW',
  PUBLISHED = 'PUBLISHED',
  SCHEDULED = 'SCHEDULED',
  ARCHIVED = 'ARCHIVED',
  TRASH = 'TRASH',
}

export type ClassificationLevel = 'publico' | 'restrito' | 'confidencial' | 'oculto';

export interface TimelineEntry { period: string; title: string; description: string; mediaUrl?: string }
export interface DossierAttachment { label: string; url: string; kind?: string }
export interface ConnectionItem { articleId?: number; slug?: string; title: string; relation?: string; reason?: string }
/** Cartão do quadro de investigação (mesmo formato usado pelo blog) */
export interface EvidenceItem {
  id?: string; label: string; description: string; type?: string;
  sourceUrl?: string; referenceUrl?: string; imageUrl?: string; audioUrl?: string; videoUrl?: string; youtubeUrl?: string;
  x?: number; y?: number; rotation?: number; paperStyle?: string; date?: string;
  linkedEvidenceIds?: string[]; corruptedMessage?: string; audioOnly?: boolean;
}

@Entity('articles')
@Index(['slug'], { unique: true })
@Index(['status', 'publishedAt'])
export class Article {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: number;

  @Column({ length: 191, unique: true })
  slug: string;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  subtitle: string | null;

  @Column({ type: 'text', nullable: true })
  excerpt: string | null;

  @Column({ name: 'content_html', type: 'longtext' })
  contentHtml: string;

  /** Documento do editor de blocos: { schema: 'trsf-blocks', version: 1, doc: <Tiptap JSON> } */
  @Column({ name: 'content_json', type: 'longtext', nullable: true, select: false, transformer: jsonText<unknown>(null) })
  contentJson: unknown | null;

  @Column({ type: 'boolean', default: false })
  featured: boolean;

  @Column({ name: 'previous_status', type: 'varchar', length: 20, nullable: true, select: false })
  previousStatus: string | null;

  @Column({ name: 'trashed_at', type: 'datetime', nullable: true })
  trashedAt: Date | null;

  @Column({ type: 'varchar', name: 'cover_url', nullable: true })
  coverUrl: string | null;

  @Column({ type: 'enum', enum: ArticleStatus, default: ArticleStatus.DRAFT })
  status: ArticleStatus;

  @Column({ name: 'published_at', type: 'datetime', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'scheduled_at', type: 'datetime', nullable: true })
  scheduledAt: Date | null;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ name: 'author_id', type: 'bigint', unsigned: true })
  authorId: number;

  // JSON arrays para tags e categorias
  @Column({ name: 'tags_json', type: 'json', default: '[]' })
  tags: string[];

  @Column({ name: 'categories_json', type: 'json', default: '[]' })
  categories: string[];

  // SEO
  @Column({ type: 'varchar', name: 'seo_title', nullable: true, length: 70 })
  seoTitle: string | null;

  @Column({ type: 'varchar', name: 'seo_description', nullable: true, length: 160 })
  seoDescription: string | null;

  @Column({ type: 'varchar', name: 'seo_focus_keyword', nullable: true, length: 100 })
  seoFocusKeyword: string | null;

  @Column({ name: 'seo_keywords_json', type: 'longtext', nullable: true, transformer: jsonText<string[]>([]) })
  seoKeywords: string[];

  @Column({ type: 'varchar', name: 'canonical_url', nullable: true, length: 500 })
  canonicalUrl: string | null;

  @Column({ type: 'varchar', name: 'og_title', nullable: true, length: 100 })
  ogTitle: string | null;

  @Column({ type: 'varchar', name: 'og_description', nullable: true, length: 200 })
  ogDescription: string | null;

  @Column({ type: 'varchar', name: 'og_image_url', nullable: true, length: 500 })
  ogImageUrl: string | null;

  @Column({ type: 'varchar', name: 'twitter_card', nullable: true, length: 30 })
  twitterCard: string | null;

  @Column({ name: 'robots_index', type: 'boolean', default: true })
  robotsIndex: boolean;

  // Dossiê investigativo
  @Column({ name: 'classification_level', type: 'varchar', length: 20, default: 'publico' })
  classificationLevel: ClassificationLevel;

  @Column({ type: 'varchar', name: 'case_number', nullable: true, length: 50 })
  caseNumber: string | null;

  @Column({ type: 'varchar', name: 'case_status', nullable: true, length: 30 })
  caseStatus: string | null;

  @Column({ type: 'varchar', name: 'location_name', nullable: true, length: 200 })
  locationName: string | null;

  @Column({ type: 'decimal', precision: 9, scale: 6, nullable: true, transformer: decimalNumber })
  latitude: number | null;

  @Column({ type: 'decimal', precision: 9, scale: 6, nullable: true, transformer: decimalNumber })
  longitude: number | null;

  @Column({ type: 'varchar', name: 'phenomenon_type', nullable: true, length: 100 })
  phenomenonType: string | null;

  @Column({ type: 'varchar', name: 'entity_name', nullable: true, length: 150 })
  entityName: string | null;

  @Column({ type: 'varchar', name: 'event_date', nullable: true, length: 100 })
  eventDate: string | null;

  @Column({ name: 'dossier_summary', type: 'text', nullable: true })
  dossierSummary: string | null;

  /** Ficção declarada (dados narrativos não são apresentados como fatos) */
  @Column({ name: 'is_fiction', type: 'boolean', default: false })
  isFiction: boolean;

  @Column({ name: 'censored_json', type: 'longtext', nullable: true, transformer: jsonText<string[]>([]) })
  censoredSegments: string[];

  @Column({ name: 'timeline_json', type: 'longtext', nullable: true, transformer: jsonText<TimelineEntry[]>([]) })
  timeline: TimelineEntry[];

  @Column({ name: 'attachments_json', type: 'longtext', nullable: true, transformer: jsonText<DossierAttachment[]>([]) })
  attachments: DossierAttachment[];

  @Column({ name: 'connections_json', type: 'longtext', nullable: true, transformer: jsonText<ConnectionItem[]>([]) })
  connections: ConnectionItem[];

  @Column({ name: 'inspirations_json', type: 'longtext', nullable: true, transformer: jsonText<string[]>([]) })
  inspirations: string[];

  /** Quadro de investigação — só é alterado pela rota própria do quadro */
  @Column({ name: 'evidences_json', type: 'longtext', nullable: true, transformer: jsonText<EvidenceItem[]>([]) })
  evidences: EvidenceItem[];

  @Column({ type: 'varchar', name: 'purchase_url', nullable: true, length: 500 })
  purchaseUrl: string | null;

  /** Controle de edição concorrente: incrementa a cada gravação */
  @Column({ type: 'int', unsigned: true, default: 1 })
  version: number;

  @Column({ name: 'last_edited_by_id', type: 'bigint', unsigned: true, nullable: true })
  lastEditedById: number | null;

  // Métricas
  @Column({ name: 'view_count', default: 0 })
  viewCount: number;

  @Column({ name: 'like_count', default: 0 })
  likeCount: number;

  @Column({ name: 'share_count', default: 0 })
  shareCount: number;

  @Column({ name: 'comment_count', default: 0 })
  commentCount: number;

  @Column({ name: 'read_time_minutes', default: 1 })
  readTimeMinutes: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'datetime', nullable: true, select: false })
  deletedAt: Date | null;
}
