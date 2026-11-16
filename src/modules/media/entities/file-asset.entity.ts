import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('file_assets')
export class FileAsset {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: number;

  @Column({ length: 255 })
  filename: string;

  @Column({ name: 'original_name', length: 255 })
  originalName: string;

  @Column({ name: 'mime_type', length: 100 })
  mimeType: string;

  @Column({ type: 'bigint', unsigned: true })
  size: number;

  @Column({ type: 'text' })
  url: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'uploaded_by_id' })
  uploadedBy: User;

  @Column({ name: 'uploaded_by_id', type: 'bigint', unsigned: true, nullable: true })
  uploadedById: number | null;

  /** image | video | audio | document */
  @Column({ length: 20, default: 'image' })
  kind: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ name: 'alt_text', type: 'varchar', length: 300, nullable: true })
  altText: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  caption: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  credit: string | null;

  @Column({ name: 'source_url', type: 'varchar', length: 500, nullable: true })
  sourceUrl: string | null;

  @Column({ name: 'ai_generated', type: 'boolean', default: false })
  aiGenerated: boolean;

  @Column({ name: 'ai_prompt', type: 'text', nullable: true })
  aiPrompt: string | null;

  @Column({ name: 'ai_model', type: 'varchar', length: 150, nullable: true })
  aiModel: string | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  width: number | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  height: number | null;

  /** Hash do arquivo original: evita guardar a mesma imagem duas vezes */
  @Column({ type: 'char', length: 64, nullable: true })
  sha256: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
