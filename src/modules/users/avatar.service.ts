import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { UserProfile } from './entities/user-profile.entity';
import { detectFileType } from '../media/media.service';

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Foto de perfil: valida pelo conteúdo do arquivo (não pelo nome), corta em quadrado 400×400,
 * converte para WebP (remove metadados/EXIF) e guarda em <UPLOAD_DIR>/avatars.
 * A foto anterior do usuário é apagada para não acumular arquivos.
 */
@Injectable()
export class AvatarService {
  private readonly dir: string;
  private readonly publicUrl: string;

  constructor(
    config: ConfigService,
    @InjectRepository(UserProfile) private readonly profiles: Repository<UserProfile>,
  ) {
    this.dir = path.join(path.resolve(config.get<string>('UPLOAD_DIR', './uploads')), 'avatars');
    this.publicUrl = `${config.get<string>('PUBLIC_UPLOAD_URL', '/uploads').replace(/\/$/, '')}/avatars`;
  }

  async set(userId: number, file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('Envie uma imagem');
    if (file.size > AVATAR_MAX_BYTES) throw new BadRequestException('A imagem pode ter no máximo 5 MB');
    const type = detectFileType(file.buffer);
    if (!type || type.kind !== 'image') throw new BadRequestException('Formato não aceito: envie JPG, PNG, WebP ou GIF');

    let out: Buffer;
    try {
      out = await sharp(file.buffer, { animated: false }).rotate().resize(400, 400, { fit: 'cover', position: 'attention' }).webp({ quality: 85 }).toBuffer();
    } catch {
      throw new BadRequestException('Não foi possível ler esta imagem');
    }

    const profile = await this.profiles.findOne({ where: { user: { id: userId } } });
    if (!profile) throw new NotFoundException('Perfil não encontrado');

    fs.mkdirSync(this.dir, { recursive: true });
    const name = `u${userId}-${Date.now()}.webp`;
    fs.writeFileSync(path.join(this.dir, name), out);
    const previous = profile.avatarUrl;
    profile.avatarUrl = `${this.publicUrl}/${name}`;
    await this.profiles.save(profile);
    this.removeFile(previous);
    return profile.avatarUrl;
  }

  async remove(userId: number) {
    const profile = await this.profiles.findOne({ where: { user: { id: userId } } });
    if (!profile) throw new NotFoundException('Perfil não encontrado');
    const previous = profile.avatarUrl;
    profile.avatarUrl = null;
    await this.profiles.save(profile);
    this.removeFile(previous);
  }

  /** Só apaga arquivos da pasta de avatares (nunca algo fora dela) */
  private removeFile(url: string | null) {
    if (!url || !url.includes('/avatars/')) return;
    const base = path.basename(url.split('?')[0]);
    if (!/^u\d+-\d+\.webp$/.test(base)) return;
    fs.promises.unlink(path.join(this.dir, base)).catch(() => {});
  }
}
