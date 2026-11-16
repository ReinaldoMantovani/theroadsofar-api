import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToOne, JoinColumn,
} from 'typeorm';

export enum UserRole {
  ADMIN = 'ADMIN',
  AUTHOR = 'AUTHOR',
  READER = 'READER',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: number;

  @Column({ unique: true, length: 191 })
  email: string;

  @Column({ name: 'password_hash', select: false })
  passwordHash: string;

  @Column({
    type: 'set',
    enum: UserRole,
    default: UserRole.READER,
  })
  roles: UserRole[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'email_verified', default: false })
  emailVerified: boolean;

  @Column({ type: 'varchar', name: 'email_verification_token', nullable: true, select: false })
  emailVerificationToken: string | null;

  @Column({ type: 'varchar', name: 'refresh_token_hash', nullable: true, select: false })
  refreshTokenHash: string | null;

  // LGPD
  @Column({ name: 'consent_terms_at', type: 'datetime', nullable: true })
  consentTermsAt: Date | null;

  @Column({ name: 'consent_privacy_at', type: 'datetime', nullable: true })
  consentPrivacyAt: Date | null;

  @Column({ name: 'deleted_at', type: 'datetime', nullable: true })
  deletedAt: Date | null;

  @Column({ type: 'varchar', name: 'deletion_reason', nullable: true })
  deletionReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  get isAdmin(): boolean {
    return this.roles.includes(UserRole.ADMIN);
  }
}
