import { Module, Controller, Post, Get, Put, Body, Param, Query, ParseIntPipe, UseGuards, Req, Injectable, NotFoundException } from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, MinLength, IsBoolean, IsIn } from 'class-validator';
import { Request } from 'express';
import { createHash } from 'crypto';
import sanitizeHtml from 'sanitize-html';
import { ReaderReport, ReportStatus } from './entities/reader-report.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtGuard } from '../../common/guards/optional-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AuditService } from '../audit/audit.service';

const plain = (v?: string, max = 500) => (v ? sanitizeHtml(v, { allowedTags: [], allowedAttributes: {} }).trim().slice(0, max) || null : null);

class CreateReportDto {
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(500) summary?: string;
  @IsString() @MinLength(20) @MaxLength(20000) narrative!: string;
  @IsOptional() @IsString() @MaxLength(200) locationName?: string;
  @IsOptional() @IsString() @MaxLength(100) region?: string;
  @IsOptional() @IsString() @MaxLength(100) phenomenonType?: string;
  @IsOptional() @IsBoolean() anonymousReport?: boolean;
}

class ModerateReportDto {
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED']) status!: ReportStatus;
  @IsOptional() @IsString() @MaxLength(5000) adminNotes?: string;
}

@Injectable()
export class ReportsService {
  constructor(@InjectRepository(ReaderReport) private readonly repo: Repository<ReaderReport>, private readonly audit: AuditService) {}

  async create(dto: CreateReportDto, user: JwtPayload | null, ip: string) {
    const anonymous = dto.anonymousReport === true || !user;
    const saved = await this.repo.save(this.repo.create({
      title: plain(dto.title, 200) ?? 'Relato',
      summary: plain(dto.summary, 500),
      narrative: plain(dto.narrative, 20000) ?? '',
      locationName: plain(dto.locationName, 200),
      region: plain(dto.region, 100),
      phenomenonType: plain(dto.phenomenonType, 100),
      anonymous,
      reporterUserId: anonymous ? null : user!.sub,
      ipHash: createHash('sha256').update(ip || '').digest('hex'),
    }));
    return { id: saved.id, status: saved.status, message: 'Relato recebido. Ele será analisado pela equipe.' };
  }

  async list(status: string | undefined, page = 1, limit = 30) {
    const where = ['1=1'];
    const params: unknown[] = [];
    if (status) { where.push('r.status = ?'); params.push(status); }
    const rows = await this.repo.query(
      `SELECT r.id, r.title, r.summary, r.narrative, r.location_name locationName, r.region, r.phenomenon_type phenomenonType,
              r.anonymous, r.status, r.admin_notes adminNotes, r.created_at createdAt, r.updated_at updatedAt,
              CASE WHEN r.anonymous = 1 THEN NULL ELSE p.display_name END reporterName
         FROM reader_reports r LEFT JOIN user_profiles p ON p.user_id = r.reporter_user_id
        WHERE ${where.join(' AND ')} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, (Math.max(1, page) - 1) * limit],
    );
    const [{ n }] = await this.repo.query(`SELECT COUNT(*) n FROM reader_reports r WHERE ${where.join(' AND ')}`, params);
    const counts = await this.repo.query('SELECT status, COUNT(*) n FROM reader_reports GROUP BY status');
    return {
      items: rows.map((r: Record<string, unknown>) => ({ ...r, id: Number(r.id), anonymous: !!Number(r.anonymous) })),
      total: Number(n), page, limit,
      counts: Object.fromEntries(counts.map((c: { status: string; n: string }) => [c.status, Number(c.n)])),
    };
  }

  async moderate(id: number, dto: ModerateReportDto, user: JwtPayload) {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Relato não encontrado');
    r.status = dto.status;
    if (dto.adminNotes !== undefined) r.adminNotes = dto.adminNotes || null;
    await this.repo.save(r);
    this.audit.log({ userId: user.sub, action: `report.${dto.status.toLowerCase()}`, resourceType: 'report', resourceId: id });
    return r;
  }
}

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Post()
  @UseGuards(OptionalJwtGuard)
  @Throttle({ default: { limit: 3, ttl: 10 * 60_000 } }) // 3 relatos a cada 10 minutos por IP
  @ApiOperation({ summary: 'Enviar relato (público; identifica o leitor se estiver logado)' })
  create(@Body() dto: CreateReportDto, @CurrentUser() user: JwtPayload | null, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip ?? '';
    return this.service.create(dto, user ?? null, ip);
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  list(@Query('status') status?: string, @Query('page') page = '1') {
    return this.service.list(status, parseInt(page) || 1);
  }

  @Put('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  moderate(@Param('id', ParseIntPipe) id: number, @Body() dto: ModerateReportDto, @CurrentUser() user: JwtPayload) {
    return this.service.moderate(id, dto, user);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([ReaderReport])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
