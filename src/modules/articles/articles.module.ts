import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';
import { Article } from './entities/article.entity';
import { ArticleRevision } from './entities/article-revision.entity';
import { SlugRedirect } from './entities/slug-redirect.entity';
import { ArticleDailyView } from './entities/article-daily-view.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Article, ArticleRevision, SlugRedirect, ArticleDailyView])],
  controllers: [ArticlesController],
  providers: [ArticlesService],
  exports: [ArticlesService],
})
export class ArticlesModule {}
