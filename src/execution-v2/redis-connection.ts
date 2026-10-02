import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

export function createAtlasRedis(
  config: ConfigService,
): IORedis {
  const url = config.get<string>('ATLAS_REDIS_URL')?.trim();

  if (!url) {
    throw new Error('ATLAS_REDIS_URL is not configured');
  }

  const parsed = new URL(url);
  if (!['redis:', 'rediss:'].includes(parsed.protocol) || parsed.pathname !== '/2') {
    throw new Error('Atlas Redis must use logical DB /2');
  }

  return new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 5000,
  });
}
