/**
 * Datos de ejemplo de Parla. Todo se cifra de extremo a extremo con el mismo esquema que usa el
 * navegador (@parla/crypto): el servidor solo guarda texto y archivos cifrados.
 *
 *   npm run db:seed            → carga los datos si la base está vacía
 *   npm run db:reset           → borra todo y vuelve a cargar
 */
import {
  encryptBytes,
  encryptPrivateKey,
  encryptText,
  generateConversationKey,
  generateIdentityKeyPair,
  importPrivateKey,
  importPublicKey,
  textEncoder,
  wrapConversationKey,
} from '@parla/crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { TERMS_VERSION } from '../../src/kernel/legal';
import { PACKAGING_SVG, ROUTE_SVG, WIREFRAME_SVG, voiceNoteWav } from './seed-media';

const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const prisma = new PrismaClient();
const STORAGE_DIR = resolve(process.cwd(), process.env.STORAGE_DIR ?? './storage');
export const DEMO_PASSWORD = 'Parla2026!';

interface SeedUser {
  key: string;
  username: string | null;
  phone: string | null;
  displayName: string;
  about: string;
  avatarColor: string;
}

const USERS: SeedUser[] = [
  { key: 'laura', username: 'laura', phone: '+573104567890', displayName: 'Laura Méndez', about: 'Coordinadora de operaciones ☕', avatarColor: 'teal' },
  { key: 'andres', username: 'andres', phone: '+573005550101', displayName: 'Andrés Rojas', about: 'Logística y despachos', avatarColor: 'emerald' },
  { key: 'camila', username: 'camila', phone: '+573005550102', displayName: 'Camila Torres', about: 'Diseño de marca · Proyecto Faro', avatarColor: 'cyan' },
  { key: 'diego', username: 'diego', phone: '+573005550103', displayName: 'Diego Herrera', about: 'Ventas Bogotá', avatarColor: 'teal-dark' },
  { key: 'sofia', username: null, phone: '+573001234567', displayName: 'Sofía Ramírez', about: 'Atención al cliente', avatarColor: 'emerald-dark' },
  { key: 'mateo', username: 'mateo', phone: '+573005550104', displayName: 'Mateo Gómez', about: 'Finanzas', avatarColor: 'cyan-dark' },
  { key: 'valentina', username: 'valentina', phone: '+573005550105', displayName: 'Valentina Castro', about: 'Calidad y tostión', avatarColor: 'emerald' },
  // Dueña de la tienda del Mercado: recibe los pedidos, los acepta y llama a Rapidito.
  { key: 'tienda', username: 'tienda', phone: '+573005550106', displayName: 'Elena Condori', about: 'Dueña de Bodega MercaYa 🛒', avatarColor: 'cyan' },
  // Repartidores de Rapidito: toman los pedidos listos, los recogen en la tienda y los entregan.
  { key: 'repartidor', username: 'repartidor', phone: '+573005550107', displayName: 'Carlos Huamán', about: 'Repartidor de Rapidito 🛵', avatarColor: 'emerald-dark' },
  { key: 'repartidora', username: 'repartidora', phone: '+573005550108', displayName: 'Lucía Ramos', about: 'Repartidora de Rapidito 🛵', avatarColor: 'teal-dark' },
];

/** Negocio de ejemplo: atiende los pedidos del Mercado con delivery Rapidito. */
/** Abre las 24 horas (misma hora de apertura y cierre); la dueña cambia el horario en «Mi negocio». */
const BUSINESS = { owner: 'tienda', name: 'Bodega MercaYa', service: 'mercado', address: 'Av. Benavides 1180, Miraflores', lat: -12.1268, lng: -77.0195, opensAt: '00:00', closesAt: '00:00' } as const;

/** Repartidores de Rapidito con su vehículo (conectados, para probar sin pasos extra). */
const DRIVERS = [
  { user: 'repartidor', vehicle: 'Moto', plate: 'B7K-482' },
  { user: 'repartidora', vehicle: 'Moto', plate: 'D5T-663' },
] as const;

type Media = { kind: 'image' | 'audio'; file: 'packaging' | 'route' | 'wireframe' | 'voice' };
/** Hilo (índice del mensaje al que responde) y personas mencionadas con @. */
type LineOptions = { replyTo?: number; mentions?: string[] };
/** [autor, texto, minutos atrás, archivo opcional, opciones] */
type Line = [string, string, number, Media?, LineOptions?];

interface SeedConversation {
  kind: 'direct' | 'group';
  /** Color del avatar del grupo. */
  color?: string;
  title?: string;
  description?: string;
  members: string[];
  /** Últimos N mensajes que cada persona aún no ha leído. */
  unread?: Record<string, number>;
  /** Últimos N mensajes que aún no llegan al dispositivo de esa persona. */
  undelivered?: Record<string, number>;
  lines: Line[];
}

const H = 60;
const D = 24 * H;

const CONVERSATIONS: SeedConversation[] = [
  {
    kind: 'group',
    title: 'General',
    description: 'Avisos para todo el equipo de Café Andino',
    members: ['laura', 'andres', 'camila', 'diego', 'sofia', 'mateo', 'valentina'],
    unread: { laura: 2, camila: 4, mateo: 5 },
    lines: [
      ['laura', '¡Buenos días, equipo! Bienvenidos a Parla 🎉 A partir de hoy coordinamos todo por aquí y dejamos los grupos personales para lo personal.', 3 * D + 5 * H, undefined],
      ['andres', 'Por fin 🙌 ya no se me pierden los pedidos entre los memes del grupo familiar', 3 * D + 4 * H + 50, undefined],
      ['valentina', 'Me encanta. ¿Los canales por área ya están creados?', 3 * D + 4 * H + 40, undefined],
      ['laura', 'Sí: Logística y despachos, Lanzamiento Geisha y este General para avisos. Si necesitan otro, me escriben.', 3 * D + 4 * H + 30, undefined],
      ['mateo', 'Recordatorio: el cierre de mes es el viernes. Por favor suban las facturas de proveedores antes del jueves a las 5 p. m.', 2 * D + 2 * H, undefined],
      ['sofia', 'Anotado. Esta semana entraron 18 solicitudes nuevas de clientes corporativos 📈', 1 * D + 6 * H, undefined],
      ['diego', '¡Y cerramos el contrato con la cadena de hoteles en Chapinero! 120 kg mensuales ☕', 1 * D + 5 * H + 30, undefined],
      ['laura', '¡Qué noticia, @Diego Herrera! 👏👏 Esto merece pandebono para todos el lunes.', 1 * D + 5 * H, undefined, { mentions: ['diego'] }],
      ['camila', 'Yo llevo el pandebono 😄', 3 * H, undefined],
      ['valentina', 'Mañana hacemos catación del lote nuevo a las 10 a. m. en la sala de tostión. Están todos invitados.', 25, undefined],
      ['andres', 'Ahí estaré. ¿Llevo las tazas de cata nuevas?', 12, undefined, { replyTo: 9 }],
      ['valentina', 'Sí, porfa. Y las cucharas de cata 🥄', 6, undefined, { replyTo: 9 }],
    ],
  },
  {
    kind: 'group',
    title: 'Logística y despachos',
    description: 'Rutas, inventario y entregas',
    members: ['laura', 'andres', 'sofia', 'diego'],
    unread: { laura: 3, diego: 1 },
    lines: [
      ['andres', 'Inventario de hoy: 340 kg de Huila, 210 kg de Nariño y 95 kg de Sierra Nevada.', 2 * D + 3 * H, undefined],
      ['sofia', 'El cliente de Usaquén pregunta si podemos adelantar su pedido al jueves.', 2 * D + 2 * H, undefined],
      ['laura', 'Si Andrés cuadra la ruta, sí. @Andrés Rojas, ¿te da?', 2 * D + H + 50, undefined, { mentions: ['andres'] }],
      ['andres', 'Sí, lo meto en la ruta del jueves. Les comparto el recorrido 👇', 2 * D + H + 30, undefined],
      ['andres', 'Ruta del jueves: 3 paradas, salimos 7:30 a. m.', 2 * D + H + 29, { kind: 'image', file: 'route' }],
      ['diego', 'Perfecto, le confirmo al cliente.', 1 * D + 2 * H, undefined],
      ['sofia', 'Llegó una queja: un paquete de Nariño llegó con la válvula rota. Ya le ofrecimos reposición.', 3 * H, undefined],
      ['andres', 'Revisé el lote: fue un problema del proveedor de bolsas. Cambio el lote completo hoy mismo.', 2 * H, undefined, { replyTo: 6 }],
      ['andres', 'Les dejo nota de voz con el detalle para el informe.', H + 40, { kind: 'audio', file: 'voice' }],
      ['sofia', 'Gracias, Andrés. Le aviso al cliente que la reposición sale mañana.', 40, undefined, { replyTo: 6 }],
    ],
  },
  {
    kind: 'group',
    title: 'Lanzamiento Geisha',
    description: 'Edición limitada · diciembre',
    members: ['laura', 'camila', 'valentina', 'diego'],
    unread: { valentina: 1 },
    lines: [
      ['valentina', 'El perfil de tostión quedó listo: notas de jazmín, durazno y miel. Puntaje de cata 88,5 🏆', 2 * D + 5 * H, undefined],
      ['camila', '¡Increíble! Les comparto la tercera propuesta de empaque.', 1 * D + 7 * H, undefined],
      ['camila', 'Propuesta v3 — teal con etiqueta crema', 1 * D + 7 * H - 1, { kind: 'image', file: 'packaging' }],
      ['diego', 'Me gusta mucho. ¿Podemos poner la altura en la etiqueta? A los clientes de hoteles les encanta ese dato.', 1 * D + 6 * H, undefined],
      ['camila', 'Ya está: "Huila · 1.850 msnm" 😉', 1 * D + 5 * H + 40, undefined],
      ['laura', 'Aprobado por mi parte. Valentina, ¿cuántas bolsas de 250 g sacamos del lote?', 5 * H, undefined],
      ['valentina', 'Unas 400 bolsas. Si vendemos bien, guardo 20 kg verdes para una segunda tanda.', 4 * H + 30, undefined],
      ['laura', 'Perfecto. @Diego Herrera, arma la preventa para clientes corporativos 🚀', 50, undefined, { mentions: ['diego'] }],
    ],
  },
  {
    kind: 'direct',
    members: ['laura', 'andres'],
    unread: { laura: 1 },
    lines: [
      ['laura', 'Andrés, ¿tienes un momento hoy para revisar el contrato de la transportadora?', 1 * D + 3 * H, undefined],
      ['andres', 'Claro, después del almuerzo te llamo.', 1 * D + 2 * H + 50, undefined],
      ['laura', 'Gracias 🙏', 1 * D + 2 * H + 48, undefined],
      ['andres', 'Ya hablé con ellos: nos mantienen la tarifa hasta marzo si firmamos por un año.', 35, undefined],
    ],
  },
  {
    kind: 'direct',
    members: ['laura', 'camila'],
    lines: [
      ['camila', 'Laura, te dejé en Drive las fotos de producto para la tienda.', 2 * D + 4 * H, undefined],
      ['laura', '¡Están hermosas! La del Geisha con la taza es mi favorita.', 2 * D + 3 * H, undefined],
      ['camila', '😊 Gracias. Mañana te paso los textos.', 2 * D + 2 * H + 55, undefined],
    ],
  },
  {
    kind: 'direct',
    members: ['laura', 'sofia'],
    unread: { sofia: 1 },
    lines: [
      ['sofia', 'Laura, ¿podemos ofrecer envío gratis a los clientes que compran más de 5 kg?', 6 * H, undefined],
      ['laura', 'Sí, desde 5 kg el envío dentro de Bogotá va por nuestra cuenta. Fuera de Bogotá, 50 % de descuento.', 5 * H + 30, undefined],
      ['sofia', '¡Perfecto! Actualizo la plantilla de respuestas.', 5 * H + 20, undefined],
      ['laura', 'Y por favor agrega el enlace al formulario de reclamos nuevo 😊', 8, undefined],
    ],
  },
  {
    kind: 'direct',
    members: ['laura', 'mateo'],
    undelivered: { mateo: 1 },
    lines: [
      ['mateo', 'Te envié el flujo de caja de noviembre para que lo revises.', 1 * D + H, undefined],
      ['laura', 'Lo reviso esta tarde. ¿Incluye el anticipo de los hoteles?', 1 * D + 40, undefined],
      ['mateo', 'Sí, quedó en la línea de ingresos de diciembre.', 1 * D + 20, undefined],
      ['laura', 'Listo, todo cuadra. Lo presento el lunes en la reunión de socios.', 4, undefined],
    ],
  },
  {
    kind: 'direct',
    members: ['camila', 'valentina'],
    lines: [
      ['valentina', 'Cami, ¿me ayudas con la ficha técnica del Geisha?', 1 * D + 4 * H, undefined],
      ['camila', 'Claro, mándame los datos y la armo con la línea gráfica nueva.', 1 * D + 3 * H + 30, undefined],
    ],
  },
  {
    kind: 'group',
    color: 'cyan',
    title: 'Diseño tienda en línea',
    description: 'Rediseño de la tienda · entregas semanales',
    members: ['camila', 'laura', 'diego', 'mateo'],
    unread: { laura: 2 },
    lines: [
      ['camila', 'Equipo, arrancamos el Proyecto Faro 🚀 Objetivo: lanzar la nueva tienda antes del 15 de diciembre.', 4 * D, undefined],
      ['mateo', 'El presupuesto aprobado es de 18 millones. Les comparto el desglose en la reunión.', 3 * D + 20 * H, undefined],
      ['camila', 'Wireframe de la home, versión 2:', 1 * D + 2 * H, { kind: 'image', file: 'wireframe' }],
      ['diego', 'Pondría el botón de comprar más arriba en el celular, la mayoría de los pedidos llegan desde ahí.', 1 * D + H, undefined],
      ['camila', 'Buen punto. Lo ajusto para la v3.', 2 * H, undefined],
      ['camila', '@Laura Méndez, ¿puedes revisar los textos de la página de suscripción?', 30, undefined, { mentions: ['laura'] }],
    ],
  },
];

const MEDIA_FILES = {
  packaging: { mimeType: 'image/svg+xml', data: () => textEncoder.encode(PACKAGING_SVG), durationMs: undefined },
  route: { mimeType: 'image/svg+xml', data: () => textEncoder.encode(ROUTE_SVG), durationMs: undefined },
  wireframe: { mimeType: 'image/svg+xml', data: () => textEncoder.encode(WIREFRAME_SVG), durationMs: undefined },
  voice: { mimeType: 'audio/wav', data: () => voiceNoteWav(4).data, durationMs: 4000 },
} as const;

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  if (!force && (await prisma.user.count()) > 0) {
    console.log('La base ya tiene datos: no se vuelve a cargar el seed (usa npm run db:reset para empezar de cero).');
    return;
  }
  await mkdir(STORAGE_DIR, { recursive: true });

  console.log('Creando usuarios y sus claves de cifrado…');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const people = new Map<string, { id: string; privateKey: CryptoKey; publicKey: CryptoKey; publicKeyJwk: string; displayName: string }>();
  for (const u of USERS) {
    const pair = await generateIdentityKeyPair();
    const row = await prisma.user.create({
      data: {
        username: u.username,
        phone: u.phone,
        phoneVerifiedAt: u.phone ? new Date(Date.now() - 30 * 24 * 3600_000) : null,
        // Laura ya agregó su correo: puede restablecer la contraseña desde «¿Olvidaste tu contraseña?».
        email: u.key === 'laura' ? 'laura@example.com' : null,
        emailVerifiedAt: u.key === 'laura' ? new Date(Date.now() - 29 * 24 * 3600_000) : null,
        displayName: u.displayName,
        about: u.about,
        avatarColor: u.avatarColor,
        passwordHash,
        publicKey: pair.publicKeyJwk,
        keyBackup: JSON.stringify(await encryptPrivateKey(pair.privateKeyJwk, DEMO_PASSWORD)),
        preferences: JSON.stringify({ theme: 'system', enterToSend: true, notificationSound: true }),
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: new Date(Date.now() - 30 * 24 * 3600_000),
        lastSeenAt: new Date(Date.now() - Math.floor(Math.random() * 90) * 60_000),
        createdAt: new Date(Date.now() - 30 * 24 * 3600_000),
      },
    });
    people.set(u.key, {
      id: row.id,
      displayName: u.displayName,
      privateKey: await importPrivateKey(pair.privateKeyJwk),
      publicKey: await importPublicKey(pair.publicKeyJwk),
      publicKeyJwk: pair.publicKeyJwk,
    });
  }
  const person = (key: string) => people.get(key)!;

  console.log('Creando el negocio del Mercado y los repartidores de Rapidito…');
  await prisma.business.create({
    data: { name: BUSINESS.name, service: BUSINESS.service, address: BUSINESS.address, lat: BUSINESS.lat, lng: BUSINESS.lng, opensAt: BUSINESS.opensAt, closesAt: BUSINESS.closesAt, ownerId: person(BUSINESS.owner).id },
  });
  for (const d of DRIVERS) {
    await prisma.driver.create({ data: { userId: person(d.user).id, vehicle: d.vehicle, plate: d.plate, online: true } });
  }

  console.log('Cifrando conversaciones y mensajes…');
  for (const conv of CONVERSATIONS) {
    const creator = person(conv.lines[0][0]);
    const key = await generateConversationKey();
    const firstAt = new Date(Date.now() - (conv.lines[0][2] + 30) * 60_000);
    const participants = await Promise.all(
      conv.members.map(async (m) => {
        const wrapped = await wrapConversationKey(key, creator.privateKey, person(m).publicKey);
        return { userId: person(m).id, wrappedKey: wrapped.wrappedKey, keyIv: wrapped.iv, wrappedById: creator.id, wrapperPublicKey: creator.publicKeyJwk, joinedAt: firstAt };
      }),
    );
    const ids = conv.members.map((m) => person(m).id).sort();
    const lastAt = new Date(Date.now() - conv.lines[conv.lines.length - 1][2] * 60_000);
    const conversation = await prisma.conversation.create({
      data: {
        kind: conv.kind,
        title: conv.title ?? '',
        description: conv.description ?? '',
        avatarColor: conv.kind === 'group' ? (conv.color ?? 'teal-dark') : 'teal',
        directKey: conv.kind === 'direct' ? ids.join(':') : null,
        createdById: creator.id,
        createdAt: firstAt,
        updatedAt: lastAt,
        participants: { create: participants },
      },
    });

    if (conv.kind === 'group') {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: creator.id,
          kind: 'system',
          systemText: `${creator.displayName} creó el grupo «${conv.title}»`,
          clientId: randomUUID(),
          createdAt: firstAt,
        },
      });
    }

    const total = conv.lines.length;
    const messageIds: string[] = [];
    for (const [index, [author, text, minutesAgo, media, options]] of conv.lines.entries()) {
      const sender = person(author);
      const createdAt = new Date(Date.now() - minutesAgo * 60_000);
      const fromEnd = total - index;
      let mediaJson: string | null = null;
      let body = await encryptText(key, text);
      if (media) {
        const spec = MEDIA_FILES[media.file];
        const plain = spec.data();
        const encrypted = await encryptBytes(key, plain);
        const fileId = randomBytes(16).toString('hex');
        await writeFile(join(STORAGE_DIR, `${fileId}.bin`), Buffer.from(encrypted.data));
        await prisma.storedFile.create({
          data: { id: fileId, conversationId: conversation.id, uploaderId: sender.id, size: encrypted.data.byteLength },
        });
        mediaJson = JSON.stringify({
          fileId,
          mimeType: spec.mimeType,
          size: plain.byteLength,
          iv: encrypted.iv,
          ...(spec.durationMs ? { durationMs: spec.durationMs } : {}),
        });
        // En imágenes el texto es el pie de foto; en notas de voz no hay texto.
        if (media.kind === 'audio') body = await encryptText(key, '');
      }

      const recipients = conv.members.filter((m) => m !== author);
      const created = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: sender.id,
          kind: media?.kind ?? 'text',
          replyToId: options?.replyTo !== undefined ? messageIds[options.replyTo] : null,
          mentions: {
            create: (options?.mentions ?? []).map((m) => ({ userId: person(m).id, conversationId: conversation.id })),
          },
          ciphertext: body.ciphertext,
          iv: body.iv,
          media: mediaJson,
          clientId: randomUUID(),
          createdAt,
          receipts: {
            create: recipients.map((m) => {
              const unread = fromEnd <= (conv.unread?.[m] ?? 0);
              const undelivered = fromEnd <= (conv.undelivered?.[m] ?? 0);
              return {
                userId: person(m).id,
                conversationId: conversation.id,
                deliveredAt: undelivered ? null : new Date(createdAt.getTime() + 20_000),
                readAt: unread || undelivered ? null : new Date(createdAt.getTime() + 60_000),
              };
            }),
          },
        },
      });
      messageIds.push(created.id);
    }
  }

  console.log('\nDatos de ejemplo listos. Usuarios de prueba (contraseña para todos: %s):', DEMO_PASSWORD);
  console.table([
    { usuario: 'laura', quién: 'Laura Méndez · la más activa: grupos, chats y pedidos' },
    { usuario: 'camila', quién: 'Camila Torres · creó el grupo «Diseño tienda en línea»' },
    { usuario: 'andres', quién: 'Andrés Rojas' },
    { usuario: 'tienda', quién: 'Elena Condori · dueña de Bodega MercaYa: acepta, prepara y entrega al repartidor' },
    { usuario: 'repartidor', quién: 'Carlos Huamán · repartidor de Rapidito (moto B7K-482)' },
    { usuario: 'repartidora', quién: 'Lucía Ramos · repartidora de Rapidito (moto D5T-663)' },
    { usuario: '+57 300 123 4567', quién: 'Sofía Ramírez (entra con su teléfono)' },
  ]);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
