import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import type { AgentGatewayRequest, AgentPrincipal } from './agent-auth.types';

const SIGNATURE_PATTERN = /^[a-f0-9]{64}$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AgentGatewayAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AgentGatewayRequest>();
    const secret = this.config.get<string>('MYTRAINX_AGENT_SHARED_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException('Agent Gateway shared secret is not configured.');
    }

    const service = this.header(request, 'x-mtx-service');
    const userId = this.header(request, 'x-mtx-user-id');
    const timestampRaw = this.header(request, 'x-mtx-timestamp');
    const scopeRaw = this.header(request, 'x-mtx-scope');
    const requestId = this.header(request, 'x-mtx-request-id');
    const signature = this.header(request, 'x-mtx-signature');

    if (!service || !userId || !timestampRaw || !scopeRaw || !requestId || !signature) {
      throw new UnauthorizedException('INVALID_AGENT_GATEWAY_HEADERS');
    }

    const allowedService =
      this.config.get<string>('MYTRAINX_AGENT_GATEWAY_ALLOWED_SERVICE') ?? 'mytrainx';

    if (service !== allowedService) {
      throw new ForbiddenException('AGENT_GATEWAY_SERVICE_NOT_ALLOWED');
    }

    if (!UUID_PATTERN.test(userId)) {
      throw new UnauthorizedException('INVALID_AGENT_GATEWAY_USER');
    }

    const timestamp = Number(timestampRaw);
    const maxSkew =
      Number(this.config.get<string>('MYTRAINX_AGENT_GATEWAY_MAX_SKEW_SECONDS') ?? '90');

    if (!Number.isInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > maxSkew) {
      throw new UnauthorizedException('STALE_AGENT_GATEWAY_REQUEST');
    }

    const scopes = new Set(
      scopeRaw
        .split(/[ ,]+/)
        .map((scope) => scope.trim())
        .filter(Boolean),
    );

    const requiredScope =
      this.config.get<string>('MYTRAINX_AGENT_GATEWAY_SCOPE') ?? 'agent:access';
    if (!scopes.has(requiredScope)) {
      throw new ForbiddenException('AGENT_GATEWAY_SCOPE_NOT_ALLOWED');
    }

    if (requestId.length < 8 || requestId.length > 200 || !SIGNATURE_PATTERN.test(signature)) {
      throw new UnauthorizedException('INVALID_AGENT_GATEWAY_HEADERS');
    }

    const pathname = new URL(request.originalUrl || request.url, 'http://atendimento.local').pathname;
    const canonical = [
      request.method.toUpperCase(),
      pathname,
      service,
      userId,
      String(timestamp),
      [...scopes].sort().join(' '),
      requestId,
    ].join('\n');

    const expected = createHmac('sha256', secret).update(canonical).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = Buffer.from(signature, 'hex');

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new UnauthorizedException('INVALID_AGENT_GATEWAY_SIGNATURE');
    }

    try {
      await this.prisma.agentGatewayReplay.create({
        data: {
          requestId,
          service,
          userId,
          method: request.method.toUpperCase(),
          pathname,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new UnauthorizedException('AGENT_GATEWAY_REPLAY_DETECTED');
      }
      throw error;
    }

    const principal: AgentPrincipal = {
      service,
      userId,
      scopes,
      requestId,
      productKey: service,
    };
    request.agentPrincipal = principal;
    return true;
  }

  private header(request: AgentGatewayRequest, name: string): string {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0]?.trim() ?? '' : value?.trim() ?? '';
  }
}
