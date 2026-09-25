import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IntegrationCredentialType,
  IntegrationInboundAuthMode,
  Prisma,
} from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { IntegrationRegistryService } from './integration-registry.service';
import type { AgentGatewayRequest, AgentPrincipal } from './agent-auth.types';

const SIGNATURE_PATTERN = /^[a-f0-9]{64}$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AgentGatewayAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationRegistryService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AgentGatewayRequest>();

    const service =
      this.header(request, 'x-atc-service') ||
      this.header(request, 'x-mtx-service');
    const userId =
      this.header(request, 'x-atc-user-id') ||
      this.header(request, 'x-mtx-user-id');
    const timestampRaw =
      this.header(request, 'x-atc-timestamp') ||
      this.header(request, 'x-mtx-timestamp');
    const scopeRaw =
      this.header(request, 'x-atc-scope') ||
      this.header(request, 'x-mtx-scope');
    const requestId =
      this.header(request, 'x-atc-request-id') ||
      this.header(request, 'x-mtx-request-id');
    const signature =
      this.header(request, 'x-atc-signature') ||
      this.header(request, 'x-mtx-signature');

    if (!service || !userId || !timestampRaw || !scopeRaw || !requestId) {
      throw new UnauthorizedException('INVALID_AGENT_GATEWAY_HEADERS');
    }

    const application = await this.integrations.getApplication(service);

    if (application.inboundAuthMode === IntegrationInboundAuthMode.vercel_oidc) {
      throw new ServiceUnavailableException(
        'VERCEL_OIDC_NOT_YET_ENABLED_FOR_AGENT_GATEWAY',
      );
    }

    if (application.inboundAuthMode === IntegrationInboundAuthMode.jwt) {
      throw new ServiceUnavailableException(
        'JWT_NOT_YET_ENABLED_FOR_AGENT_GATEWAY',
      );
    }

    if (application.inboundAuthMode !== IntegrationInboundAuthMode.hmac_sha256) {
      throw new ForbiddenException('AGENT_GATEWAY_AUTH_MODE_NOT_ALLOWED');
    }

    if (!signature) {
      throw new UnauthorizedException('INVALID_AGENT_GATEWAY_HEADERS');
    }

    if (!UUID_PATTERN.test(userId)) {
      throw new UnauthorizedException('INVALID_AGENT_GATEWAY_USER');
    }

    const timestamp = Number(timestampRaw);
    const maxSkew = Number(
      this.config.get<string>('AGENT_GATEWAY_MAX_SKEW_SECONDS') ?? '90',
    );

    if (
      !Number.isInteger(timestamp) ||
      Math.abs(Math.floor(Date.now() / 1000) - timestamp) > maxSkew
    ) {
      throw new UnauthorizedException('STALE_AGENT_GATEWAY_REQUEST');
    }

    const scopes = new Set(
      scopeRaw
        .split(/[ ,]+/)
        .map((scope) => scope.trim())
        .filter(Boolean),
    );

    const requiredScope =
      this.config.get<string>('AGENT_GATEWAY_SCOPE') ?? 'agent:access';

    if (!scopes.has(requiredScope)) {
      throw new ForbiddenException('AGENT_GATEWAY_SCOPE_NOT_ALLOWED');
    }

    if (
      requestId.length < 8 ||
      requestId.length > 200 ||
      !SIGNATURE_PATTERN.test(signature)
    ) {
      throw new UnauthorizedException('INVALID_AGENT_GATEWAY_HEADERS');
    }

    const pathname = new URL(
      request.originalUrl || request.url,
      'http://atendimento.local',
    ).pathname;

    const canonical = [
      request.method.toUpperCase(),
      pathname,
      service,
      userId,
      String(timestamp),
      [...scopes].sort().join(' '),
      requestId,
    ].join('\n');

    const secret = await this.integrations.getCredential(
      application.id,
      IntegrationCredentialType.inbound_hmac,
    );

    const expected = createHmac('sha256', secret)
      .update(canonical)
      .digest('hex');

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
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new UnauthorizedException('AGENT_GATEWAY_REPLAY_DETECTED');
      }
      throw error;
    }

    const principal: AgentPrincipal = {
      service,
      userId,
      scopes,
      requestId,
      productKey: application.key,
    };

    request.agentPrincipal = principal;
    return true;
  }

  private header(request: AgentGatewayRequest, name: string): string {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0]?.trim() ?? '' : value?.trim() ?? '';
  }
}
