import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ArticlesService } from '../articles/articles.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly articlesService: ArticlesService) {}

  // Verificar artigos agendados a cada minuto
  @Cron(CronExpression.EVERY_MINUTE)
  async publishScheduledArticles(): Promise<void> {
    const count = await this.articlesService.publishScheduled();
    if (count > 0) {
      this.logger.log(`Publicados ${count} artigos agendados`);
    }
  }
}
