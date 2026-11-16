import {
  Controller, Get, Post, Put, Delete, Patch,
  Body, Param, Query, ParseIntPipe, UseGuards,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ArticlesService } from './articles.service';
import { CreateArticleDto, UpdateArticleDto, ArticleQueryDto, BulkActionDto, SnapshotDto, BoardDto } from './dto/create-article.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserRole } from '../users/entities/user.entity';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('articles')
@Controller('articles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  // ── Rotas públicas ────────────────────────────────────────────────
  @Public()
  @Get()
  @ApiOperation({ summary: 'Listar artigos publicados' })
  findAll(@Query() query: ArticleQueryDto) {
    return this.articlesService.findPublished(query);
  }

  @Public()
  @Get('map/cases')
  @ApiOperation({ summary: 'Casos publicados (Arquivo de Casos / mapa)' })
  mapCases() {
    return this.articlesService.findMapCases();
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Buscar artigo por slug' })
  findBySlug(@Param('slug') slug: string) {
    return this.articlesService.findBySlug(slug);
  }

  @Public()
  @Post(':id/share')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Incrementar contador de compartilhamento' })
  share(@Param('id', ParseIntPipe) id: number) {
    return this.articlesService.incrementShare(id);
  }

  // ── Rotas administrativas ─────────────────────────────────────────
  @Get('admin/all')
  @Roles(UserRole.ADMIN, UserRole.AUTHOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Listar todos os artigos' })
  findAllAdmin(@Query() query: ArticleQueryDto) {
    return this.articlesService.findAllAdmin(query);
  }

  @Post('admin/bulk')
  @Roles(UserRole.ADMIN, UserRole.AUTHOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Ações em lote (publicar, rascunho, revisão, arquivar, lixeira, restaurar, excluir)' })
  bulk(@Body() dto: BulkActionDto, @CurrentUser() user: JwtPayload) {
    return this.articlesService.bulk(dto, user);
  }

  @Get('admin/:id/revisions')
  @Roles(UserRole.ADMIN, UserRole.AUTHOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Histórico de revisões' })
  revisions(@Param('id', ParseIntPipe) id: number) {
    return this.articlesService.listRevisions(id);
  }

  @Post('admin/:id/revisions')
  @Roles(UserRole.ADMIN, UserRole.AUTHOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Grava o estado atual como revisão (ex.: antes da IA)' })
  snapshot(@Param('id', ParseIntPipe) id: number, @Body() dto: SnapshotDto, @CurrentUser() user: JwtPayload) {
    return this.articlesService.snapshot(id, dto.reason, user);
  }

  @Get('admin/:id/revisions/:revId')
  @Roles(UserRole.ADMIN, UserRole.AUTHOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Conteúdo de uma revisão' })
  revision(@Param('id', ParseIntPipe) id: number, @Param('revId', ParseIntPipe) revId: number) {
    return this.articlesService.getRevision(id, revId);
  }

  @Post('admin/:id/revisions/:revId/restore')
  @Roles(UserRole.ADMIN, UserRole.AUTHOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Restaurar revisão' })
  restore(@Param('id', ParseIntPipe) id: number, @Param('revId', ParseIntPipe) revId: number, @CurrentUser() user: JwtPayload) {
    return this.articlesService.restoreRevision(id, revId, user);
  }

  @Post('admin/:id/duplicate')
  @Roles(UserRole.ADMIN, UserRole.AUTHOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Duplicar artigo' })
  duplicate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.articlesService.duplicate(id, user);
  }

  @Put('admin/:id/board')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Salvar quadro de investigação (somente evidências)' })
  saveBoard(@Param('id', ParseIntPipe) id: number, @Body() dto: BoardDto, @CurrentUser() user: JwtPayload) {
    return this.articlesService.saveBoard(id, dto.evidences, user);
  }

  @Get('admin/:id')
  @Roles(UserRole.ADMIN, UserRole.AUTHOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Buscar artigo por ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.articlesService.findOneAdmin(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.AUTHOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Criar artigo' })
  create(@Body() dto: CreateArticleDto, @CurrentUser() user: JwtPayload) {
    return this.articlesService.create(dto, user);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.AUTHOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Atualizar artigo' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateArticleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.articlesService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Excluir artigo (soft delete)' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.articlesService.remove(id, user);
  }
}
