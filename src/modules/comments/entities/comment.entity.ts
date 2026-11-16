import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Article } from '../../articles/entities/article.entity';

export enum CommentStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: number;

  @ManyToOne(() => Article, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'article_id' })
  article: Article;

  @Column({ name: 'article_id', type: 'bigint', unsigned: true })
  articleId: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'author_id' })
  author: User | null;

  @Column({ name: 'author_id', type: 'bigint', unsigned: true, nullable: true })
  authorId: number | null;

  @Column({ type: 'varchar', name: 'guest_name', nullable: true, length: 60 })
  guestName: string | null;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'enum', enum: CommentStatus, default: CommentStatus.PENDING })
  status: CommentStatus;

  @Column({ type: 'varchar', name: 'ip_hash', nullable: true, length: 64 })
  ipHash: string | null;

  @Column({ name: 'like_count', type: 'int', unsigned: true, default: 0 })
  likeCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'deleted_at', type: 'datetime', nullable: true })
  deletedAt: Date | null;
}
