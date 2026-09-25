import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  IntegrationCredentialType,
  IntegrationStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IntegrationCryptoService } from './integration-crypto.service';

@Injectable()
export class IntegrationRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: IntegrationCryptoService,
  ) {}

  async getApplication(key: string) {
    const application = await this.prisma.integrationApplication.findUnique({
      where: { key },
    });

    if (!application || application.status !== IntegrationStatus.active) {
      throw new NotFoundException('INTEGRATION_APPLICATION_NOT_FOUND');
    }

    return application;
  }

  async getCredential(
    applicationId: string,
    type: IntegrationCredentialType,
  ): Promise<string> {
    const credential = await this.prisma.integrationCredential.findFirst({
      where: {
        applicationId,
        type,
        active: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!credential) {
      throw new ServiceUnavailableException(
        `INTEGRATION_CREDENTIAL_MISSING:${type}`,
      );
    }

    return this.crypto.decrypt(credential.encryptedValue);
  }
}
