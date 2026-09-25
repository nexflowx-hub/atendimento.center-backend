import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class IntegrationCryptoService {
  constructor(private readonly config: ConfigService) {}

  encrypt(value: string): string {
    const key = this.key();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(payload: string): string {
    const [version, ivRaw, tagRaw, ciphertextRaw] = payload.split('.');
    if (version !== 'v1' || !ivRaw || !tagRaw || !ciphertextRaw) {
      throw new Error('INTEGRATION_CREDENTIAL_FORMAT_INVALID');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      Buffer.from(ivRaw, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private key(): Buffer {
    const raw = this.config.get<string>('INTEGRATION_MASTER_KEY');
    if (!raw) {
      throw new ServiceUnavailableException(
        'INTEGRATION_MASTER_KEY is not configured.',
      );
    }

    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new ServiceUnavailableException(
        'INTEGRATION_MASTER_KEY must be 32 bytes encoded as base64.',
      );
    }
    return key;
  }
}
