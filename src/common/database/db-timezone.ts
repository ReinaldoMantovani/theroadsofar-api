import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Força UTC em todas as conexões do MySQL.
 *
 * A API grava datas em UTC (timezone: 'Z'), mas os valores padrão do banco
 * (created_at = CURRENT_TIMESTAMP) usavam o fuso do servidor MySQL — o que deixava
 * "criado em" e "atualizado em" com horas de diferença. Com a sessão em UTC, tudo fica coerente.
 */
@Injectable()
export class DbTimezone implements OnModuleInit {
  private readonly logger = new Logger(DbTimezone.name);
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async onModuleInit() {
    const pool = (this.ds.driver as unknown as { pool?: { on: (e: string, cb: (c: unknown) => void) => void; _allConnections?: { toArray?: () => unknown[] } } }).pool;
    if (!pool) return;
    const apply = (conn: unknown) => {
      (conn as { query: (sql: string, cb: (err: Error | null) => void) => void })
        .query("SET time_zone = '+00:00'", (err) => err && this.logger.warn(`Não foi possível ajustar o fuso: ${err.message}`));
    };
    pool.on('connection', apply);
    for (const c of pool._allConnections?.toArray?.() ?? []) apply(c);
  }
}
