import type { InternalCreateOrder, Order } from '@parla/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../../../kernel/domain-error';
import { PresenceRegistry } from '../../../infra/realtime/presence.registry';
import {
  InMemoryAuthRepository,
  InMemoryOrdersRepository,
  InMemoryPushSubscriptions,
  makeUser,
  RecordingPushSender,
  RecordingRealtime,
} from '../../../testing/in-memory.fakes';
import { NotificationDispatcher } from '../messaging/push/use-cases/notification-dispatcher';
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
  let orders: InMemoryOrdersRepository;
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
    const users = new InMemoryAuthRepository();
    users.users.push(ana, beto);
    orders = new InMemoryOrdersRepository();
    realtime = new RecordingRealtime();
    const subs = new InMemoryPushSubscriptions();
    await subs.save({ userId: ana.id, endpoint: 'https://push.example/ana', p256dh: 'k', auth: 'a' });
    push = new RecordingPushSender();
    const events = new OrderEvents(realtime, new NotificationDispatcher(subs, push, new PresenceRegistry()));
    create = new CreateOrderUseCase(orders, users, events);
    update = new UpdateOrderUseCase(orders, events);
  });

  it('guarda el pedido pendiente de pago y se lo avisa solo a su dueña', async () => {
    const order = await create.execute(newOrder());
    expect(order).toMatchObject({ status: 'pending_payment', totalCents: 2070, userId: ana.id, delivery: null });
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

  it('pago → buscando motorizado → en camino → entregado, con avisos push', async () => {
    await create.execute(newOrder());
    const paidAt = new Date().toISOString();
    expect((await update.execute('ord_abc12345', { expectStatus: 'pending_payment', status: 'paid', paidAt })).payment.paidAt).toBe(paidAt);
    await update.execute('ord_abc12345', { status: 'searching_driver', delivery: { provider: 'MotoYa', driverName: null, vehicle: null, etaMinutes: 30, updatedAt: paidAt } });
    await update.execute('ord_abc12345', { status: 'on_the_way', delivery: { provider: 'MotoYa', driverName: 'Carlos', vehicle: 'Moto · ABC-123', etaMinutes: 20, updatedAt: paidAt } });
    const done = await update.execute('ord_abc12345', { status: 'delivered' });
    await flush();

    expect(done.status).toBe('delivered');
    expect(done.delivery?.driverName).toBe('Carlos');
    expect(realtime.events('order:updated').map((e) => (e.payload as Order).status)).toEqual([
      'pending_payment', 'paid', 'searching_driver', 'on_the_way', 'delivered',
    ]);
    expect(push.sent.map((s) => s.payload.title)).toEqual(['Pago recibido', 'Tu pedido va en camino', 'Pedido entregado']);
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
});
