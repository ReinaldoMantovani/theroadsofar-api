import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';
import * as fs from 'fs';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'verbose'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3001);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const corsOrigins = config.get<string>('CORS_ORIGINS', '').split(',').filter(Boolean);

  // Helmet: cabeçalhos de segurança HTTP
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Compressão gzip
  app.use(compression());

  // Arquivos enviados pela biblioteca de mídia (imagens, vídeos, áudios, PDFs)
  const uploadDir = path.resolve(config.get<string>('UPLOAD_DIR', './uploads'));
  fs.mkdirSync(uploadDir, { recursive: true });
  app.useStaticAssets(uploadDir, {
    prefix: '/uploads/',
    maxAge: '7d',
    index: false,
    dotfiles: 'deny',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });

  // CORS configurado por variável de ambiente
  app.enableCors({
    origin: nodeEnv === 'development' ? true : corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Prefixo global da API
  app.setGlobalPrefix('api/v1');

  // Validação global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Filtro global de exceções
  app.useGlobalFilters(new AllExceptionsFilter());

  // Interceptor de logging
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger (somente em desenvolvimento)
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('The Road So Far API')
      .setDescription('API do blog The Road So Far')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    logger.log(`Swagger disponível em http://localhost:${port}/api/docs`);
  }

  await app.listen(port);
  logger.log(`API rodando em http://localhost:${port}/api/v1`);
  logger.log(`Ambiente: ${nodeEnv}`);
}

bootstrap();
