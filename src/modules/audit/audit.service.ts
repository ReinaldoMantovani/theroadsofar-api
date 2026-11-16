import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export interface AuditParams {
  userId?: number;
  action: string;
  resourceType?: string;
  resourceId?: string | number;
  ip?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly logsRepo: Repository<AuditLog>,
  ) {}

  // Registra de forma assíncrona (não bloqueia a requisição)
  log(params: AuditParams): void {
    setImmediate(async () => {
      try {
        const log = this.logsRepo.create({
          userId: params.userId ?? null,
          action: params.action,
          resourceType: params.resourceType ?? null,
          resourceId: params.resourceId?.toString() ?? null,
          ipAnonymized: params.ip ? this.anonymizeIp(params.ip) : null,
          metadata: params.metadata ?? null,
        });
        await this.logsRepo.save(log);
      } catch {
        // Nunca falhar a requisição por causa de log
      }
    });
  }

  // Anonimizar IP: remove último octeto IPv4 ou últimos grupos IPv6
  private anonymizeIp(ip: string): string {
    if (ip.includes('.')) {
      const parts = ip.split('.');
      parts[3] = 'xxx';
      return parts.join('.');
    }
    if (ip.includes(':')) {
      const parts = ip.split(':');
      return parts.slice(0, 4).join(':') + ':xxxx';
    }
    return 'unknown';
  }
}
