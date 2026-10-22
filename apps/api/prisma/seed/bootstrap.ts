/**
 * Arranque de producción de Parla. NO carga datos de ejemplo: crea solo lo mínimo para poder entrar y
 * operar, a partir de variables de entorno, y se puede repetir sin duplicar nada.
 *
 *   npm run db:seed
 *
 * 1) Cuenta de administrador (soporte): ADMIN_USERNAME + ADMIN_PASSWORD (y opcional ADMIN_NAME, ADMIN_PHONE).
 *    Si la cuenta ya existe, solo se asegura de que sea administradora (no se toca su contraseña).
 * 2) Primera tienda (opcional): STORE_OWNER (usuario o teléfono de una persona ya registrada) + STORE_NAME
 *    + STORE_ADDRESS. Si STORE_OWNER aún no se registró, se omite y se avisa.
 *
 * La cuenta de administrador guarda su clave de cifrado de extremo a extremo protegida con su contraseña,
 * igual que cualquier cuenta creada desde la app.
 */
import { encryptPrivateKey, generateIdentityKeyPair } from '@parla/crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { TERMS_VERSION } from '../../src/kernel/legal';
import { assertPasswordStrength } from '../../src/kernel/identifier';

const prisma = new PrismaClient();
const env = process.env;

async function ensureAdmin(): Promise<void> {
  const username = env.ADMIN_USERNAME?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  if (!username || !password) {
    console.log('• Administrador: sin ADMIN_USERNAME / ADMIN_PASSWORD, no se crea (defínelos en el .env para tener acceso al panel de soporte).');
    return;
  }
  const phone = env.ADMIN_PHONE?.trim() || null;
  const existing = await prisma.user.findFirst({ where: { OR: [{ username }, ...(phone ? [{ phone }] : [])] }, select: { id: true, isAdmin: true, username: true } });
  if (existing) {
    if (!existing.isAdmin) await prisma.user.update({ where: { id: existing.id }, data: { isAdmin: true } });
    console.log(`• Administrador: «${existing.username}» ya existe${existing.isAdmin ? '' : ' (ahora es administrador)'}.`);
    return;
  }
  assertPasswordStrength(password);
  const pair = await generateIdentityKeyPair();
  await prisma.user.create({
    data: {
      username,
      phone,
      phoneVerifiedAt: phone ? new Date() : null,
      isAdmin: true,
      displayName: env.ADMIN_NAME?.trim() || 'Soporte',
      about: 'Soporte',
      avatarColor: 'teal-dark',
      passwordHash: await bcrypt.hash(password, 10),
      publicKey: pair.publicKeyJwk,
      keyBackup: JSON.stringify(await encryptPrivateKey(pair.privateKeyJwk, password)),
      preferences: JSON.stringify({ theme: 'system', enterToSend: true, notificationSound: true }),
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: new Date(),
    },
  });
  console.log(`• Administrador «${username}» creado. Entra a la app con ese usuario y la contraseña de ADMIN_PASSWORD.`);
}

async function ensureStore(): Promise<void> {
  const owner = env.STORE_OWNER?.trim();
  const name = env.STORE_NAME?.trim();
  const address = env.STORE_ADDRESS?.trim();
  if (!owner || !name || !address) return;
  const service = env.STORE_SERVICE?.trim() || 'mercado';
  if (await prisma.business.findFirst({ where: { service } })) {
    console.log(`• Tienda: ya hay una para «${service}».`);
    return;
  }
  const user = await prisma.user.findFirst({ where: { OR: [{ username: owner.toLowerCase() }, { phone: owner }] }, select: { id: true } });
  if (!user) {
    console.log(`• Tienda: «${owner}» todavía no se registró en la app. Pídele que cree su cuenta y vuelve a ejecutar npm run db:seed.`);
    return;
  }
  const lat = env.STORE_LAT ? Number(env.STORE_LAT) : null;
  const lng = env.STORE_LNG ? Number(env.STORE_LNG) : null;
  await prisma.business.create({
    data: { name, service, address, lat, lng, opensAt: env.STORE_OPENS_AT || '08:00', closesAt: env.STORE_CLOSES_AT || '22:00', ownerId: user.id },
  });
  console.log(`• Tienda «${name}» creada para «${owner}» (servicio ${service}).`);
}

async function main(): Promise<void> {
  console.log('Arranque de Parla (producción, sin datos de ejemplo):');
  await ensureAdmin();
  await ensureStore();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
