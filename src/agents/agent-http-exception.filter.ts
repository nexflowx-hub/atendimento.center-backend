import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AgentGatewayRequest } from './agent-auth.types';

@Catch()
export class AgentHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<AgentGatewayRequest>();
    const response = context.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const code = this.code(exception, status);
    const message =
      status >= 500 ? 'Agent request failed.' : this.message(exception, code);

    const headerRequestId = request.headers['x-mtx-request-id'];
    const requestId =
      request.agentPrincipal?.requestId ??
      (Array.isArray(headerRequestId) ? headerRequestId[0] : headerRequestId) ??
      null;

    response.status(status).json({
      error: {
        code,
        message,
        request_id: requestId,
      },
    });
  }

  private code(exception: unknown, status: number): string {
    if (!(exception instanceof HttpException)) return 'AGENT_INTERNAL_ERROR';

    const payload = exception.getResponse();
    if (typeof payload === 'string' && /^[A-Z0-9_]+$/.test(payload)) return payload;

    if (payload && typeof payload === 'object' && 'message' in payload) {
      const message = (payload as { message: unknown }).message;
      if (typeof message === 'string' && /^[A-Z0-9_]+$/.test(message)) return message;
      if (Array.isArray(message)) return 'VALIDATION_ERROR';
    }

    return `AGENT_HTTP_${status}`;
  }

  private message(exception: unknown, fallback: string): string {
    if (!(exception instanceof HttpException)) return fallback;
    const payload = exception.getResponse();
    if (typeof payload === 'string') return payload;

    if (payload && typeof payload === 'object' && 'message' in payload) {
      const message = (payload as { message: unknown }).message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join('; ');
    }

    return fallback;
  }
}
