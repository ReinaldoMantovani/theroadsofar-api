import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'usuario@email.com' })
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @ApiProperty({ example: 'MinhaSenh@123' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}
