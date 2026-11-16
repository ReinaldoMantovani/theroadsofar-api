import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { jsonText, decimalNumber } from '../../../common/transformers/json-text.transformer';

export interface AiAttempt { provider: string; model: string; ok: boolean; error?: string; status?: number; ms?: number }

@Entity('ai_generations')
export class AiGeneration {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'job_id', length: 64, unique: true })
  jobId: string;

  @Column({ length: 20 })
  kind: string; // article | image | assist | seo

  @Column({ length: 20 })
  status: string; // done | failed | cancelled | partial

  @Column({ type: 'varchar', length: 30, nullable: true })
  provider: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  model: string | null;

  @Column({ name: 'article_id', type: 'bigint', unsigned: true, nullable: true })
  articleId: number | null;

  @Column({ name: 'prompt_summary', type: 'varchar', length: 500, nullable: true })
  promptSummary: string | null;

  @Column({ name: 'attempts_json', type: 'longtext', nullable: true, transformer: jsonText<AiAttempt[]>([]) })
  attempts: AiAttempt[];

  @Column({ name: 'tokens_in', type: 'int', unsigned: true, nullable: true })
  tokensIn: number | null;

  @Column({ name: 'tokens_out', type: 'int', unsigned: true, nullable: true })
  tokensOut: number | null;

  @Column({ name: 'cost_usd', type: 'decimal', precision: 12, scale: 6, nullable: true, transformer: decimalNumber })
  costUsd: number | null;

  @Column({ name: 'error_message', type: 'varchar', length: 1000, nullable: true })
  errorMessage: string | null;

  @Column({ name: 'duration_ms', type: 'int', unsigned: true, nullable: true })
  durationMs: number | null;

  @Column({ name: 'created_by_id', type: 'bigint', unsigned: true, nullable: true })
  createdById: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
