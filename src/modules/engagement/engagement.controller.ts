import { Controller, Get, Param, ParseIntPipe, Post, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { EngagementService } from './engagement.service';

/** Exige login: visitantes recebem 401 e o blog pede para entrar */
@ApiTags('engagement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Post('articles/:id/like')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Favoritar / desfavoritar artigo' })
  likeArticle(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.engagement.toggleArticleLike(id, Number(user.sub));
  }

  @Get('users/me/likes')
  @ApiOperation({ summary: 'Artigos favoritados pelo usuário' })
  myLikes(@CurrentUser() user: JwtPayload) {
    return this.engagement.myArticleLikes(Number(user.sub));
  }

  @Post('comments/:id/like')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Curtir / descurtir comentário' })
  likeComment(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.engagement.toggleCommentLike(id, Number(user.sub));
  }

  @Get('comments/article/:articleId/my-likes')
  @ApiOperation({ summary: 'Comentários do artigo curtidos pelo usuário' })
  myCommentLikes(@Param('articleId', ParseIntPipe) articleId: number, @CurrentUser() user: JwtPayload) {
    return this.engagement.myCommentLikes(articleId, Number(user.sub));
  }
}
