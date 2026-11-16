import { Injectable, BadRequestException, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import sharp from 'sharp';
import { FileAsset } from './entities/file-asset.entity';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AuditService } from '../audit/audit.service';

export type MediaKind = 'image' | 'video' | 'audio' | 'document';

interface Detected { mime: string; kind: MediaKind; ext: string }

/** Detecta o tipo REAL pelo conteúdo (assinatura/magic bytes), ignorando nome e Content-Type enviados */
export function detectFileType(buf: Buffer): Detected | null {
  const hex = (start: number, len: number) => buf.subarray(start, start + len).toString('hex');
  const ascii = (start: number, len: number) => buf.subarray(start, start + len).toString('latin1');
  if (buf.length < 12) return null;
  if (hex(0, 3) === 'ffd8ff') return { mime: 'image/jpeg', kind: 'image', ext: 'jpg' };
  if (hex(0, 8) === '89504e470d0a1a0a') return { mime: 'image/png', kind: 'image', ext: 'png' };
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return { mime: 'image/gif', kind: 'image', ext: 'gif' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return { mime: 'image/webp', kind: 'image', ext: 'webp' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return { mime: 'audio/wav', kind: 'audio', ext: 'wav' };
  if (ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4);
    if (/^(M4A |M4B )/.test(brand)) return { mime: 'audio/mp4', kind: 'audio', ext: 'm4a' };
    if (/^(avif|avis|heic|heix|mif1)/.test(brand)) return null; // formatos de imagem não suportados
    return { mime: 'video/mp4', kind: 'video', ext: 'mp4' };
  }
  if (hex(0, 4) === '1a45dfa3') return { mime: 'video/webm', kind: 'video', ext: 'webm' };
  if (ascii(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { mime: 'audio/mpeg', kind: 'audio', ext: 'mp3' };
  if (ascii(0, 4) === 'OggS') return { mime: 'audio/ogg', kind: 'audio', ext: 'ogg' };
  if (ascii(0, 5) === '%PDF-') return { mime: 'application/pdf', kind: 'document', ext: 'pdf' };
  return null;
}

export interface UploadMeta {
  title?: string; altText?: string; caption?: string; credit?: string; sourceUrl?: string;
  aiGenerated?: boolean | string; aiPrompt?: string; aiModel?: string;
}

const clip = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly uploadDir: string;
  private readonly publicUrl: string;
  private readonly limits: Record<MediaKind, number>;

  constructor(
    @InjectRepository(FileAsset) private readonly assetsRepo: Repository<FileAsset>,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {
    this.uploadDir = path.resolve(config.get<string>('UPLOAD_DIR', './uploads'));
    this.publicUrl = config.get<string>('PUBLIC_UPLOAD_URL', '/uploads').replace(/\/$/, '');
    const mb = (key: string, def: number) => Number(config.get<string>(key, String(def))) * 1024 * 1024;
    this.limits = {
      image: mb('UPLOAD_MAX_SIZE_MB', 10),
      audio: mb('UPLOAD_MAX_AUDIO_MB', 30),
      video: mb('UPLOAD_MAX_VIDEO_MB', 100),
      document: mb('UPLOAD_MAX_DOC_MB', 20),
    };
    fs.mkdirSync(this.uploadDir, { recursive: true });
  }

  getUploadDir() { return this.uploadDir; }

  async upload(file: Express.Multer.File, user: JwtPayload, meta: UploadMeta = {}) {
    if (!file?.buffer?.length) throw new BadRequestException('Nenhum arquivo enviado');
    const detected = detectFileType(file.buffer);
    if (!detected) throw new BadRequestException('Tipo de arquivo não permitido (aceitos: JPG, PNG, WebP, GIF, MP4, WebM, MP3, WAV, OGG, M4A, PDF)');
    if (file.size > this.limits[detected.kind]) {
      throw new BadRequestException(`Arquivo excede o limite de ${Math.round(this.limits[detected.kind] / 1048576)} MB para ${detected.kind}`);
    }

    // Mesmo arquivo já enviado: reutiliza (não duplica a imagem a cada edição)
    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const existing = await this.assetsRepo.findOne({ where: { sha256 } });
    if (existing) {
      // Completa metadados vazios com os novos, sem sobrescrever os existentes
      let changed = false;
      for (const k of ['title', 'altText', 'caption', 'credit', 'sourceUrl'] as const) {
        const v = clip(meta[k], 500);
        if (v && !existing[k]) { (existing as unknown as Record<string, unknown>)[k] = v; changed = true; }
      }
      if (changed) await this.assetsRepo.save(existing);
      return { ...existing, duplicate: true };
    }

    const base = `${Date.now()}-${sha256.slice(0, 16)}`;
    const stored = await this.storeFile(file.buffer, detected, base);
    const asset = this.assetsRepo.create({
      filename: stored.filename,
      originalName: (file.originalname || stored.filename).slice(0, 255),
      mimeType: stored.mime,
      kind: detected.kind,
      size: stored.size,
      url: `${this.publicUrl}/${stored.filename}`,
      width: stored.width,
      height: stored.height,
      sha256,
      uploadedById: user.sub,
      title: clip(meta.title, 255),
      altText: clip(meta.altText, 300),
      caption: clip(meta.caption, 500),
      credit: clip(meta.credit, 200),
      sourceUrl: clip(meta.sourceUrl, 500),
      aiGenerated: meta.aiGenerated === true || meta.aiGenerated === 'true',
      aiPrompt: clip(meta.aiPrompt, 5000),
      aiModel: clip(meta.aiModel, 150),
    });
    const saved = await this.assetsRepo.save(asset);
    this.audit.log({ userId: user.sub, action: 'media.upload', resourceType: 'media', resourceId: saved.id, metadata: { kind: saved.kind, ai: saved.aiGenerated } });
    return saved;
  }

  /** Imagens viram WebP otimizado (GIF animado mantém animação); demais tipos são gravados como vieram */
  private async storeFile(buffer: Buffer, d: Detected, base: string) {
    if (d.kind === 'image') {
      const filename = `${base}.webp`;
      const out = path.join(this.uploadDir, filename);
      const info = await sharp(buffer, { animated: d.mime === 'image/gif' })
        .rotate()
        .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(out);
      return { filename, mime: 'image/webp', size: info.size, width: info.width, height: (info as { pageHeight?: number }).pageHeight ?? info.height };
    }
    const filename = `${base}.${d.ext}`;
    fs.writeFileSync(path.join(this.uploadDir, filename), buffer);
    return { filename, mime: d.mime, size: buffer.length, width: null as number | null, height: null as number | null };
  }

  async findAll(opts: { page?: number; limit?: number; kind?: string; q?: string; sort?: string; ai?: string }) {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 24));
    const qb = this.assetsRepo.createQueryBuilder('m');
    if (opts.kind && ['image', 'video', 'audio', 'document'].includes(opts.kind)) qb.andWhere('m.kind = :kind', { kind: opts.kind });
    if (opts.q) qb.andWhere('(m.original_name LIKE :q OR m.title LIKE :q OR m.alt_text LIKE :q OR m.caption LIKE :q)', { q: `%${opts.q}%` });
    if (opts.ai === 'true') qb.andWhere('m.ai_generated = 1');
    if (opts.ai === 'false') qb.andWhere('m.ai_generated = 0');
    if (opts.sort === 'oldest') qb.orderBy('m.createdAt', 'ASC');
    else if (opts.sort === 'name') qb.orderBy('m.originalName', 'ASC');
    else if (opts.sort === 'size') qb.orderBy('m.size', 'DESC');
    else qb.orderBy('m.createdAt', 'DESC');
    const [items, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const a = await this.assetsRepo.findOne({ where: { id } });
    if (!a) throw new NotFoundException('Arquivo não encontrado');
    return a;
  }

  async updateMeta(id: number, data: UploadMeta & { originalName?: string }, user: JwtPayload) {
    const a = await this.findOne(id);
    if (data.originalName !== undefined) a.originalName = clip(data.originalName, 255) ?? a.originalName;
    if (data.title !== undefined) a.title = clip(data.title, 255);
    if (data.altText !== undefined) a.altText = clip(data.altText, 300);
    if (data.caption !== undefined) a.caption = clip(data.caption, 500);
    if (data.credit !== undefined) a.credit = clip(data.credit, 200);
    if (data.sourceUrl !== undefined) a.sourceUrl = clip(data.sourceUrl, 500);
    const saved = await this.assetsRepo.save(a);
    this.audit.log({ userId: user.sub, action: 'media.update', resourceType: 'media', resourceId: id });
    return saved;
  }

  /** Onde o arquivo é usado (conteúdo, capa, Open Graph, quadro de evidências) */
  async usage(id: number) {
    const a = await this.findOne(id);
    const needle = `%${a.filename}%`;
    const rows: { id: string; title: string; slug: string; status: string; inContent: number; inCover: number; inOg: number; inBoard: number }[] =
      await this.assetsRepo.query(
        `SELECT id, title, slug, status,
                (content_html LIKE ? OR content_json LIKE ?) inContent, (cover_url LIKE ?) inCover,
                (og_image_url LIKE ?) inOg, (evidences_json LIKE ?) inBoard
           FROM articles
          WHERE deleted_at IS NULL
            AND (content_html LIKE ? OR content_json LIKE ? OR cover_url LIKE ? OR og_image_url LIKE ? OR evidences_json LIKE ?
                 OR timeline_json LIKE ? OR attachments_json LIKE ?)`,
        [needle, needle, needle, needle, needle, needle, needle, needle, needle, needle, needle, needle],
      );
    return rows.map((r) => ({
      id: Number(r.id), title: r.title, slug: r.slug, status: r.status,
      fields: [r.inContent && 'conteúdo', r.inCover && 'capa', r.inOg && 'Open Graph', r.inBoard && 'quadro de evidências'].filter(Boolean),
    }));
  }

  async remove(id: number, user: JwtPayload, force = false): Promise<void> {
    const asset = await this.findOne(id);
    const used = await this.usage(id);
    if (used.length && !force) {
      throw new ConflictException({ message: `Arquivo em uso em ${used.length} artigo(s). Confirme para excluir mesmo assim.`, usage: used });
    }
    const filePath = path.join(this.uploadDir, asset.filename);
    if (filePath.startsWith(this.uploadDir) && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await this.assetsRepo.remove(asset);
    this.audit.log({ userId: user.sub, action: 'media.delete', resourceType: 'media', resourceId: id, metadata: { force, usedIn: used.length } });
  }

  /** Troca o arquivo mantendo o mesmo endereço (os artigos que o usam continuam funcionando) */
  async replace(id: number, file: Express.Multer.File, user: JwtPayload) {
    const asset = await this.findOne(id);
    const detected = detectFileType(file?.buffer ?? Buffer.alloc(0));
    if (!detected) throw new BadRequestException('Tipo de arquivo não permitido');
    if (detected.kind !== asset.kind) throw new BadRequestException(`O novo arquivo precisa ser do mesmo tipo (${asset.kind})`);
    if (file.size > this.limits[detected.kind]) throw new BadRequestException('Arquivo excede o limite de tamanho');
    const currentExt = path.extname(asset.filename).slice(1);
    if (detected.kind !== 'image' && currentExt !== detected.ext) {
      throw new BadRequestException(`Para manter o endereço, envie um arquivo .${currentExt}`);
    }
    const base = asset.filename.replace(/\.[^.]+$/, '');
    const stored = await this.storeFile(file.buffer, detected, base);
    asset.size = stored.size;
    asset.width = stored.width;
    asset.height = stored.height;
    asset.mimeType = stored.mime;
    asset.sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const saved = await this.assetsRepo.save(asset);
    this.audit.log({ userId: user.sub, action: 'media.replace', resourceType: 'media', resourceId: id });
    return saved;
  }

  async stats() {
    const rows: { kind: string; n: string; bytes: string; ai: string }[] = await this.assetsRepo.query(
      'SELECT kind, COUNT(*) n, COALESCE(SUM(size),0) bytes, SUM(ai_generated) ai FROM file_assets GROUP BY kind',
    );
    const byKind: Record<string, { count: number; bytes: number }> = {};
    let count = 0, bytes = 0, ai = 0;
    for (const r of rows) {
      byKind[r.kind] = { count: Number(r.n), bytes: Number(r.bytes) };
      count += Number(r.n); bytes += Number(r.bytes); ai += Number(r.ai || 0);
    }
    return { count, bytes, aiGenerated: ai, byKind };
  }
}
