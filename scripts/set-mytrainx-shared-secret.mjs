import { PrismaClient } from '@prisma/client';
import { createCipheriv, randomBytes } from 'crypto';

const prisma = new PrismaClient();

const masterRaw = process.env.INTEGRATION_MASTER_KEY;
if (!masterRaw) throw new Error('INTEGRATION_MASTER_KEY is required.');

const masterKey = Buffer.from(masterRaw, 'base64');
if (masterKey.length !== 32) {
  throw new Error('INTEGRATION_MASTER_KEY must decode to exactly 32 bytes.');
}

let secret = '';
for await (const chunk of process.stdin) secret += chunk;
secret = secret.trim();

if (!secret) throw new Error('Shared secret must be supplied on stdin.');

function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv);
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

async function main() {
  const application = await prisma.integrationApplication.findUniqueOrThrow({
    where: { key: 'mytrainx' },
  });

  await prisma.$transaction(async (tx) => {
    await tx.integrationCredential.updateMany({
      where: {
        applicationId: application.id,
        type: { in: ['inbound_hmac', 'outbound_hmac'] },
        active: true,
      },
      data: { active: false, rotatedAt: new Date() },
    });

    await tx.integrationCredential.createMany({
      data: [
        {
          applicationId: application.id,
          type: 'inbound_hmac',
          encryptedValue: encrypt(secret),
          active: true,
        },
        {
          applicationId: application.id,
          type: 'outbound_hmac',
          encryptedValue: encrypt(secret),
          active: true,
        },
      ],
    });
  });

  console.log(
    JSON.stringify({
      success: true,
      application: 'mytrainx',
      credentials: ['inbound_hmac', 'outbound_hmac'],
      stored: true,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    secret = '';
    await prisma.$disconnect();
  });
