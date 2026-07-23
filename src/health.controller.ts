import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  health(): Record<string, unknown> {
    return {
      success: true,
      service: 'Atendimento.Center Backend',
      version: process.env.npm_package_version ?? '0.1.0',
      status: 'ONLINE',
      timestamp: new Date().toISOString(),
    };
  }
}
