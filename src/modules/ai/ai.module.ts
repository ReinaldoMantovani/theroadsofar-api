import { Module, Controller, Post, Get, Body, Query, UseGuards, Injectable } from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, IsIn, IsInt, IsNumber, IsArray, ArrayMaxSize, Min } from 'class-validator';
import { AiGeneration, AiAttempt } from './entities/ai-generation.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

class RecordGenerationDto {
  @IsString() @MaxLength(64) jobId!: string;
  @IsIn(['article', 'image', 'assist', 'seo', 'metadata']) kind!: string;
  @IsIn(['running', 'done', 'failed', 'cancelled', 'partial']) status!: string;
  @IsOptional() @IsString() @MaxLength(30) provider?: string;
  @IsOptional() @IsString() @MaxLength(150) model?: string;
  @IsOptional() @IsInt() articleId?: number;
  @IsOptional() @IsString() @MaxLength(500) promptSummary?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) attempts?: AiAttempt[];
  @IsOptional() @IsInt() @Min(0) tokensIn?: number;
  @IsOptional() @IsInt() @Min(0) tokensOut?: number;
  @IsOptional() @IsNumber() @Min(0) costUsd?: number;
  @IsOptional() @IsString() @MaxLength(1000) errorMessage?: string;
  @IsOptional() @IsInt() @Min(0) durationMs?: number;
}

@Injectable()
export class AiHistoryService {
  constructor(@InjectRepository(AiGeneration) private readonly repo: Repository<AiGeneration>) {}

  /** O servidor do admin registra cada geração aqui (upsert pelo jobId) */
  async record(dto: RecordGenerationDto, user: JwtPayload) {
    const existing = await this.repo.findOne({ where: { jobId: dto.jobId } });
    const attempts = (dto.attempts ?? []).slice(0, 50).map((a) => ({
      provider: String(a.provider ?? '').slice(0, 30), model: String(a.model ?? '').slice(0, 150), ok: !!a.ok,
      ...(a.error ? { error: String(a.error).slice(0, 300) } : {}), ...(a.status ? { status: Number(a.status) } : {}), ...(a.ms ? { ms: Number(a.ms) } : {}),
    }));
    const row = this.repo.merge(existing ?? this.repo.create({ jobId: dto.jobId, createdById: user.sub }), {
      kind: dto.kind, status: dto.status, provider: dto.provider ?? null, model: dto.model ?? null,
      articleId: dto.articleId ?? null, promptSummary: dto.promptSummary ?? null, attempts,
      tokensIn: dto.tokensIn ?? null, tokensOut: dto.tokensOut ?? null, costUsd: dto.costUsd ?? null,
      errorMessage: dto.errorMessage ?? null, durationMs: dto.durationMs ?? null,
    });
    const saved = await this.repo.save(row);
    return { id: saved.id };
  }

  async list(page = 1, limit = 30, kind?: string) {
    const [items, total] = await this.repo.findAndCount({
      where: kind ? { kind } : {}, order: { createdAt: 'DESC' }, skip: (Math.max(1, page) - 1) * limit, take: limit,
    });
    return { items, total, page, limit };
  }

  /** Consumo dos últimos N dias por provedor/modelo */
  async stats(days = 30) {
    const rows = await this.repo.query(
      `SELECT provider, model, kind, COUNT(*) total, SUM(status IN ('done','partial')) ok, SUM(status = 'failed') failed,
              COALESCE(SUM(tokens_in),0) tokensIn, COALESCE(SUM(tokens_out),0) tokensOut, COALESCE(SUM(cost_usd),0) costUsd,
              ROUND(AVG(duration_ms)) avgMs
         FROM ai_generations WHERE created_at >= (NOW() - INTERVAL ? DAY)
        GROUP BY provider, model, kind ORDER BY total DESC`,
      [days],
    );
    return rows.map((r: Record<string, unknown>) => ({
      provider: r.provider, model: r.model, kind: r.kind, total: Number(r.total), ok: Number(r.ok), failed: Number(r.failed),
      tokensIn: Number(r.tokensIn), tokensOut: Number(r.tokensOut), costUsd: Number(r.costUsd), avgMs: r.avgMs === null ? null : Number(r.avgMs),
    }));
  }
}

@ApiTags('ai')
@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.AUTHOR)
@ApiBearerAuth()
export class AiHistoryController {
  constructor(private readonly service: AiHistoryService) {}

  @Post('generations')
  @ApiOperation({ summary: '[Admin] Registrar geração de IA (chamado pelo servidor do admin)' })
  record(@Body() dto: RecordGenerationDto, @CurrentUser() user: JwtPayload) {
    return this.service.record(dto, user);
  }

  @Get('generations')
  list(@Query('page') page = '1', @Query('kind') kind?: string) {
    return this.service.list(parseInt(page) || 1, 30, kind);
  }

  @Get('generations/stats')
  stats(@Query('days') days = '30') {
    return this.service.stats(Math.min(365, Math.max(1, parseInt(days) || 30)));
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([AiGeneration])],
  controllers: [AiHistoryController],
  providers: [AiHistoryService],
})
export class AiModule {}
