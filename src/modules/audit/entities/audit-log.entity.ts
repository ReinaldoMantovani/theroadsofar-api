import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('audit_logs')
@Index(['userId'])
@Index(['action'])
export class AuditLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, nullable: true })
  userId: number | null;

  @Column({ length: 100 })
  action: string;

  @Column({ type: 'varchar', name: 'resource_type', length: 50, nullable: true })
  resourceType: string | null;

  @Column({ type: 'varchar', name: 'resource_id', nullable: true })
  resourceId: string | null;

  @Column({ type: 'varchar', name: 'ip_anonymized', length: 20, nullable: true })
  ipAnonymized: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
