export interface ProviderSubmitResult {
  orderReference: string;
  raw: unknown;
}

export interface ProviderStatusResult {
  status: string;
  startCount?: number | null;
  remains?: number | null;
  raw: unknown;
}

export class SmmPanelV2Adapter {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async submit(
    providerServiceId: string,
    target: string,
    quantity: number,
  ): Promise<ProviderSubmitResult> {
    const data = await this.call({
      action: 'add',
      service: providerServiceId,
      link: target,
      quantity: String(quantity),
    });

    const reference = String((data as Record<string, unknown>)?.order ?? '');
    if (!reference) {
      throw new Error('Provider SMM não devolveu order reference.');
    }

    return { orderReference: reference, raw: data };
  }

  async status(orderReference: string): Promise<ProviderStatusResult> {
    const data = await this.call({
      action: 'status',
      order: orderReference,
    });

    const row = data as Record<string, unknown>;
    return {
      status: String(row.status ?? 'unknown'),
      startCount: toNullableNumber(row.start_count),
      remains: toNullableNumber(row.remains),
      raw: data,
    };
  }

  async services(): Promise<unknown> {
    return this.call({ action: 'services' });
  }

  async balance(): Promise<unknown> {
    return this.call({ action: 'balance' });
  }

  private async call(params: Record<string, string>): Promise<unknown> {
    const body = new URLSearchParams({
      key: this.apiKey,
      ...params,
    });

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(20_000),
    });

    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Provider SMM devolveu resposta inválida (HTTP ${response.status}).`);
    }

    if (!response.ok) {
      throw new Error(`Provider SMM HTTP ${response.status}.`);
    }

    const error = (data as Record<string, unknown>)?.error;
    if (error) throw new Error(String(error));

    return data;
  }
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
