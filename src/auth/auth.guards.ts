import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedHttpRequest } from './auth.types';
import { SupabaseAuthService } from './supabase-auth.service';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly auth: SupabaseAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedHttpRequest>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer token não fornecido.');
    }

    const accessToken = authorization.slice('Bearer '.length).trim();
    if (!accessToken) {
      throw new UnauthorizedException('Bearer token vazio.');
    }

    request.user = await this.auth.verifyAccessToken(accessToken);
    return true;
  }
}

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedHttpRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Utilizador não autenticado.');
    }

    const membership = await this.prisma.tenantUser.findFirst({
      where: {
        authUserId: user.id,
        active: true,
      },
      include: {
        tenant: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (!membership || !['trial', 'active'].includes(membership.tenant.status)) {
      throw new ForbiddenException('Utilizador sem tenant ativo no Atendimento.Center.');
    }

    request.membership = membership;
    request.tenant = membership.tenant;
    return true;
  }
}
