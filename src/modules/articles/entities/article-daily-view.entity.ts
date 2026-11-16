import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('article_daily_views')
export class ArticleDailyView {
  @PrimaryColumn({ name: 'article_id', type: 'bigint', unsigned: true })
  articleId: number;

  @PrimaryColumn({ type: 'date' })
  day: string;

  @Column({ type: 'int', unsigned: true, default: 0 })
  views: number;
}
