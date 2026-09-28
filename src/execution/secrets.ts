import { ConfigService } from '@nestjs/config';

export function resolveSecretRef(
  config: ConfigService,
  secretRef?: string | null,
): string {
  if (!secretRef?.startsWith('env:')) {
    throw new Error('Secret reference inválida; use env:VARIABLE_NAME.');
  }

  const key = secretRef.slice('env:'.length).trim();
  const value = config.get<string>(key)?.trim();

  if (!key || !value) {
    throw new Error(`Secret ${key || '(vazio)'} não configurado no runtime.`);
  }

  return value;
}
