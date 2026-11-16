import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('slug_redirects')
export class SlugRedirect {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'old_slug', length: 191, unique: true })
  oldSlug: string;

  @Column({ name: 'article_id', type: 'bigint', unsigned: true })
  articleId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
