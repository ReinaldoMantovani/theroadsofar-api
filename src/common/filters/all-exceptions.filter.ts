import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Erro interno do servidor';

    // Log do erro (sem stack em produção)
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} — ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} — ${status}`);
    }

    // Campos extras de exceções (ex.: conflito de versão no editor) vão em "details"
    let details: Record<string, unknown> | undefined;
    if (message && typeof message === 'object') {
      const { statusCode: _s, message: _m, error: _e, ...rest } = message as Record<string, unknown>;
      if (Object.keys(rest).length) details = rest;
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message:
        typeof message === 'object' && 'message' in (message as object)
          ? (message as { message: string }).message
          : message,
      ...(details ? { details } : {}),
    });
  }
}
