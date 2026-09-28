import { HttpService } from '@nestjs/axios';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface XPaymentsCheckoutInput {
  amountCents: number;
  currency: string;
  reference: string;
  customerEmail?: string | null;
  metadata?: Record<string, unknown>;
}

export interface XPaymentsCheckoutResult {
  sessionId: string;
  checkoutUrl: string;
  storeCode?: string;
  expiresAt?: string;
}

@Injectable()
export class XPaymentsService {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async createCheckout(input: XPaymentsCheckoutInput): Promise<XPaymentsCheckoutResult> {
    const apiKey = this.config.get<string>('XPAYMENTS_API_KEY')?.trim();
    const baseUrl = (
      this.config.get<string>('XPAYMENTS_BASE_URL') ??
      'https://api.xpayments.digital/api/v1'
    ).replace(/\/$/, '');

    if (!apiKey) {
      throw new ServiceUnavailableException('XPAYMENTS_API_KEY não configurada.');
    }

    const response = await firstValueFrom(
      this.http.post(
        `${baseUrl}/checkout/session`,
        {
          amount: input.amountCents,
          currency: input.currency.toUpperCase(),
          reference: input.reference,
          customerEmail: input.customerEmail ?? undefined,
          metadata: input.metadata ?? {},
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        },
      ),
    );

    const data = response.data?.data;
    if (!response.data?.success || !data?.sessionId || !data?.checkoutUrl) {
      throw new ServiceUnavailableException('Resposta inválida do XPAYMENTS checkout.');
    }

    return {
      sessionId: String(data.sessionId),
      checkoutUrl: String(data.checkoutUrl),
      storeCode: data.storeCode ? String(data.storeCode) : undefined,
      expiresAt: data.expiresAt ? String(data.expiresAt) : undefined,
    };
  }

  webhookSecret(): string | undefined {
    return this.config.get<string>('XPAYMENTS_WEBHOOK_SECRET')?.trim() || undefined;
  }
}
