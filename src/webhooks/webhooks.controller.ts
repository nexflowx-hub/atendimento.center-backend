import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { XPaymentsService } from '../integrations/xpayments.service';

interface XPaymentsWebhookPayload {
  event?: string;
  transaction_id?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  status?: string;
  method?: string;
  timestamp?: string;
}

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xpayments: XPaymentsService,
  ) {}

  @Post('xpayments')
  @HttpCode(200)
  async xpaymentsWebhook(
    @Req() req: RawBodyRequest<object>,
    @Headers('x-nexflowx-signature') signature: string | undefined,
    @Body() body: XPaymentsWebhookPayload,
  ) {
    const secret = this.xpayments.webhookSecret();
    if (!secret) {
      throw new ServiceUnavailableException('XPAYMENTS_WEBHOOK_SECRET não configurado.');
    }

    const raw = req.rawBody;
    if (!raw || !signature) {
      throw new UnauthorizedException('Assinatura XPAYMENTS ausente.');
    }

    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const supplied = signature.trim();

    if (
      expected.length !== supplied.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
    ) {
      throw new UnauthorizedException('Assinatura XPAYMENTS inválida.');
    }

    const event = String(body.event ?? '');
    const transactionId = String(body.transaction_id ?? '');
    const reference = String(body.reference ?? '');
    const status = String(body.status ?? '');

    if (!event || !transactionId || !reference || !status) {
      return { received: true, ignored: true, reason: 'payload_incomplete' };
    }

    const externalEventId = `${transactionId}:${event}:${status}`;
    const existing = await this.prisma.webhookEvent.findFirst({
      where: { provider: 'xpayments', externalEventId },
      select: { id: true, status: true },
    });

    if (existing?.status === 'processed') {
      return { received: true, duplicate: true };
    }

    const order = await this.prisma.smmOrder.findFirst({
      where: {
        paymentSystem: 'xpayments',
        paymentReference: reference,
      },
      select: { id: true, tenantId: true, status: true },
    });

    const eventRecord = existing
      ? await this.prisma.webhookEvent.update({
          where: { id: existing.id },
          data: {
            payload: body as unknown as Prisma.InputJsonValue,
            status: order ? 'processing' : 'ignored',
          },
        })
      : await this.prisma.webhookEvent.create({
          data: {
            tenantId: order?.tenantId,
            provider: 'xpayments',
            eventType: event,
            externalEventId,
            status: order ? 'processing' : 'ignored',
            payload: body as unknown as Prisma.InputJsonValue,
          },
        });

    if (!order) {
      return { received: true, ignored: true, reason: 'order_not_found' };
    }

    const orderStatus =
      status === 'succeeded'
        ? 'paid'
        : status === 'failed'
          ? 'payment_failed'
          : status === 'canceled'
            ? 'payment_canceled'
            : 'payment_processing';

    await this.prisma.$transaction([
      this.prisma.smmOrder.update({
        where: { id: order.id },
        data: { status: orderStatus },
      }),
      this.prisma.smmOrderEvent.create({
        data: {
          orderId: order.id,
          eventType: `payment.${status}`,
          status: orderStatus,
          payload: body as unknown as Prisma.InputJsonValue,
        },
      }),
      this.prisma.webhookEvent.update({
        where: { id: eventRecord.id },
        data: {
          status: 'processed',
          processedAt: new Date(),
        },
      }),
    ]);

    return {
      received: true,
      orderId: order.id,
      status: orderStatus,
    };
  }
}
