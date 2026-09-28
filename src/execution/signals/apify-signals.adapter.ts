import { createHash } from 'crypto';

export interface ApifyCollectedItem {
  externalId?: string;
  itemType: string;
  canonicalUrl?: string;
  authorHandle?: string;
  publishedAt?: Date;
  metrics: Record<string, unknown>;
  payload: Record<string, unknown>;
  contentHash: string;
}

export class ApifySignalsAdapter {
  constructor(private readonly token: string) {}

  async collect(
    target: string,
    settings: Record<string, unknown>,
    params: Record<string, unknown>,
  ): Promise<ApifyCollectedItem[]> {
    const actorId = String(settings.actorId ?? '').trim();
    if (!actorId) throw new Error('Apify connector sem actorId.');

    const targetInputKey = String(settings.targetInputKey ?? 'directUrls');
    const inputDefaults =
      settings.inputDefaults && typeof settings.inputDefaults === 'object'
        ? (settings.inputDefaults as Record<string, unknown>)
        : {};

    const input: Record<string, unknown> = {
      ...inputDefaults,
      ...params,
    };

    input[targetInputKey] =
      targetInputKey === 'directUrls'
        ? [{ url: target }]
        : target;

    const runUrl =
      `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs` +
      `?token=${encodeURIComponent(this.token)}&waitForFinish=120`;

    const runResponse = await fetch(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(135_000),
    });

    const runPayload = (await runResponse.json()) as Record<string, any>;
    if (!runResponse.ok) {
      throw new Error(`Apify run falhou (HTTP ${runResponse.status}).`);
    }

    const datasetId = String(runPayload?.data?.defaultDatasetId ?? '').trim();
    if (!datasetId) throw new Error('Apify run terminou sem dataset.');

    const itemsResponse = await fetch(
      `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&token=${encodeURIComponent(this.token)}`,
      { signal: AbortSignal.timeout(60_000) },
    );

    if (!itemsResponse.ok) {
      throw new Error(`Apify dataset falhou (HTTP ${itemsResponse.status}).`);
    }

    const items = (await itemsResponse.json()) as unknown[];
    return items
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map(normalizeItem);
  }
}

function normalizeItem(item: Record<string, unknown>): ApifyCollectedItem {
  const canonicalUrl = firstString(
    item.url,
    item.postUrl,
    item.videoUrl,
    item.imageUrl,
    item.webVideoUrl,
  );

  const externalId = firstString(
    item.id,
    item.shortCode,
    item.shortcode,
    item.code,
    item.videoId,
  );

  const author =
    firstString(
      item.ownerUsername,
      item.username,
      item.authorUsername,
      item.channelUsername,
    ) ?? nestedString(item.author, 'username');

  const publishedRaw = firstString(
    item.timestamp,
    item.publishedAt,
    item.createTimeISO,
    item.date,
  );
  const publishedAt = publishedRaw ? safeDate(publishedRaw) : undefined;

  const metrics: Record<string, unknown> = {};
  for (const key of [
    'likesCount',
    'commentsCount',
    'viewsCount',
    'playCount',
    'sharesCount',
    'followersCount',
    'followingCount',
  ]) {
    if (item[key] !== undefined) metrics[key] = item[key];
  }

  const serialized = JSON.stringify(item);
  return {
    externalId,
    itemType: inferType(item),
    canonicalUrl,
    authorHandle: author,
    publishedAt,
    metrics,
    payload: item,
    contentHash: createHash('sha256').update(serialized).digest('hex'),
  };
}

function inferType(item: Record<string, unknown>): string {
  const raw = firstString(item.type, item.productType, item.mediaType);
  if (raw) return raw.toLowerCase();
  if (item.videoUrl || item.webVideoUrl) return 'video';
  if (item.imageUrl || item.displayUrl) return 'image';
  return 'post';
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return undefined;
}

function nestedString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return firstString((value as Record<string, unknown>)[key]);
}

function safeDate(value: string): Date | undefined {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
