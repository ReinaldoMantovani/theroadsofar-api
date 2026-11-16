import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
  Put,
  Query,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, MinLength, MaxLength, IsIn } from 'class-validator';
import { CommentsService } from './comments.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

class CommentStatusDto {
  @IsIn(['PENDING', 'APPROVED', 'REJECTED']) status!: 'PENDING' | 'APPROVED' | 'REJECTED';
}

class CreateCommentDto {
  @IsString() @MinLength(1) @MaxLength(1000) content!: string;
}

@ApiTags('comments')
@UseGuards(JwtAuthGuard, RolesGuard) // sem guard o autor ficava null e o comentário virava 'Visitante' pendente
@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('admin')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Comentários para moderação' })
  moderation(@Query('status') status?: string, @Query('page') page = '1') {
    return this.commentsService.findForModeration(status, parseInt(page) || 1);
  }

  @Put(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Aprovar/rejeitar comentário' })
  setStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: CommentStatusDto) {
    return this.commentsService.setStatus(id, dto.status as never);
  }

  @Public()
  @Get('article/:articleId')
  @ApiOperation({ summary: 'Lista comentários de um artigo' })
  findByArticle(@Param('articleId', ParseIntPipe) articleId: number) {
    return this.commentsService.findByArticle(articleId);
  }

  @Post('article/:articleId')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // 10 comentários por minuto
  @ApiOperation({ summary: 'Adiciona comentário (autenticado)' })
  async create(
    @Param('articleId', ParseIntPipe) articleId: number,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip ?? '';
    return this.commentsService.create({ articleId, content: dto.content }, user, ip);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove comentário (próprio ou admin)' })
  async delete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    const isAdmin = (user.roles ?? []).includes(UserRole.ADMIN);
    await this.commentsService.delete(id, user.sub, isAdmin);
  }
}
