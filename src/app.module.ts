import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { MediaModule } from './modules/media/media.module';
import { CommentsModule } from './modules/comments/comments.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { AuditModule } from './modules/audit/audit.module';
import { AdminModule } from './modules/admin/admin.module';
import { AiModule } from './modules/ai/ai.module';
import { ReportsModule } from './modules/reports/reports.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { typeOrmConfig } from './config/typeorm.config';
import { DbTimezone } from './common/database/db-timezone';

@Module({
  imports: [
    // Configuração global via .env
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // TypeORM com MySQL
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: typeOrmConfig,
    }),

    // Rate limiting global
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL', 60) * 1000,
          limit: config.get<number>('THROTTLE_LIMIT', 100),
        },
      ],
    }),

    // Agendamento (cron jobs para artigos)
    ScheduleModule.forRoot(),

    // Módulos de negócio
    AuthModule,
    UsersModule,
    ArticlesModule,
    MediaModule,
    CommentsModule,
    SchedulerModule,
    AuditModule,
    AdminModule,
    AiModule,
    ReportsModule,
    EngagementModule,
  ],
  providers: [
    // Rate limiting em todas as rotas (o módulo estava configurado mas nenhum guard o aplicava)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    DbTimezone,
  ],
})
export class AppModule {}
