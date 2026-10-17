import type { BusinessOrder, InternalCreateOrder, Order } from '@parla/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../../../kernel/domain-error';
import { PresenceRegistry } from '../../../infra/realtime/presence.registry';
import {
  InMemoryAuthRepository,
  InMemoryBusinessesRepository,
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
import {
  CreateOrderUseCase,
  GetMyOrderUseCase,
  ListMyOrdersUseCase,
  OrderEvents,
  UpdateOrderUseCase,
} from './use-cases/orders.use-cases';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('pedidos de Servicios (core)', () => {
  const ana = makeUser({ displayName: 'Ana' });
  const beto = makeUser({ displayName: 'Beto' });
  /** Dueña de la tienda del Mercado. */
  const rosa = makeUser({ displayName: 'Rosa' });
  let users: InMemoryAuthRepository;
  let businesses: InMemoryBusinessesRepository;
  let orders: InMemoryOrdersRepository;
  let events: OrderEvents;
  let realtime: RecordingRealtime;
  let push: RecordingPushSender;
  let create: CreateOrderUseCase;
  let update: UpdateOrderUseCase;

  const newOrder = (overrides: Partial<InternalCreateOrder> = {}): InternalCreateOrder => ({
    id: 'ord_abc12345',
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

  beforeEach(async () => {
    users = new InMemoryAuthRepository();
    users.users.push(ana, beto, rosa);
    businesses = new InMemoryBusinessesRepository();
    businesses.businesses.push({ id: 'biz_1', name: 'Bodega MercaYa', service: 'mercado', ownerId: rosa.id });
    orders = new InMemoryOrdersRepository(businesses);
    realtime = new RecordingRealtime();
    const subs = new InMemoryPushSubscriptions();
    await subs.save({ userId: ana.id, endpoint: 'https://push.example/ana', p256dh: 'k', auth: 'a' });
    await subs.save({ userId: rosa.id, endpoint: 'https://push.example/rosa', p256dh: 'k', auth: 'a' });
    push = new RecordingPushSender();
    events = new OrderEvents(realtime, users, new NotificationDispatcher(subs, push, new PresenceRegistry()));
    create = new CreateOrderUseCase(orders, users, businesses, events);
    update = new UpdateOrderUseCase(orders, events);
  });

  it('guarda el pedido pendiente de pago y se lo avisa solo a su dueña', async () => {
    const order = await create.execute(newOrder());
    expect(order).toMatchObject({ status: 'pending_payment', totalCents: 2070, userId: ana.id, delivery: null, businessOwnerId: rosa.id });
    expect(order.business).toEqual({ id: 'biz_1', name: 'Bodega MercaYa', ownerId: rosa.id });
    // Mientras no se pague, el negocio no se entera.
    expect(realtime.events('business-order:updated')).toHaveLength(0);
    expect(realtime.events('order:updated')).toHaveLength(1);
    expect(realtime.events('order:updated')[0].userIds).toEqual([ana.id]);
    expect(realtime.events('order:updated')[0].payload).not.toHaveProperty('userId');
  });

  it('rechaza montos que no cuadran, cuentas inexistentes y pedidos repetidos', async () => {
    await expect(create.execute(newOrder({ totalCents: 1 }))).rejects.toThrow(ValidationError);
    await expect(create.execute(newOrder({ userId: 'nadie' }))).rejects.toThrow(NotFoundError);
    await create.execute(newOrder());
    await expect(create.execute(newOrder())).rejects.toThrow(ConflictError);
  });

  it('pago → el negocio acepta → Rapidito → en camino → entregado, con avisos push a ambos', async () => {
    await create.execute(newOrder());
    const paidAt = new Date().toISOString();
    expect((await update.execute('ord_abc12345', { expectStatus: 'pending_payment', status: 'paid', paidAt })).payment.paidAt).toBe(paidAt);
    await new DecideBusinessOrderUseCase(orders, users, events).execute(rosa.id, 'ord_abc12345', 'accept');
    await update.execute('ord_abc12345', { expectStatus: 'preparing', status: 'searching_driver', delivery: { provider: 'Rapidito', driverName: null, vehicle: null, etaMinutes: 30, updatedAt: paidAt } });
    await update.execute('ord_abc12345', { status: 'on_the_way', delivery: { provider: 'Rapidito', driverName: 'Carlos', vehicle: 'Moto · ABC-123', etaMinutes: 20, updatedAt: paidAt } });
    const done = await update.execute('ord_abc12345', { status: 'delivered' });
    await flush();

    expect(done.status).toBe('delivered');
    expect(done.delivery?.driverName).toBe('Carlos');
    expect(realtime.events('order:updated').map((e) => (e.payload as Order).status)).toEqual([
      'pending_payment', 'paid', 'preparing', 'searching_driver', 'on_the_way', 'delivered',
    ]);
    const toRosa = realtime.events('business-order:updated');
    expect(toRosa.map((e) => (e.payload as BusinessOrder).status)).toEqual(['paid', 'preparing', 'searching_driver', 'on_the_way', 'delivered']);
    expect(toRosa.every((e) => e.userIds.length === 1 && e.userIds[0] === rosa.id)).toBe(true);
    expect((toRosa[0].payload as BusinessOrder).customer.displayName).toBe('Ana');
    expect(push.sent.filter((s) => s.target.endpoint.endsWith('/ana')).map((s) => s.payload.title)).toEqual([
      'Pago recibido', 'Están preparando tu pedido', 'Tu pedido está listo', 'Tu pedido va en camino', 'Pedido entregado',
    ]);
    expect(push.sent.filter((s) => s.target.endpoint.endsWith('/rosa')).map((s) => s.payload.title)).toEqual(['Nuevo pedido']);
  });

  it('un aviso de pago repetido no cambia nada (idempotente) y un pedido nunca retrocede', async () => {
    await create.execute(newOrder());
    await update.execute('ord_abc12345', { expectStatus: 'pending_payment', status: 'paid' });
    await expect(update.execute('ord_abc12345', { expectStatus: 'pending_payment', status: 'paid' })).rejects.toThrow(ConflictError);
    await expect(update.execute('ord_abc12345', { status: 'pending_payment' })).rejects.toThrow(ConflictError);
    expect(realtime.events('order:updated')).toHaveLength(2);
  });

  it('cada persona ve solo sus pedidos', async () => {
    await create.execute(newOrder());
    expect(await new ListMyOrdersUseCase(orders).execute(ana.id)).toHaveLength(1);
    expect(await new ListMyOrdersUseCase(orders).execute(beto.id)).toEqual([]);
    await expect(new GetMyOrderUseCase(orders).execute(beto.id, 'ord_abc12345')).rejects.toThrow(NotFoundError);
  });

  describe('el negocio', () => {
    const paid = async () => {
      await create.execute(newOrder());
      await update.execute('ord_abc12345', { expectStatus: 'pending_payment', status: 'paid' });
    };

    it('ve sus pedidos ya pagados con quién los pidió; nadie más los ve', async () => {
      await create.execute(newOrder());
      const list = new ListBusinessOrdersUseCase(businesses, orders, users);
      expect(await list.execute(rosa.id)).toEqual([]);
      await update.execute('ord_abc12345', { expectStatus: 'pending_payment', status: 'paid' });
      const [order] = await list.execute(rosa.id);
      expect(order).toMatchObject({ status: 'paid', customer: { id: ana.id, displayName: 'Ana' } });
      await expect(list.execute(beto.id)).rejects.toThrow(NotFoundError);
      await expect(new GetBusinessOrderUseCase(orders, users).execute(beto.id, 'ord_abc12345')).rejects.toThrow(NotFoundError);
    });

    it('acepta o rechaza una sola vez; repetir la misma decisión no cambia nada', async () => {
      await paid();
      const decide = new DecideBusinessOrderUseCase(orders, users, events);
      await expect(decide.execute(beto.id, 'ord_abc12345', 'accept')).rejects.toThrow(NotFoundError);
      expect((await decide.execute(rosa.id, 'ord_abc12345', 'accept')).status).toBe('preparing');
      expect((await decide.execute(rosa.id, 'ord_abc12345', 'accept')).status).toBe('preparing');
      await expect(decide.execute(rosa.id, 'ord_abc12345', 'reject')).rejects.toThrow(ConflictError);
      expect(realtime.events('order:updated').filter((e) => (e.payload as Order).status === 'preparing')).toHaveLength(1);
    });

    it('al rechazar, la clienta se entera y el pedido termina', async () => {
      await paid();
      expect((await new DecideBusinessOrderUseCase(orders, users, events).execute(rosa.id, 'ord_abc12345', 'reject')).status).toBe('rejected');
      await flush();
      expect(push.sent.map((s) => s.payload.title)).toContain('Tu pedido no fue aceptado');
      await expect(update.execute('ord_abc12345', { status: 'searching_driver' })).rejects.toThrow(ConflictError);
    });

    it('el chat del pedido es bidireccional y solo entre la clienta y la dueña', async () => {
      await create.execute(newOrder());
      const contact = new GetOrderContactUseCase(orders, users, new PresenceRegistry());
      expect((await contact.execute(ana.id, 'ord_abc12345')).id).toBe(rosa.id);
      // Antes del pago la dueña aún no ve el pedido.
      await expect(contact.execute(rosa.id, 'ord_abc12345')).rejects.toThrow(NotFoundError);
      await update.execute('ord_abc12345', { expectStatus: 'pending_payment', status: 'paid' });
      const customer = await contact.execute(rosa.id, 'ord_abc12345');
      expect(customer).toMatchObject({ id: ana.id, publicKey: ana.publicKey });
      await expect(contact.execute(beto.id, 'ord_abc12345')).rejects.toThrow(NotFoundError);
    });
  });
});
