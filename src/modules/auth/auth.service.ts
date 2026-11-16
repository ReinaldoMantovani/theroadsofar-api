import {
  Injectable, UnauthorizedException, BadRequestException,
  ConflictException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { User, UserRole } from '../users/entities/user.entity';
import { UserProfile } from '../users/entities/user-profile.entity';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { LoginDto, RefreshTokenDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

interface RateBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // Rate limit em memória: 5 tentativas / 5 min por IP
  private readonly loginBuckets = new Map<string, RateBucket>();
  private readonly SALT_ROUNDS = 12;

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly profilesRepo: Repository<UserProfile>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    if (!dto.consentTerms || !dto.consentPrivacy) {
      throw new BadRequestException('É necessário aceitar os termos e a política de privacidade');
    }

    const existing = await this.usersRepo.findOne({
      where: { email: dto.email, deletedAt: IsNull() },
    });
    if (existing) throw new ConflictException('E-mail já cadastrado');

    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    const user = this.usersRepo.create({
      email: dto.email,
      passwordHash,
      roles: [UserRole.READER],
      consentTermsAt: new Date(),
      consentPrivacyAt: new Date(),
    });
    await this.usersRepo.save(user);

    const profile = this.profilesRepo.create({
      userId: user.id,
      displayName: dto.displayName,
    });
    await this.profilesRepo.save(profile);

    this.logger.log(`Novo usuário registrado: ${user.email}`);
    return { message: 'Conta criada com sucesso. Faça login para continuar.' };
  }

  async login(dto: LoginDto, ip: string): Promise<{ accessToken: string; refreshToken: string; user: Partial<JwtPayload> }> {
    this.checkLoginRateLimit(ip);

    const user = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .leftJoinAndSelect('user_profiles', 'p', 'p.user_id = u.id')
      .where('u.email = :email', { email: dto.email })
      .andWhere('u.deleted_at IS NULL')
      .getOne();

    // Busca separada para perfil
    const profile = user
      ? await this.profilesRepo.findOne({ where: { userId: user.id } })
      : null;

    const isValid = user && (await bcrypt.compare(dto.password, user.passwordHash));

    if (!isValid || !user) {
      this.recordFailedLogin(ip);
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }
    if (!user.isActive) throw new ForbiddenException('Conta desativada');

    this.clearLoginBucket(ip);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      displayName: profile?.displayName ?? '',
      avatarUrl: profile?.avatarUrl ?? null,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
    });
    const refreshToken = this.generateRefreshToken();
    const refreshHash = createHash('sha256').update(refreshToken).digest('hex');

    await this.usersRepo.update(user.id, { refreshTokenHash: refreshHash });

    return { accessToken, refreshToken, user: payload };
  }

  async refreshToken(dto: RefreshTokenDto): Promise<{ accessToken: string }> {
    const tokenHash = createHash('sha256').update(dto.refreshToken).digest('hex');

    const user = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.refreshTokenHash')
      .leftJoinAndSelect('user_profiles', 'p', 'p.user_id = u.id')
      .where('u.refresh_token_hash = :hash', { hash: tokenHash })
      .andWhere('u.is_active = true')
      .andWhere('u.deleted_at IS NULL')
      .getOne();

    if (!user) throw new UnauthorizedException('Refresh token inválido');

    const profile = await this.profilesRepo.findOne({ where: { userId: user.id } });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      displayName: profile?.displayName ?? '',
      avatarUrl: profile?.avatarUrl ?? null,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
    });
    return { accessToken };
  }

  async logout(userId: number): Promise<void> {
    await this.usersRepo.update(userId, { refreshTokenHash: null });
  }

  // ── Rate limiting em memória ───────────────────────────────────────
  private checkLoginRateLimit(ip: string): void {
    const bucket = this.loginBuckets.get(ip);
    if (!bucket) return;
    if (Date.now() > bucket.resetAt) {
      this.loginBuckets.delete(ip);
      return;
    }
    if (bucket.count >= 5) {
      const wait = Math.ceil((bucket.resetAt - Date.now()) / 1000);
      throw new ForbiddenException(`Muitas tentativas. Tente novamente em ${wait}s`);
    }
  }

  private recordFailedLogin(ip: string): void {
    const existing = this.loginBuckets.get(ip);
    if (!existing || Date.now() > existing.resetAt) {
      this.loginBuckets.set(ip, { count: 1, resetAt: Date.now() + 5 * 60 * 1000 });
    } else {
      existing.count++;
    }
  }

  private clearLoginBucket(ip: string): void {
    this.loginBuckets.delete(ip);
  }

  private generateRefreshToken(): string {
    return randomBytes(48).toString('hex');
  }
}
