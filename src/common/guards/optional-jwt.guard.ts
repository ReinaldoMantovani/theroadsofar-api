import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Identifica o usuário se houver token válido; sem token (ou token inválido) segue como visitante. */
@Injectable()
export class OptionalJwtGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    if (!req.headers?.authorization) return true;
    return super.canActivate(context) as Promise<boolean>;
  }
  handleRequest<TUser = unknown>(_err: Error, user: TUser): TUser {
    return (user || null) as TUser;
  }
}
