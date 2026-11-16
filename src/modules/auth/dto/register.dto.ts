import { IsEmail, IsString, MinLength, MaxLength, IsBoolean, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty()
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  displayName: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  // Qualquer símbolo conta (antes só @$!%*?& eram aceitos e '#', '-', '.' etc. eram recusados)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d\s]).+$/, {
    message: 'Senha fraca: use maiúsculas, minúsculas, número e símbolo',
  })
  password: string;

  @ApiProperty({ description: 'Aceite dos Termos de Uso' })
  @IsBoolean()
  consentTerms: boolean;

  @ApiProperty({ description: 'Aceite da Política de Privacidade' })
  @IsBoolean()
  consentPrivacy: boolean;
}
