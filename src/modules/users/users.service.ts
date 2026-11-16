import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './entities/user.entity';
import { UserProfile } from './entities/user-profile.entity';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({
      where: { email, deletedAt: null as unknown as Date },
      select: [
        'id',
        'email',
        'passwordHash',
        'roles',
        'refreshTokenHash',
        'consentTermsAt',
        'consentPrivacyAt',
        'deletedAt',
        'createdAt',
        'updatedAt',
      ],
    });
  }

  async findById(id: number): Promise<User | null> {
    return this.userRepo.findOne({ where: { id, deletedAt: IsNull() } });
  }

  /** Lista de usuários para o painel (sem dados sensíveis) */
  async adminList(q: string | undefined, page = 1, limit = 30) {
    const where = ['u.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (q) { where.push('(u.email LIKE ? OR p.display_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    const offset = (Math.max(1, page) - 1) * limit;
    const rows = await this.userRepo.query(
      `SELECT u.id, u.email, u.roles, u.is_active isActive, u.email_verified emailVerified, u.created_at createdAt,
              p.display_name displayName, p.avatar_url avatarUrl,
              (SELECT COUNT(*) FROM articles a WHERE a.author_id = u.id AND a.deleted_at IS NULL) articles,
              (SELECT COUNT(*) FROM comments c WHERE c.author_id = u.id AND c.deleted_at IS NULL) comments
         FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
        WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const [{ n }] = await this.userRepo.query(`SELECT COUNT(*) n FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE ${where.join(' AND ')}`, params);
    return {
      items: rows.map((r: Record<string, unknown>) => ({
        ...r, id: Number(r.id), isActive: !!Number(r.isActive), emailVerified: !!Number(r.emailVerified),
        roles: typeof r.roles === 'string' ? (r.roles as string).split(',').filter(Boolean) : r.roles,
        articles: Number(r.articles), comments: Number(r.comments),
      })),
      total: Number(n), page, limit,
    };
  }

  async adminUpdate(id: number, data: { roles?: string[]; isActive?: boolean }, byUserId: number) {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (data.roles) user.roles = data.roles as User['roles'];
    if (data.isActive !== undefined) {
      user.isActive = data.isActive;
      if (!data.isActive) user.refreshTokenHash = null; // derruba a sessão
    }
    await this.userRepo.save(user);
    void byUserId;
    return this.getMe(id);
  }

  /** Dados do usuário logado (sem hash de senha/tokens). */
  async getMe(id: number) {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('Usuário não encontrado');
    const profile = await this.profileRepo.findOne({ where: { userId: id } });
    return {
      id: user.id,
      email: user.email,
      roles: user.roles,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      displayName: profile?.displayName ?? user.email.split('@')[0],
      avatarUrl: profile?.avatarUrl ?? null,
      bio: profile?.bio ?? null,
      websiteUrl: profile?.websiteUrl ?? null,
    };
  }

  async create(data: {
    email: string;
    password: string;
    consentTermsAt: Date;
    consentPrivacyAt: Date;
    displayName?: string;
  }): Promise<User> {
    const existing = await this.userRepo.findOne({
      where: { email: data.email },
    });
    if (existing) {
      throw new ConflictException('E-mail já cadastrado');
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    const user = this.userRepo.create({
      email: data.email,
      passwordHash,
      roles: [UserRole.READER],
      consentTermsAt: data.consentTermsAt,
      consentPrivacyAt: data.consentPrivacyAt,
    });
    await this.userRepo.save(user);

    const profile = this.profileRepo.create({
      user,
      displayName: data.displayName ?? data.email.split('@')[0],
      username: `user${user.id}`,
    });
    await this.profileRepo.save(profile);

    return this.userRepo.findOne({
      where: { id: user.id },
      relations: ['profile'],
    }) as Promise<User>;
  }

  async updateRefreshToken(userId: number, hash: string | null): Promise<void> {
    await this.userRepo.update(userId, { refreshTokenHash: hash });
  }

  async changePassword(userId: number, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.userRepo.update(userId, { passwordHash });
  }

  async updateProfile(
    userId: number,
    data: Partial<Pick<UserProfile, 'displayName' | 'bio' | 'avatarUrl' | 'websiteUrl'>>,
  ): Promise<UserProfile> {
    const profile = await this.profileRepo.findOne({
      where: { user: { id: userId } },
    });
    if (!profile) {
      throw new NotFoundException('Perfil não encontrado');
    }
    Object.assign(profile, data);
    return this.profileRepo.save(profile);
  }

  async softDelete(userId: number): Promise<void> {
    await this.userRepo.update(userId, {
      deletedAt: new Date(),
      refreshTokenHash: null,
    });
  }

  async exportData(userId: number): Promise<Record<string, unknown>> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    const profile = await this.profileRepo.findOne({ where: { userId } });

    return {
      id: user.id,
      email: user.email,
      roles: user.roles,
      consentTermsAt: user.consentTermsAt,
      consentPrivacyAt: user.consentPrivacyAt,
      createdAt: user.createdAt,
      profile: profile
        ? {
            displayName: profile.displayName,
            username: profile.username,
            bio: profile.bio,
            websiteUrl: profile.websiteUrl,
          }
        : null,
    };
  }
}
