import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  UseGuards,
  Query,
  Param,
  ParseIntPipe,
  ForbiddenException,
  Post,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { AvatarService, AVATAR_MAX_BYTES } from './avatar.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from './entities/user.entity';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  IsString,
  MinLength,
  IsOptional,
  MaxLength,
  IsUrl,
  IsArray,
  IsEnum,
  IsBoolean,
  ArrayMinSize,
} from 'class-validator';

class ChangePasswordDto {
  @IsString() @MinLength(1) currentPassword!: string;
  @IsString() @MinLength(8) @MaxLength(72) newPassword!: string;
}

class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) displayName?: string;
  @IsOptional() @IsString() @MaxLength(500) bio?: string;
  @IsOptional() @IsUrl() @MaxLength(255) websiteUrl?: string;
}

class AdminUpdateUserDto {
  @IsOptional() @IsArray() @ArrayMinSize(1) @IsEnum(UserRole, { each: true }) roles?: UserRole[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard) // sem isto request.user ficava vazio e /users/me retornava 500
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService, private readonly avatars: AvatarService) {}

  @Get('admin/list')
  @Roles(UserRole.ADMIN)
  async adminList(@Query('q') q?: string, @Query('page') page = '1') {
    return this.usersService.adminList(q, parseInt(page) || 1);
  }

  @Put('admin/:id')
  @Roles(UserRole.ADMIN)
  async adminUpdate(@Param('id', ParseIntPipe) id: number, @Body() dto: AdminUpdateUserDto, @CurrentUser() me: JwtPayload) {
    if (Number(id) === Number(me.sub)) {
      if (dto.isActive === false) throw new ForbiddenException('Você não pode desativar a própria conta');
      if (dto.roles && !dto.roles.includes(UserRole.ADMIN)) throw new ForbiddenException('Você não pode remover seu próprio acesso de administrador');
    }
    return this.usersService.adminUpdate(id, dto, me.sub);
  }

  @Get('me')
  async getMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.getMe(user.sub);
  }

  @Get('me/export')
  async exportData(@CurrentUser() user: JwtPayload) {
    return this.usersService.exportData(user.sub);
  }

  @Put('me/profile')
  async updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    await this.usersService.updateProfile(user.sub, dto);
    return this.usersService.getMe(user.sub);
  }

  @Post('me/avatar')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } }))
  async uploadAvatar(@CurrentUser() user: JwtPayload, @UploadedFile() file: Express.Multer.File) {
    await this.avatars.set(Number(user.sub), file);
    return this.usersService.getMe(user.sub);
  }

  @Delete('me/avatar')
  async removeAvatar(@CurrentUser() user: JwtPayload) {
    await this.avatars.remove(Number(user.sub));
    return this.usersService.getMe(user.sub);
  }

  @Put('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    const fullUser = await this.usersService.findByEmail(user.email);
    if (!fullUser) throw new UnauthorizedException();

    const valid = await bcrypt.compare(dto.currentPassword, fullUser.passwordHash);
    if (!valid) throw new UnauthorizedException('Senha atual incorreta');

    await this.usersService.changePassword(user.sub, dto.newPassword);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMe(@CurrentUser() user: JwtPayload) {
    await this.usersService.softDelete(user.sub);
  }
}
