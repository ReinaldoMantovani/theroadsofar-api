import {
  IsString, IsOptional, IsEnum, IsArray, IsDateString, MaxLength, MinLength, IsBoolean, IsNumber, Min, Max,
  IsInt, IsIn, ValidateNested, ArrayMaxSize, IsObject, IsUrl, ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArticleStatus } from '../entities/article.entity';

export const REVISION_REASONS = ['autosave', 'manual', 'publish', 'ai_before', 'ai_after', 'restore'] as const;
export const CLASSIFICATIONS = ['publico', 'restrito', 'confidencial', 'oculto'] as const;

class TimelineEntryDto {
  @IsString() @MaxLength(100) period: string;
  @IsString() @MaxLength(200) title: string;
  @IsString() @MaxLength(2000) description: string;
  @IsOptional() @IsString() @MaxLength(500) mediaUrl?: string;
}

class AttachmentDto {
  @IsString() @MaxLength(200) label: string;
  @IsString() @MaxLength(500) url: string;
  @IsOptional() @IsString() @MaxLength(50) kind?: string;
}

class ConnectionDto {
  @IsOptional() @IsInt() articleId?: number;
  @IsOptional() @IsString() @MaxLength(191) slug?: string;
  @IsString() @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(200) relation?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

/** Campos comuns de criação/edição (painel admin) */
export class CreateArticleDto {
  @ApiProperty()
  @IsString() @MinLength(1) @MaxLength(200)
  title: string;

  @IsOptional() @IsString() @MaxLength(300)
  subtitle?: string | null;

  @IsOptional() @IsString() @MaxLength(191)
  slug?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  excerpt?: string | null;

  @ApiProperty({ description: 'HTML gerado pelo editor (será sanitizado)' })
  @IsString()
  contentHtml: string;

  @ApiPropertyOptional({ description: 'Documento do editor de blocos { schema, version, doc }' })
  @IsOptional() @IsObject()
  contentJson?: Record<string, unknown> | null;

  @IsOptional() @IsString() @MaxLength(500)
  coverUrl?: string | null;

  @IsOptional() @IsEnum(ArticleStatus)
  status?: ArticleStatus;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString()
  scheduledAt?: string | null;

  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(60, { each: true })
  tags?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(60, { each: true })
  categories?: string[];

  @IsOptional() @IsBoolean()
  featured?: boolean;

  // ── SEO ──────────────────────────────────────────────────────────
  @IsOptional() @IsString() @MaxLength(70) seoTitle?: string | null;
  @IsOptional() @IsString() @MaxLength(160) seoDescription?: string | null;
  @IsOptional() @IsString() @MaxLength(100) seoFocusKeyword?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(100, { each: true }) seoKeywords?: string[];
  @IsOptional() @ValidateIf((_, v) => !!v) @IsUrl({ require_protocol: true }) @MaxLength(500) canonicalUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(100) ogTitle?: string | null;
  @IsOptional() @IsString() @MaxLength(200) ogDescription?: string | null;
  @IsOptional() @IsString() @MaxLength(500) ogImageUrl?: string | null;
  @IsOptional() @IsIn(['summary', 'summary_large_image']) twitterCard?: string | null;
  @IsOptional() @IsBoolean() robotsIndex?: boolean;

  // ── Dossiê ───────────────────────────────────────────────────────
  @IsOptional() @IsIn(CLASSIFICATIONS) classificationLevel?: (typeof CLASSIFICATIONS)[number];
  @IsOptional() @IsString() @MaxLength(50) caseNumber?: string | null;
  @IsOptional() @IsString() @MaxLength(30) caseStatus?: string | null;
  @IsOptional() @IsString() @MaxLength(200) locationName?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(-90) @Max(90) latitude?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(-180) @Max(180) longitude?: number | null;
  @IsOptional() @IsString() @MaxLength(100) phenomenonType?: string | null;
  @IsOptional() @IsString() @MaxLength(150) entityName?: string | null;
  @IsOptional() @IsString() @MaxLength(100) eventDate?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) dossierSummary?: string | null;
  @IsOptional() @IsBoolean() isFiction?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(500, { each: true }) censoredSegments?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => TimelineEntryDto) timeline?: TimelineEntryDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => AttachmentDto) attachments?: AttachmentDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => ConnectionDto) connections?: ConnectionDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(150, { each: true }) inspirations?: string[];
  @IsOptional() @ValidateIf((_, v) => !!v) @IsUrl({ require_protocol: true }) @MaxLength(500) purchaseUrl?: string | null;

  // ── Controle do editor ───────────────────────────────────────────
  @ApiPropertyOptional({ description: 'Versão que o editor carregou; se o artigo mudou desde então a API responde 409' })
  @IsOptional() @IsInt() @Min(1)
  expectedVersion?: number;

  @IsOptional() @IsIn(REVISION_REASONS)
  saveReason?: (typeof REVISION_REASONS)[number];
}

export class UpdateArticleDto extends CreateArticleDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  declare title: string;

  @IsOptional() @IsString()
  declare contentHtml: string;
}

export class ArticleQueryDto {
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() limit?: string;
  @IsOptional() @IsString() tag?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(ArticleStatus) status?: ArticleStatus;
  @IsOptional() @IsIn(['createdAt', 'updatedAt', 'publishedAt', 'title', 'viewCount']) sort?: string;
  @IsOptional() @IsIn(['ASC', 'DESC', 'asc', 'desc']) order?: string;
  @IsOptional() @IsString() authorId?: string;
  @IsOptional() @IsIn(['true', 'false']) featured?: string;
  @IsOptional() @IsIn(['true', 'false']) hasCase?: string;
}

export class BulkActionDto {
  @IsArray() @ArrayMaxSize(200) @Type(() => Number) @IsInt({ each: true }) ids: number[];
  @IsIn(['publish', 'draft', 'review', 'archive', 'trash', 'restore', 'delete']) action: string;
}

export class SnapshotDto {
  @IsIn(REVISION_REASONS) reason: (typeof REVISION_REASONS)[number];
}

export class BoardDto {
  // Cada item é validado/sanitizado campo a campo no serviço
  @IsArray() @ArrayMaxSize(35) @Type(() => Object)
  evidences: Record<string, unknown>[];
}
