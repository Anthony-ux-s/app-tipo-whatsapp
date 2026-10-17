import type { BusinessOrder, DriverOrder, InternalCreateOrder, Order } from '@parla/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../kernel/domain-error';
import { PresenceRegistry } from '../../../infra/realtime/presence.registry';
import {
  InMemoryAuthRepository,
  InMemoryBusinessesRepository,
  InMemoryDriversRepository,
  InMemoryOrdersRepository,
  InMemoryPushSubscriptions,
  makeUser,
  RecordingPushSender,
  RecordingRealtime,
} from '../../../testing/in-memory.fakes';
import { NotificationDispatcher } from '../messaging/push/use-cases/notification-dispatcher';
import {
  DecideBusinessOrderUseCase,
  GetBusinessOrderUseCase,
  GetOrderContactUseCase,
  ListBusinessOrdersUseCase,
} from './use-cases/business-orders.use-cases';
import { AcceptDeliveryUseCase, DeliverOrderUseCase, ListDriverOrdersUseCase } from './use-cases/driver-orders.use-cases';
import {
  CreateOrderUseCase,
  GetMyOrderUseCase,
  ListMyOrdersUseCase,
  OrderEvents,
  UpdateOrderUseCase,
} from './use-cases/orders.use-cases';

const flush = () => new Promise((r) => setTimeout(r, 0));
const ID = 'ord_abc12345';

describe('pedidos de Servicios (core)', () => {
  const ana = makeUser({ displayName: 'Ana Pérez' });
  const beto = makeUser({ displayName: 'Beto' });
  /** Dueña de la tienda del Mercado. */
  const rosa = makeUser({ displayName: 'Rosa' });
  /** Repartidores de Rapidito. */
  const carlos = makeUser({ displayName: 'Carlos Huamán' });
  const lucia = makeUser({ displayName: 'Lucía Ramos' });
  let users: InMemoryAuthRepository;
  let businesses: InMemoryBusinessesRepository;
  let drivers: InMemoryDriversRepository;
  let orders: InMemoryOrdersRepository;
  let events: OrderEvents;
  let realtime: RecordingRealtime;
  let push: RecordingPushSender;
  let create: CreateOrderUseCase;
  let update: UpdateOrderUseCase;
  let decide: DecideBusinessOrderUseCase;
  let take: AcceptDeliveryUseCase;
  let deliver: DeliverOrderUseCase;

  const newOrder = (overrides: Partial<InternalCreateOrder> = {}): InternalCreateOrder => ({
    id: ID,
    userId: ana.id,
    service: 'mercado',
    lines: [
      { productId: 'AZ-1KG', name: 'Azúcar rubia', unit: '1 kg', quantity: 2, unitPriceCents: 450, totalCents: 900 },
      { productId: 'AR-1KG', name: 'Arroz extra', unit: '1 kg', quantity: 1, unitPriceCents: 520, totalCents: 520 },
    ],
    subtotalCents: 1420,
    deliveryFeeCents: 650,
    totalCents: 2070,
    currency: 'PEN',
    address: { line: 'Av. Larco 123, Miraflores', reference: 'Puerta verde' },
    payment: { provider: 'PagaYa', qrText: 'http://pagaya/x', payUrl: 'http://pagaya/x', expiresAt: new Date().toISOString(), paidAt: null },
    deliveryQuoteId: 'q_1',
    ...overrides,
  });

  const codeOf = async () => (await orders.findById(ID))!.deliveryCode;
  const pay = () => update.execute(ID, { expectStatus: 'pending_payment', status: 'paid' });
  /** Pagado, aceptado y listo: se ofrece a los repartidores. */
  const readyForDrivers = async () => {
    await create.execute(newOrder());
    await pay();
    await decide.execute(rosa.id, ID, 'accept');
    await decide.execute(rosa.id, ID, 'ready');
  };

  beforeEach(async () => {
    users = new InMemoryAuthRepository();
    users.users.push(ana, beto, rosa, carlos, lucia);
    businesses = new InMemoryBusinessesRepository();
    businesses.businesses.push({ id: 'biz_1', name: 'Bodega MercaYa', service: 'mercado', ownerId: rosa.id, address: 'Av. Benavides 1180' });
    drivers = new InMemoryDriversRepository();
    drivers.drivers.push({ userId: carlos.id, vehicle: 'Moto', plate: 'B7K-482' }, { userId: lucia.id, vehicle: 'Moto', plate: 'D5T-663' });
    orders = new InMemoryOrdersRepository(businesses);
    realtime = new RecordingRealtime();
    const subs = new InMemoryPushSubscriptions();
    for (const [u, name] of [[ana, 'ana'], [rosa, 'rosa'], [carlos, 'carlos']] as const) {
      await subs.save({ userId: u.id, endpoint: `https://push.example/${name}`, p256dh: 'k', auth: 'a' });
    }
    push = new RecordingPushSender();
    events = new OrderEvents(realtime, users, drivers, new NotificationDispatcher(subs, push, new PresenceRegistry()));
    create = new CreateOrderUseCase(orders, users, businesses, events);
    update = new UpdateOrderUseCase(orders, events);
    decide = new DecideBusinessOrderUseCase(orders, users, events);
    take = new AcceptDeliveryUseCase(drivers, orders, users, events);
    deliver = new DeliverOrderUseCase(drivers, orders, users, events);
  });

  it('guarda el pedido pendiente de pago con su código de entrega, y se lo avisa solo a su dueña', async () => {
    const order = await create.execute(newOrder());
    expect(order).toMatchObject({ status: 'pending_payment', totalCents: 2070, userId: ana.id, delivery: null, businessOwnerId: rosa.id });
    expect(order.business).toMatchObject({ id: 'biz_1', name: 'Bodega MercaYa', ownerId: rosa.id });
    expect(await codeOf()).toMatch(/^\d{4}$/);
    expect(order).not.toHaveProperty('deliveryCode');
    expect(realtime.events('order:updated')[0].userIds).toEqual([ana.id]);
    expect(realtime.events('order:updated')[0].payload).not.toHaveProperty('userId');
    // Mientras no se pague, el negocio no se entera.
    expect(realtime.events('business-order:updated')).toHaveLength(0);
  });

  it('rechaza montos que no cuadran, cuentas inexistentes y pedidos repetidos', async () => {
    await expect(create.execute(newOrder({ totalCents: 1 }))).rejects.toThrow(ValidationError);
    await expect(create.execute(newOrder({ userId: 'nadie' }))).rejects.toThrow(NotFoundError);
    await create.execute(newOrder());
    await expect(create.execute(newOrder())).rejects.toThrow(ConflictError);
  });

  it('pago → tienda acepta y lo alista → Carlos lo toma → la tienda se lo entrega → entrega con código', async () => {
    await readyForDrivers();
    await flush();
    // Se ofrece a todos los repartidores, con push.
    const offers = realtime.events('driver-order:updated');
    expect(offers.map((e) => e.userIds[0]).sort()).toEqual([carlos.id, lucia.id].sort());
    expect((offers[0].payload as DriverOrder)).toMatchObject({ status: 'searching_driver', mine: false, customerName: 'Ana', business: { address: 'Av. Benavides 1180' } });
    expect(offers[0].payload).not.toHaveProperty('deliveryCode');

    const taken = await take.execute(carlos.id, ID);
    expect(taken).toMatchObject({ status: 'driver_assigned', mine: true });
    await decide.execute(rosa.id, ID, 'handoff');
    const done = await deliver.execute(carlos.id, ID, await codeOf());
    await flush();

    expect(done.status).toBe('delivered');
    const final = (await new GetMyOrderUseCase(orders).execute(ana.id, ID)) as Order;
    expect(final.delivery).toMatchObject({ driverName: 'Carlos Huamán', vehicle: 'Moto · B7K-482' });
    expect(final.deliveryCode).toBe(await codeOf());
    expect(final.timeline.map((t) => t.status)).toEqual([
      'pending_payment', 'paid', 'preparing', 'searching_driver', 'driver_assigned', 'on_the_way', 'delivered',
    ]);
    expect(final.timeline.at(-1)?.note).toContain('código del cliente');
    expect(final.timeline.at(-2)?.note).toBe('Entregado a Carlos Huamán en la tienda');

    // La tienda ve la constancia; su vista nunca trae el código.
    const toRosa = realtime.events('business-order:updated');
    expect((toRosa.at(-1)!.payload as BusinessOrder).status).toBe('delivered');
    expect(toRosa.every((e) => !('deliveryCode' in (e.payload as object)))).toBe(true);
    const titles = (who: string) => push.sent.filter((s) => s.target.endpoint.endsWith(`/${who}`)).map((s) => s.payload.title);
    expect(titles('ana')).toEqual([
      'Pago recibido', 'Están preparando tu pedido', 'Tu pedido está listo', 'Ya tienes repartidor', 'Tu pedido va en camino', 'Pedido entregado',
    ]);
    expect(titles('rosa')).toEqual(['Nuevo pedido', 'Repartidor en camino', 'Pedido entregado']);
    expect(titles('carlos')).toEqual(['Pedido para recoger']);
  });

  it('el código equivocado no entrega; al quinto intento se bloquea', async () => {
    await readyForDrivers();
    await take.execute(carlos.id, ID);
    await expect(deliver.execute(carlos.id, ID, await codeOf())).rejects.toThrow('Primero recoge');
    await decide.execute(rosa.id, ID, 'handoff');
    const wrong = (await codeOf()) === '0000' ? '1111' : '0000';
    await expect(deliver.execute(carlos.id, ID, wrong)).rejects.toThrow('Te quedan 4 intentos');
    for (let i = 0; i < 4; i++) await deliver.execute(carlos.id, ID, wrong).catch(() => undefined);
    await expect(deliver.execute(carlos.id, ID, await codeOf())).rejects.toThrow('Demasiados intentos');
    expect((await orders.findById(ID))!.status).toBe('on_the_way');
  });

  it('gana el primer repartidor; el otro ya no lo ve; y una entrega a la vez', async () => {
    await readyForDrivers();
    await take.execute(carlos.id, ID);
    await expect(take.execute(lucia.id, ID)).rejects.toThrow(NotFoundError);
    expect((await new ListDriverOrdersUseCase(drivers, orders, users).execute(lucia.id)).available).toEqual([]);
    await expect(take.execute(beto.id, ID)).rejects.toThrow(ForbiddenError);

    await create.execute(newOrder({ id: 'ord_second123' }));
    await update.execute('ord_second123', { status: 'paid' });
    await decide.execute(rosa.id, 'ord_second123', 'accept');
    await decide.execute(rosa.id, 'ord_second123', 'ready');
    await expect(take.execute(carlos.id, 'ord_second123')).rejects.toThrow('Termina tu entrega en curso');
    expect((await take.execute(lucia.id, 'ord_second123')).mine).toBe(true);
  });

  it('un aviso de pago repetido no cambia nada (idempotente) y un pedido nunca retrocede', async () => {
    await create.execute(newOrder());
    await pay();
    await expect(pay()).rejects.toThrow(ConflictError);
    await expect(update.execute(ID, { status: 'pending_payment' })).rejects.toThrow(ConflictError);
    expect(realtime.events('order:updated')).toHaveLength(2);
  });

  it('cada persona ve solo sus pedidos', async () => {
    await create.execute(newOrder());
    expect(await new ListMyOrdersUseCase(orders).execute(ana.id)).toHaveLength(1);
    expect(await new ListMyOrdersUseCase(orders).execute(beto.id)).toEqual([]);
    await expect(new GetMyOrderUseCase(orders).execute(beto.id, ID)).rejects.toThrow(NotFoundError);
  });

  describe('el negocio', () => {
    it('ve sus pedidos ya pagados con quién los pidió; nadie más los ve', async () => {
      await create.execute(newOrder());
      const list = new ListBusinessOrdersUseCase(businesses, orders, users);
      expect(await list.execute(rosa.id)).toEqual([]);
      await pay();
      const [order] = await list.execute(rosa.id);
      expect(order).toMatchObject({ status: 'paid', customer: { id: ana.id, displayName: 'Ana Pérez' } });
      await expect(list.execute(beto.id)).rejects.toThrow(NotFoundError);
      await expect(new GetBusinessOrderUseCase(orders, users).execute(beto.id, ID)).rejects.toThrow(NotFoundError);
    });

    it('cada paso una sola vez y en orden: no se salta ni vuelve atrás', async () => {
      await create.execute(newOrder());
      await pay();
      await expect(decide.execute(beto.id, ID, 'accept')).rejects.toThrow(NotFoundError);
      await expect(decide.execute(rosa.id, ID, 'ready')).rejects.toThrow('Primero acepta');
      expect((await decide.execute(rosa.id, ID, 'accept')).status).toBe('preparing');
      expect((await decide.execute(rosa.id, ID, 'accept')).status).toBe('preparing');
      await expect(decide.execute(rosa.id, ID, 'reject')).rejects.toThrow(ConflictError);
      await decide.execute(rosa.id, ID, 'ready');
      await expect(decide.execute(rosa.id, ID, 'handoff')).rejects.toThrow('ningún repartidor');
      expect(realtime.events('order:updated').filter((e) => (e.payload as Order).status === 'preparing')).toHaveLength(1);
    });

    it('al rechazar, la clienta se entera y el pedido termina', async () => {
      await create.execute(newOrder());
      await pay();
      expect((await decide.execute(rosa.id, ID, 'reject')).status).toBe('rejected');
      await flush();
      expect(push.sent.map((s) => s.payload.title)).toContain('Tu pedido no fue aceptado');
      await expect(decide.execute(rosa.id, ID, 'accept')).rejects.toThrow(ConflictError);
    });
  });

  it('el chat del pedido es bidireccional entre cliente, tienda y repartidor, y nadie más', async () => {
    const contact = new GetOrderContactUseCase(orders, users, new PresenceRegistry());
    await create.execute(newOrder());
    expect((await contact.execute(ana.id, ID, 'business')).id).toBe(rosa.id);
    // Antes del pago la dueña aún no ve el pedido.
    await expect(contact.execute(rosa.id, ID, 'customer')).rejects.toThrow(NotFoundError);
    await pay();
    expect(await contact.execute(rosa.id, ID, 'customer')).toMatchObject({ id: ana.id, publicKey: ana.publicKey });
    // Sin repartidor todavía, no hay con quién.
    await expect(contact.execute(ana.id, ID, 'driver')).rejects.toThrow(NotFoundError);
    await decide.execute(rosa.id, ID, 'accept');
    await decide.execute(rosa.id, ID, 'ready');
    await take.execute(carlos.id, ID);
    expect((await contact.execute(ana.id, ID, 'driver')).id).toBe(carlos.id);
    expect((await contact.execute(carlos.id, ID, 'customer')).id).toBe(ana.id);
    expect((await contact.execute(carlos.id, ID, 'business')).id).toBe(rosa.id);
    expect((await contact.execute(rosa.id, ID, 'driver')).id).toBe(carlos.id);
    await expect(contact.execute(beto.id, ID, 'customer')).rejects.toThrow(NotFoundError);
    await expect(contact.execute(lucia.id, ID, 'customer')).rejects.toThrow(NotFoundError);
  });
});
