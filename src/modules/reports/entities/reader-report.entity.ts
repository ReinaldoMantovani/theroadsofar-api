import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ReportStatus { PENDING = 'PENDING', APPROVED = 'APPROVED', REJECTED = 'REJECTED', ARCHIVED = 'ARCHIVED' }

@Entity('reader_reports')
export class ReaderReport {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: number;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  summary: string | null;

  @Column({ type: 'text' })
  narrative: string;

  @Column({ name: 'location_name', type: 'varchar', length: 200, nullable: true })
  locationName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  region: string | null;

  @Column({ name: 'phenomenon_type', type: 'varchar', length: 100, nullable: true })
  phenomenonType: string | null;

  @Column({ type: 'boolean', default: false })
  anonymous: boolean;

  @Column({ name: 'reporter_user_id', type: 'bigint', unsigned: true, nullable: true })
  reporterUserId: number | null;

  @Column({ type: 'enum', enum: ReportStatus, default: ReportStatus.PENDING })
  status: ReportStatus;

  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes: string | null;

  @Column({ name: 'ip_hash', type: 'varchar', length: 64, nullable: true, select: false })
  ipHash: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
