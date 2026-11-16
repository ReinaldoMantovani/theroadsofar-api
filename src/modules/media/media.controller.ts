import {
  Controller, Post, Get, Put, Delete, Param, ParseIntPipe, Body,
  UseInterceptors, UploadedFile, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { IsOptional, IsString, MaxLength, IsIn } from 'class-validator';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

/** Teto do multer (o limite real por tipo é aplicado no serviço) */
const MAX_UPLOAD_BYTES = 110 * 1024 * 1024;

class UploadMetaDto {
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() @MaxLength(300) altText?: string;
  @IsOptional() @IsString() @MaxLength(500) caption?: string;
  @IsOptional() @IsString() @MaxLength(200) credit?: string;
  @IsOptional() @IsString() @MaxLength(500) sourceUrl?: string;
  @IsOptional() @IsIn(['true', 'false']) aiGenerated?: string;
  @IsOptional() @IsString() @MaxLength(5000) aiPrompt?: string;
  @IsOptional() @IsString() @MaxLength(150) aiModel?: string;
}

class UpdateMediaDto {
  @IsOptional() @IsString() @MaxLength(255) originalName?: string;
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() @MaxLength(300) altText?: string;
  @IsOptional() @IsString() @MaxLength(500) caption?: string;
  @IsOptional() @IsString() @MaxLength(200) credit?: string;
  @IsOptional() @IsString() @MaxLength(500) sourceUrl?: string;
}

@ApiTags('media')
@Controller('media')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.AUTHOR)
@ApiBearerAuth()
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @ApiOperation({ summary: '[Admin] Upload (imagem, vídeo, áudio ou PDF)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(@UploadedFile() file: Express.Multer.File, @Body() meta: UploadMetaDto, @CurrentUser() user: JwtPayload) {
    return this.mediaService.upload(file, user, meta);
  }

  @Get()
  @ApiOperation({ summary: '[Admin] Biblioteca de mídia (filtros: kind, q, sort, ai)' })
  findAll(
    @Query('page') page = '1', @Query('limit') limit = '24', @Query('kind') kind?: string,
    @Query('q') q?: string, @Query('sort') sort?: string, @Query('ai') ai?: string,
  ) {
    return this.mediaService.findAll({ page: parseInt(page), limit: parseInt(limit), kind, q, sort, ai });
  }

  @Get('stats')
  @ApiOperation({ summary: '[Admin] Totais da biblioteca' })
  stats() {
    return this.mediaService.stats();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.mediaService.findOne(id);
  }

  @Get(':id/usage')
  @ApiOperation({ summary: '[Admin] Artigos que usam o arquivo' })
  usage(@Param('id', ParseIntPipe) id: number) {
    return this.mediaService.usage(id);
  }

  @Put(':id')
  @ApiOperation({ summary: '[Admin] Editar metadados (nome, alt, legenda, crédito, fonte)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMediaDto, @CurrentUser() user: JwtPayload) {
    return this.mediaService.updateMeta(id, dto, user);
  }

  @Put(':id/file')
  @ApiOperation({ summary: '[Admin] Substituir arquivo mantendo o endereço' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  replace(@Param('id', ParseIntPipe) id: number, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: JwtPayload) {
    return this.mediaService.replace(id, file, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Remover arquivo (bloqueia se estiver em uso, a menos que ?force=true)' })
  remove(@Param('id', ParseIntPipe) id: number, @Query('force') force: string, @CurrentUser() user: JwtPayload) {
    return this.mediaService.remove(id, user, force === 'true');
  }
}
