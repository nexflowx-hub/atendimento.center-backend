import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Tenant } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { XPaymentsService } from '../integrations/xpayments.service';
import { CreateSmmOrderDto, ListSmmQuery } from './smm.dto';

@Injectable()
export class SmmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xpayments: XPaymentsService,
  ) {}

  listOffers(tenant: Tenant) {
    return this.prisma.smmOffer.findMany({
      where: { tenantId: tenant.id, active: true, service: { active: true } },
      include: {
        service: {
          select: {
            id: true,
            platform: true,
            category: true,
            serviceType: true,
            name: true,
            description: true,
            minQuantity: true,
            maxQuantity: true,
            refillSupported: true,
            cancelSupported: true,
            metadata: true,
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { publicName: 'asc' }],
    });
  }

  listOrders(tenant: Tenant, query: ListSmmQuery) {
    return this.prisma.smmOrder.findMany({
      where: {
        tenantId: tenant.id,
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        offer: true,
        service: {
          select: {
            platform: true,
            category: true,
            serviceType: true,
            name: true,
          },
        },
        events: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 50,
    });
  }

  async createCheckout(tenant: Tenant, orderId: string) {
    const order = await this.prisma.smmOrder.findFirst({
      where: { id: orderId, tenantId: tenant.id },
      include: { contact: true },
    });

    if (!order) throw new NotFoundException('Pedido SMM não encontrado.');

    if (['paid', 'submitting', 'processing', 'completed'].includes(order.status)) {
      throw new NotFoundException('Este pedido já não aceita novo checkout.');
    }

    const reference = order.paymentReference ?? `ATLASSMM-${order.id}`;
    const amountCents = Math.max(1, Math.round(Number(order.amount) * 100));

    const checkout = await this.xpayments.createCheckout({
      amountCents,
      currency: order.currency,
      reference,
      customerEmail: order.contact?.email,
      metadata: {
        atlasOrderId: order.id,
        atlasTenantId: tenant.id,
        product: 'smm',
      },
    });

    await this.prisma.$transaction([
      this.prisma.smmOrder.update({
        where: { id: order.id },
        data: {
          paymentSystem: 'xpayments',
          paymentReference: reference,
          status: 'payment_pending',
          metadata: ({
            ...((order.metadata ?? {}) as object),
            checkoutSessionId: checkout.sessionId,
            checkoutUrl: checkout.checkoutUrl,
          }) as Prisma.InputJsonValue,
        },
      }),
      this.prisma.smmOrderEvent.create({
        data: {
          orderId: order.id,
          eventType: 'payment.checkout.created',
          status: 'payment_pending',
          payload: {
            paymentSystem: 'xpayments',
            paymentReference: reference,
            sessionId: checkout.sessionId,
            checkoutUrl: checkout.checkoutUrl,
          },
        },
      }),
    ]);

    return checkout;
  }

  async createOrder(tenant: Tenant, body: CreateSmmOrderDto) {
    const offer = await this.prisma.smmOffer.findFirst({
      where: {
        id: body.offerId,
        tenantId: tenant.id,
        active: true,
        service: { active: true },
      },
      include: { service: true },
    });

    if (!offer) throw new NotFoundException('Oferta SMM não encontrada ou inativa.');

    if (
      (offer.service.minQuantity && body.quantity < offer.service.minQuantity) ||
      (offer.service.maxQuantity && body.quantity > offer.service.maxQuantity)
    ) {
      throw new NotFoundException('Quantidade fora dos limites desta oferta.');
    }

    if (body.contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: body.contactId, tenantId: tenant.id },
        select: { id: true },
      });
      if (!contact) throw new NotFoundException('Contacto não encontrado neste tenant.');
    }

    const amount =
      offer.pricingModel === 'fixed'
        ? offer.salePrice
        : offer.salePrice.mul(body.quantity).div(offer.unitSize);

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.smmOrder.create({
        data: {
          tenantId: tenant.id,
          contactId: body.contactId,
          offerId: offer.id,
          serviceId: offer.serviceId,
          target: body.target.trim(),
          quantity: body.quantity,
          amount,
          currency: offer.currency,
          paymentSystem: body.paymentSystem,
          paymentReference: body.paymentReference,
          status: body.paymentReference ? 'payment_pending' : 'quote_created',
          metadata: ({
            ...(body.metadata ?? {}),
            pricingModel: offer.pricingModel,
            unitSize: offer.unitSize,
            unitPrice: offer.salePrice.toString(),
          }) as Prisma.InputJsonValue,
        },
      });

      await tx.smmOrderEvent.create({
        data: {
          orderId: order.id,
          eventType: 'order.created',
          status: order.status,
          payload: {
            offerId: offer.id,
            quantity: body.quantity,
            amount: amount.toString(),
            currency: offer.currency,
          },
        },
      });

      return order;
    });
  }
}
