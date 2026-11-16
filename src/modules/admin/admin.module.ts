import { Module, Controller, Get, Post, Body, Query, UseGuards, Injectable, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AuditService } from '../audit/audit.service';

class RenameTermDto {
  @IsIn(['category', 'tag']) type!: 'category' | 'tag';
  @IsString() @MinLength(1) @MaxLength(60) from!: string;
  @IsString() @MinLength(1) @MaxLength(60) to!: string;
}
class DeleteTermDto {
  @IsIn(['category', 'tag']) type!: 'category' | 'tag';
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
}

const n = (v: unknown) => Number(v ?? 0);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const CASE_FILTER = `(location_name IS NOT NULL OR case_number IS NOT NULL OR dossier_summary IS NOT NULL
  OR (evidences_json IS NOT NULL AND evidences_json NOT IN ('', '[]')))`;

@Injectable()
export class AdminService {
  constructor(@InjectDataSource() private readonly db: DataSource, private readonly audit: AuditService) {}

  /** Indicadores do dashboard — todos calculados direto do banco */
  async metrics(days: number) {
    const q = <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => this.db.query(sql, p) as Promise<T[]>;
    // "Hoje" vem do banco, para o gráfico bater com as datas gravadas
    const [{ today }] = await q<{ today: string }>("SELECT DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') today");
    const since = new Date(new Date(`${today}T00:00:00Z`).getTime() - (days - 1) * 86400000);

    const [statusRows, [views], top, [pending], [users], [cases], mediaRows, aiRows, viewSeries, pubSeries, activity] = await Promise.all([
      q<{ status: string; n: string }>('SELECT status, COUNT(*) n FROM articles WHERE deleted_at IS NULL GROUP BY status'),
      q<{ total: string; period: string }>(
        `SELECT (SELECT COALESCE(SUM(view_count),0) FROM articles WHERE deleted_at IS NULL) total,
                (SELECT COALESCE(SUM(views),0) FROM article_daily_views WHERE day >= ?) period`, [isoDay(since)]),
      q(`SELECT id, title, slug, view_count views, comment_count comments, published_at publishedAt FROM articles
          WHERE deleted_at IS NULL AND status = 'PUBLISHED' ORDER BY view_count DESC LIMIT 5`),
      q<{ n: string }>("SELECT COUNT(*) n FROM comments WHERE deleted_at IS NULL AND status = 'PENDING'"),
      q<{ n: string; active: string }>('SELECT COUNT(*) n, SUM(is_active) active FROM users WHERE deleted_at IS NULL'),
      q<{ n: string }>(`SELECT COUNT(*) n FROM articles WHERE deleted_at IS NULL AND status != 'TRASH' AND ${CASE_FILTER}`),
      q<{ kind: string; n: string; bytes: string }>('SELECT kind, COUNT(*) n, COALESCE(SUM(size),0) bytes FROM file_assets GROUP BY kind'),
      q(`SELECT job_id jobId, kind, status, provider, model, prompt_summary promptSummary, created_at createdAt
           FROM ai_generations ORDER BY created_at DESC LIMIT 6`),
      q<{ day: string; views: string }>(
        `SELECT DATE_FORMAT(day, '%Y-%m-%d') day, SUM(views) views FROM article_daily_views WHERE day >= ? GROUP BY day`, [isoDay(since)]),
      q<{ day: string; n: string }>(
        `SELECT DATE_FORMAT(published_at, '%Y-%m-%d') day, COUNT(*) n FROM articles
          WHERE deleted_at IS NULL AND published_at >= ? AND status = 'PUBLISHED' GROUP BY day`, [isoDay(since)]),
      q(`SELECT l.id, l.action, l.resource_type resourceType, l.resource_id resourceId, l.created_at createdAt,
                p.display_name userName, a.title articleTitle
           FROM audit_logs l LEFT JOIN user_profiles p ON p.user_id = l.user_id
           LEFT JOIN articles a ON l.resource_type = 'article' AND a.id = l.resource_id
          ORDER BY l.created_at DESC LIMIT 15`),
    ]);

    const byStatus: Record<string, number> = {};
    for (const r of statusRows) byStatus[r.status] = n(r.n);

    // Séries diárias completas (dias sem dados = 0)
    const vMap = new Map(viewSeries.map((r) => [r.day, n(r.views)]));
    const pMap = new Map(pubSeries.map((r) => [r.day, n(r.n)]));
    const series = Array.from({ length: days }, (_, i) => {
      const day = isoDay(new Date(since.getTime() + i * 86400000));
      return { day, views: vMap.get(day) ?? 0, published: pMap.get(day) ?? 0 };
    });

    const media = { count: 0, bytes: 0, byKind: {} as Record<string, { count: number; bytes: number }> };
    for (const r of mediaRows) {
      media.byKind[r.kind] = { count: n(r.n), bytes: n(r.bytes) };
      media.count += n(r.n);
      media.bytes += n(r.bytes);
    }

    return {
      periodDays: days,
      articles: {
        published: byStatus.PUBLISHED ?? 0, drafts: byStatus.DRAFT ?? 0, review: byStatus.REVIEW ?? 0,
        scheduled: byStatus.SCHEDULED ?? 0, archived: byStatus.ARCHIVED ?? 0, trash: byStatus.TRASH ?? 0,
      },
      views: { total: n(views.total), period: n(views.period) },
      topArticles: top.map((r) => ({ ...r, id: n(r.id), views: n(r.views), comments: n(r.comments) })),
      pendingComments: n(pending.n),
      users: { total: n(users.n), active: n(users.active) },
      cases: n(cases.n),
      media,
      recentAi: aiRows,
      series,
      activity: activity.map((r) => ({ ...r, id: n(r.id) })),
      // Visualizações diárias só existem a partir da instalação desta versão
      viewsTrackedSince: (await q<{ d: string | null }>("SELECT DATE_FORMAT(MIN(day), '%Y-%m-%d') d FROM article_daily_views"))[0]?.d ?? null,
    };
  }

  /** Categorias e tags em uso (ficam como listas JSON nos artigos) */
  async taxonomy() {
    const rows: { tags: string | null; categories: string | null; status: string }[] = await this.db.query(
      'SELECT tags_json tags, categories_json categories, status FROM articles WHERE deleted_at IS NULL',
    );
    const count = (field: 'tags' | 'categories') => {
      const map = new Map<string, { name: string; count: number; published: number }>();
      for (const r of rows) {
        let list: string[] = [];
        try { list = typeof r[field] === 'string' ? JSON.parse(r[field] as string) : (r[field] as unknown as string[]) ?? []; } catch { /* ignora */ }
        for (const name of list) {
          const item = map.get(name) ?? { name, count: 0, published: 0 };
          item.count++;
          if (r.status === 'PUBLISHED') item.published++;
          map.set(name, item);
        }
      }
      return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    };
    return { categories: count('categories'), tags: count('tags') };
  }

  /** Renomeia (ou funde, se o destino já existir) uma categoria/tag em todos os artigos */
  async renameTerm(dto: RenameTermDto, user: JwtPayload) {
    const to = dto.to.trim();
    if (!to) throw new BadRequestException('Nome inválido');
    const affected = await this.rewrite(dto.type, (list) => (list.includes(dto.from) ? [...new Set(list.map((t) => (t === dto.from ? to : t)))] : null));
    this.audit.log({ userId: user.sub, action: `taxonomy.${dto.type}.rename`, metadata: { from: dto.from, to, affected } });
    return { affected };
  }

  async deleteTerm(dto: DeleteTermDto, user: JwtPayload) {
    const affected = await this.rewrite(dto.type, (list) => (list.includes(dto.name) ? list.filter((t) => t !== dto.name) : null));
    this.audit.log({ userId: user.sub, action: `taxonomy.${dto.type}.delete`, metadata: { name: dto.name, affected } });
    return { affected };
  }

  private async rewrite(type: 'category' | 'tag', fn: (list: string[]) => string[] | null) {
    const col = type === 'category' ? 'categories_json' : 'tags_json';
    const rows: { id: string; v: string | null }[] = await this.db.query(`SELECT id, ${col} v FROM articles WHERE deleted_at IS NULL`);
    let affected = 0;
    for (const r of rows) {
      let list: string[] = [];
      try { list = typeof r.v === 'string' ? JSON.parse(r.v) : (r.v as unknown as string[]) ?? []; } catch { continue; }
      const next = fn(list);
      if (next) {
        await this.db.query(`UPDATE articles SET ${col} = ? WHERE id = ?`, [JSON.stringify(next), r.id]);
        affected++;
      }
    }
    return affected;
  }

  async activity(page = 1, limit = 50) {
    const rows = await this.db.query(
      `SELECT l.id, l.action, l.resource_type resourceType, l.resource_id resourceId, l.metadata, l.ip_anonymized ip, l.created_at createdAt,
              p.display_name userName
         FROM audit_logs l LEFT JOIN user_profiles p ON p.user_id = l.user_id
        ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
      [limit, (Math.max(1, page) - 1) * limit],
    );
    const [{ total }] = await this.db.query('SELECT COUNT(*) total FROM audit_logs');
    return { items: rows.map((r: Record<string, unknown>) => ({ ...r, id: n(r.id) })), total: n(total), page, limit };
  }
}

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get('metrics')
  @Roles(UserRole.ADMIN, UserRole.AUTHOR)
  @ApiOperation({ summary: '[Admin] Indicadores do dashboard (?days=7|30|90)' })
  metrics(@Query('days') days = '30') {
    const d = [7, 30, 90, 365].includes(parseInt(days)) ? parseInt(days) : 30;
    return this.service.metrics(d);
  }

  @Get('taxonomy')
  @Roles(UserRole.ADMIN, UserRole.AUTHOR)
  taxonomy() {
    return this.service.taxonomy();
  }

  @Post('taxonomy/rename')
  @Roles(UserRole.ADMIN)
  rename(@Body() dto: RenameTermDto, @CurrentUser() user: JwtPayload) {
    return this.service.renameTerm(dto, user);
  }

  @Post('taxonomy/delete')
  @Roles(UserRole.ADMIN)
  remove(@Body() dto: DeleteTermDto, @CurrentUser() user: JwtPayload) {
    return this.service.deleteTerm(dto, user);
  }

  @Get('activity')
  @Roles(UserRole.ADMIN)
  activity(@Query('page') page = '1') {
    return this.service.activity(parseInt(page) || 1);
  }
}

@Module({
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
