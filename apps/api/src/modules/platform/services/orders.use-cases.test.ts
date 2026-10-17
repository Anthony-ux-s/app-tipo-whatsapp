import type { BusinessOrder, DriverOrder, InternalCreateOrder, Order } from '@parla/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../kernel/domain-error';
import { PresenceRegistry } from '../../../infra/realtime/presence.registry';
import {
  InMemoryAuthRepository,
  InMemoryBusinessesRepository,
  InMemoryDriverLedger,
  InMemoryDriversRepository,
  InMemoryOrdersRepository,
  InMemoryPushSubscriptions,
  makeUser,
  RecordingPushSender,
  RecordingRealtime,
} from '../../../testing/in-memory.fakes';
import { NotificationDispatcher } from '../messaging/push/use-cases/notification-dispatcher';
import { DEFAULT_DRIVER_PAY } from '../../../kernel/driver-earnings';
import { DriverPayPolicy } from './driver-pay.policy';
import { WatchDeliveriesUseCase } from './use-cases/delivery-watch.use-cases';
import {
  DuePayoutsUseCase,
  GetDriverWalletUseCase,
  ReservePayoutUseCase,
  SetPayoutPhoneUseCase,
  SettlePayoutUseCase,
  StuckPayoutsUseCase,
} from './use-cases/driver-wallet.use-cases';
import {
  DecideBusinessOrderUseCase,
  GetBusinessOrderUseCase,
  GetBusinessStatusUseCase,
  GetInternalBusinessUseCase,
  UpdateMyBusinessUseCase,
  GetOrderContactUseCase,
  ListBusinessOrdersUseCase,
} from './use-cases/business-orders.use-cases';
import { AcceptDeliveryUseCase, DeliverOrderUseCase, ListDriverOrdersUseCase, ReleaseDeliveryUseCase } from './use-cases/driver-orders.use-cases';
import {
  GetDriverEarningsUseCase,
  LeaveDriverUseCase,
  RegisterDriverUseCase,
  ReportDriverLocationUseCase,
  SetDriverOnlineUseCase,
  UpdateDriverProfileUseCase,
} from './use-cases/driver-profile.use-cases';
import {
  CreateOrderUseCase,
  GetMyOrderUseCase,
  ListMyOrdersUseCase,
  OrderEvents,
  RateOrderUseCase,
  RenewDeliveryCodeUseCase,
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
  let ledger: InMemoryDriverLedger;
  let orders: InMemoryOrdersRepository;
  let events: OrderEvents;
  let realtime: RecordingRealtime;
  let push: RecordingPushSender;
  let dispatcher: NotificationDispatcher;
  /** Reparto por defecto: 95 % para el repartidor, depósito automático desde S/ 5. */
  const payPolicy = new DriverPayPolicy({ driverPay: DEFAULT_DRIVER_PAY });
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
    etaMinutes: 30,
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
    businesses.businesses.push({ id: 'biz_1', name: 'Bodega MercaYa', service: 'mercado', ownerId: rosa.id, address: 'Av. Benavides 1180', acceptingOrders: true, opensAt: '08:00', closesAt: '22:00' });
    drivers = new InMemoryDriversRepository();
    drivers.drivers.push(
      { userId: carlos.id, vehicle: 'Moto', plate: 'B7K-482', online: true, active: true, location: null, payoutPhone: '987654321' },
      { userId: lucia.id, vehicle: 'Moto', plate: 'D5T-663', online: true, active: true, location: null, payoutPhone: null },
    );
    ledger = new InMemoryDriverLedger(drivers);
    orders = new InMemoryOrdersRepository(businesses, drivers);
    realtime = new RecordingRealtime();
    const subs = new InMemoryPushSubscriptions();
    for (const [u, name] of [[ana, 'ana'], [rosa, 'rosa'], [carlos, 'carlos']] as const) {
      await subs.save({ userId: u.id, endpoint: `https://push.example/${name}`, p256dh: 'k', auth: 'a' });
    }
    push = new RecordingPushSender();
    dispatcher = new NotificationDispatcher(subs, push, new PresenceRegistry());
    events = new OrderEvents(realtime, users, drivers, dispatcher, payPolicy);
    create = new CreateOrderUseCase(orders, users, businesses, events);
    update = new UpdateOrderUseCase(orders, events);
    decide = new DecideBusinessOrderUseCase(orders, users, events);
    take = new AcceptDeliveryUseCase(drivers, orders, users, events, payPolicy);
    deliver = new DeliverOrderUseCase(drivers, orders, users, events, ledger, payPolicy);
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
    // Hora estimada: el tiempo de Rapidito desde que lo toma, y el tramo final al recogerlo.
    expect((await orders.findById(ID))!.delivery?.etaMinutes).toBe(30);
    await decide.execute(rosa.id, ID, 'handoff');
    expect((await orders.findById(ID))!.delivery?.etaMinutes).toBe(18);
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
    expect((await new ListDriverOrdersUseCase(drivers, orders, users, payPolicy).execute(lucia.id)).available).toEqual([]);
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
    it('la dueña pausa los pedidos y cambia el horario; el cliente y el gateway lo ven', async () => {
      const update = new UpdateMyBusinessUseCase(businesses);
      const noon = new Date('2026-10-17T12:00:00-05:00');
      expect((await new GetBusinessStatusUseCase(businesses, orders).execute('mercado', noon))?.open).toBe(true);
      await expect(update.execute(beto.id, { acceptingOrders: false })).rejects.toThrow(NotFoundError);
      await expect(update.execute(rosa.id, { opensAt: '9:00' })).rejects.toThrow(ValidationError);
      await expect(update.execute(rosa.id, {})).rejects.toThrow('No hay cambios');
      expect(await update.execute(rosa.id, { acceptingOrders: false })).toMatchObject({ acceptingOrders: false });
      const internal = await new GetInternalBusinessUseCase(businesses).execute('service', 'mercado', noon);
      expect(internal).toMatchObject({ ownerId: rosa.id, open: false, closedMessage: expect.stringContaining('pausó') });
      await update.execute(rosa.id, { acceptingOrders: true, opensAt: '13:00', closesAt: '23:00' });
      expect((await new GetBusinessStatusUseCase(businesses, orders).execute('mercado', noon))?.closedMessage).toBe('Bodega MercaYa está cerrada. Abre a las 13:00.');
      expect((await new GetInternalBusinessUseCase(businesses).execute('owner', rosa.id, noon)).service).toBe('mercado');
    });

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
      await expect(decide.execute(rosa.id, ID, 'reassign')).rejects.toThrow(ConflictError);
      await decide.execute(rosa.id, ID, 'ready');
      await expect(decide.execute(rosa.id, ID, 'handoff')).rejects.toThrow('ningún repartidor');
      expect(realtime.events('order:updated').filter((e) => (e.payload as Order).status === 'preparing')).toHaveLength(1);
    });

    it('al rechazar (con devolución, vía gateway), la clienta se entera y el pedido termina', async () => {
      await create.execute(newOrder());
      await pay();
      const refundedAt = new Date().toISOString();
      const rejected = await update.execute(ID, { expectStatus: 'paid', status: 'rejected', refundedAt, note: 'Rechazado por la tienda · pago devuelto' });
      expect(rejected).toMatchObject({ status: 'rejected', payment: { refundedAt } });
      expect(rejected.timeline.at(-1)?.note).toBe('Rechazado por la tienda · pago devuelto');
      await flush();
      expect(push.sent.find((s) => s.payload.title === 'Tu pedido no fue aceptado')?.payload.body).toContain('Te devolvimos S/ 20.70');
      await expect(decide.execute(rosa.id, ID, 'accept')).rejects.toThrow(ConflictError);
    });

    it('un pago que llega después de cancelar solo registra la devolución', async () => {
      await create.execute(newOrder());
      await update.execute(ID, { expectStatus: 'pending_payment', status: 'cancelled', note: 'Cancelado por el cliente' });
      const before = realtime.events('order:updated').length;
      const late = await update.execute(ID, { expectStatus: 'cancelled', status: 'cancelled', paidAt: new Date().toISOString(), refundedAt: new Date().toISOString(), note: 'Pago recibido tras cancelar · devuelto' });
      expect(late.status).toBe('cancelled');
      expect(late.payment.refundedAt).toBeTruthy();
      expect(late.timeline.map((t) => t.note)).toContain('Pago recibido tras cancelar · devuelto');
      expect(realtime.events('order:updated')).toHaveLength(before + 1);
    });

    it('si el repartidor no llega, la tienda pide otro y el pedido se vuelve a ofrecer', async () => {
      await readyForDrivers();
      await take.execute(carlos.id, ID);
      const again = await decide.execute(rosa.id, ID, 'reassign');
      expect(again).toMatchObject({ status: 'searching_driver', delivery: null });
      expect((await orders.findById(ID))!.driverId).toBeNull();
      expect(again.timeline.at(-1)?.note).toContain('Carlos Huamán no llegó');
      await flush();
      expect(push.sent.filter((s) => s.target.endpoint.endsWith('/carlos')).map((s) => s.payload.title)).toContain('Ya no tienes este pedido');
      expect((await take.execute(lucia.id, ID)).mine).toBe(true);
    });
  });

  it('el repartidor suelta un pedido antes de recogerlo; después de recogerlo, no', async () => {
    await readyForDrivers();
    const release = new ReleaseDeliveryUseCase(drivers, orders, users, events, payPolicy);
    await take.execute(carlos.id, ID);
    const dropped = await release.execute(carlos.id, ID);
    expect(dropped).toMatchObject({ status: 'searching_driver', mine: false });
    expect((await new ListDriverOrdersUseCase(drivers, orders, users, payPolicy).execute(lucia.id)).available.map((o) => o.id)).toEqual([ID]);
    await take.execute(lucia.id, ID);
    await decide.execute(rosa.id, ID, 'handoff');
    await expect(release.execute(lucia.id, ID)).rejects.toThrow('Ya recogiste');
  });

  it('con el código bloqueado, solo la clienta genera uno nuevo y vuelve a funcionar', async () => {
    await readyForDrivers();
    await take.execute(carlos.id, ID);
    await decide.execute(rosa.id, ID, 'handoff');
    const renew = new RenewDeliveryCodeUseCase(orders, events);
    await expect(renew.execute(ana.id, ID)).rejects.toThrow('sigue activo');
    const old = await codeOf();
    const wrong = old === '0000' ? '1111' : '0000';
    for (let i = 0; i < 5; i++) await deliver.execute(carlos.id, ID, wrong).catch(() => undefined);
    expect((await new GetMyOrderUseCase(orders).execute(ana.id, ID)).deliveryCodeLocked).toBe(true);
    await expect(renew.execute(beto.id, ID)).rejects.toThrow(NotFoundError);
    const renewed = await renew.execute(ana.id, ID);
    expect(renewed.deliveryCodeLocked).toBe(false);
    expect((await deliver.execute(carlos.id, ID, renewed.deliveryCode!)).status).toBe('delivered');
  });

  describe('repartidores', () => {
    it('cualquiera se registra, edita su vehículo, se conecta y deja de repartir (y puede volver)', async () => {
      const register = new RegisterDriverUseCase(drivers);
      await expect(register.execute(beto.id, { vehicle: 'Moto', plate: 'x' })).rejects.toThrow('placa');
      await expect(register.execute(beto.id, { vehicle: 'Patineta' as never })).rejects.toThrow('Elige un vehículo');
      expect(await register.execute(beto.id, { vehicle: 'Moto', plate: ' abc 123 ' })).toEqual({ vehicle: 'Moto', plate: 'ABC123', online: false });
      await expect(register.execute(beto.id, { vehicle: 'Bicicleta' })).rejects.toThrow('Ya eres repartidor');
      expect(await new UpdateDriverProfileUseCase(drivers).execute(beto.id, { vehicle: 'Bicicleta', plate: 'ABC123' })).toEqual({ vehicle: 'Bicicleta', plate: '', online: false });
      // Desconectado no recibe ofertas ni puede tomar pedidos
      await readyForDrivers();
      expect(await drivers.listUserIds()).not.toContain(beto.id);
      await expect(take.execute(beto.id, ID)).rejects.toThrow('Conéctate');
      await new SetDriverOnlineUseCase(drivers).execute(beto.id, true);
      expect(await drivers.listUserIds()).toContain(beto.id);
      await take.execute(beto.id, ID);
      // Con una entrega en curso no puede irse; al terminarla, sí
      const leave = new LeaveDriverUseCase(drivers, orders);
      await expect(leave.execute(beto.id)).rejects.toThrow('entrega en curso');
      await decide.execute(rosa.id, ID, 'handoff');
      await deliver.execute(beto.id, ID, await codeOf());
      await leave.execute(beto.id);
      await expect(take.execute(beto.id, ID)).rejects.toThrow(ForbiddenError);
      expect(await register.execute(beto.id, { vehicle: 'A pie' })).toMatchObject({ vehicle: 'A pie', online: false });
    });

    it('sus ganancias suman las tarifas de lo entregado', async () => {
      await readyForDrivers();
      await take.execute(carlos.id, ID);
      await decide.execute(rosa.id, ID, 'handoff');
      await deliver.execute(carlos.id, ID, await codeOf());
      expect(await new GetDriverEarningsUseCase(drivers, orders, ledger).execute(carlos.id)).toEqual({
        // 95 % de S/ 6.50: Rapidito descuenta S/ 0.33 de comisión
        todayCents: 617, todayDeliveries: 1, weekCents: 617, weekDeliveries: 1, totalCents: 617, totalDeliveries: 1,
        tipsCents: 0, commissionCents: 33, rating: { average: null, count: 0 },
      });
    });

    it('su ubicación solo llega a la clienta y la tienda del pedido que lleva', async () => {
      const report = new ReportDriverLocationUseCase(drivers, orders, realtime);
      const here = { lat: -12.12, lng: -77.03 };
      expect(await report.execute(carlos.id, here)).toEqual({ shared: 0 }); // sin entrega en curso, nada
      await readyForDrivers();
      await take.execute(carlos.id, ID);
      const t0 = new Date();
      expect(await report.execute(carlos.id, here, t0)).toEqual({ shared: 1 });
      const sent = realtime.events('delivery:location');
      expect(sent).toHaveLength(1);
      expect(sent[0].userIds.sort()).toEqual([ana.id, rosa.id].sort());
      expect(sent[0].payload).toMatchObject({ orderId: ID, lat: -12.12, lng: -77.03 });
      // Muy seguido se ignora; el pedido trae la última ubicación para el mapa
      expect(await report.execute(carlos.id, { lat: -12.13, lng: -77.03 }, new Date(t0.getTime() + 1_000))).toEqual({ shared: 0 });
      expect((await new GetMyOrderUseCase(orders).execute(ana.id, ID)).driverLocation).toMatchObject({ lat: -12.12, lng: -77.03 });
      await expect(report.execute(carlos.id, { lat: 200, lng: 0 })).rejects.toThrow(ValidationError);
      await expect(report.execute(beto.id, here)).rejects.toThrow(ForbiddenError);
    });
  });

  it('la propina se suma al total, la cobra el pedido y la gana el repartidor', async () => {
    await expect(create.execute(newOrder({ tipCents: 200 }))).rejects.toThrow('propina');
    await create.execute(newOrder({ tipCents: 200, totalCents: 2270 }));
    await pay();
    await decide.execute(rosa.id, ID, 'accept');
    await decide.execute(rosa.id, ID, 'ready');
    expect((await new ListDriverOrdersUseCase(drivers, orders, users, payPolicy).execute(carlos.id)).available[0]).toMatchObject({
      deliveryFeeCents: 650,
      tipCents: 200,
      commissionCents: 33,
      earningsCents: 817,
    });
    await take.execute(carlos.id, ID);
    await decide.execute(rosa.id, ID, 'handoff');
    await deliver.execute(carlos.id, ID, await codeOf());
    // La propina va completa: 617 (95 % de la tarifa) + 200
    expect(await new GetDriverEarningsUseCase(drivers, orders, ledger).execute(carlos.id)).toMatchObject({ totalCents: 817, tipsCents: 200, commissionCents: 33 });
    await expect(create.execute(newOrder({ id: 'ord_toobig12', tipCents: 10_001, totalCents: 12_071 }))).rejects.toThrow('propina');
  });

  it('al recibirlo, la clienta califica al repartidor y a la tienda una sola vez', async () => {
    await readyForDrivers();
    const rate = new RateOrderUseCase(orders, events);
    await take.execute(carlos.id, ID);
    await expect(rate.execute(ana.id, ID, { driverStars: 5 })).rejects.toThrow('cuando recibas');
    await decide.execute(rosa.id, ID, 'handoff');
    await deliver.execute(carlos.id, ID, await codeOf());
    await expect(rate.execute(beto.id, ID, { driverStars: 5 })).rejects.toThrow(NotFoundError);
    await expect(rate.execute(ana.id, ID, { driverStars: 6 })).rejects.toThrow('1 a 5');
    await expect(rate.execute(ana.id, ID, {})).rejects.toThrow('al menos una');
    const rated = await rate.execute(ana.id, ID, { driverStars: 5, storeStars: 4, comment: '  ¡Rapidísimo!  ' });
    expect(rated.rating).toMatchObject({ driverStars: 5, storeStars: 4, comment: '¡Rapidísimo!' });
    await expect(rate.execute(ana.id, ID, { driverStars: 1 })).rejects.toThrow('Ya calificaste');
    expect((await new GetDriverEarningsUseCase(drivers, orders, ledger).execute(carlos.id)).rating).toEqual({ average: 5, count: 1 });
    expect((await new GetBusinessStatusUseCase(businesses, orders).execute('mercado'))?.rating).toEqual({ average: 4, count: 1 });
    // La tienda ve la calificación en su pedido
    expect((realtime.events('business-order:updated').at(-1)!.payload as BusinessOrder).rating?.storeStars).toBe(4);
  });

  describe('vigilancia de los deliveries', () => {
    const config = { intervalMs: 60_000, untakenMinutes: 5, pickupMinutes: 25, silentMinutes: 8 };
    const later = (minutes: number) => new Date(Date.now() + minutes * 60_000);

    it('un pedido que nadie toma se vuelve a ofrecer y se avisa a la tienda, sin repetir antes de tiempo', async () => {
      const watch = new WatchDeliveriesUseCase(orders, drivers, events, dispatcher, payPolicy);
      await readyForDrivers();
      expect((await watch.execute(config, later(2))).nudged).toEqual([]);
      expect((await watch.execute(config, later(6))).nudged).toEqual([ID]);
      expect((await watch.execute(config, later(8))).nudged).toEqual([]);
      expect((await watch.execute(config, later(12))).nudged).toEqual([ID]);
      await flush();
      expect(push.sent.filter((s) => s.target.endpoint.endsWith('/rosa')).map((s) => s.payload.title)).toContain('Tu pedido sigue esperando repartidor');
    });

    it('si el repartidor no lo recoge a tiempo o se queda sin señal, se reasigna solo', async () => {
      const watch = new WatchDeliveriesUseCase(orders, drivers, events, dispatcher, payPolicy);
      const report = new ReportDriverLocationUseCase(drivers, orders, realtime);
      await readyForDrivers();
      await take.execute(carlos.id, ID);
      // Con señal reciente y antes del límite, no pasa nada
      await report.execute(carlos.id, { lat: -12.12, lng: -77.03 }, later(5));
      expect((await watch.execute(config, later(10))).reassigned).toEqual([]);
      // 8 minutos sin señal: se le quita y se ofrece a otros
      expect((await watch.execute(config, later(14))).reassigned).toEqual([ID]);
      const order = (await orders.findById(ID))!;
      expect(order).toMatchObject({ status: 'searching_driver', driverId: null });
      expect(order.timeline.at(-1)?.note).toBe('Reasignado automáticamente: Carlos Huamán se quedó sin señal');
      await flush();
      expect(push.sent.filter((s) => s.target.endpoint.endsWith('/carlos')).map((s) => s.payload.title)).toContain('Ya no tienes este pedido');
      // Lucía lo toma con señal, pero no lo recoge en 25 minutos
      await take.execute(lucia.id, ID);
      for (const m of [5, 10, 15, 20, 24]) await report.execute(lucia.id, { lat: -12.12, lng: -77.03 }, later(m));
      expect((await watch.execute(config, later(20))).reassigned).toEqual([]);
      expect((await watch.execute(config, later(26))).reassigned).toEqual([ID]);
      expect((await orders.findById(ID))!.timeline.at(-1)?.note).toContain('no lo recogió en 25 minutos');
    });
  });

  describe('billetera del repartidor', () => {
    const deliverOne = async (id: string, tipCents = 0) => {
      await create.execute(newOrder({ id, tipCents, totalCents: 2070 + tipCents }));
      await update.execute(id, { expectStatus: 'pending_payment', status: 'paid' });
      await decide.execute(rosa.id, id, 'accept');
      await decide.execute(rosa.id, id, 'ready');
      await take.execute(carlos.id, id);
      await decide.execute(rosa.id, id, 'handoff');
      await deliver.execute(carlos.id, id, (await orders.findById(id))!.deliveryCode);
    };

    it('cada entrega suma tarifa − 5 % + propina una sola vez, y el saldo se ve en la billetera', async () => {
      await deliverOne('ord_wallet0001', 300);
      // Confirmar la entrega otra vez no la anota dos veces
      await deliver.execute(carlos.id, 'ord_wallet0001', (await orders.findById('ord_wallet0001'))!.deliveryCode);
      const wallet = await new GetDriverWalletUseCase(drivers, ledger, payPolicy).execute(carlos.id);
      expect(wallet).toMatchObject({ balanceCents: 917, pendingPayoutCents: 0, payoutPhone: '987654321', driverSharePercent: 95 });
      expect(wallet.entries.map((e) => [e.kind, e.amountCents]).sort()).toEqual([['commission', -33], ['delivery_fee', 650], ['tip', 300]]);
    });

    it('el retiro reserva el saldo, no se duplica, y si PagaYa falla el dinero vuelve', async () => {
      await deliverOne('ord_wallet0002');
      const reserve = new ReservePayoutUseCase(drivers, ledger, payPolicy);
      const settle = new SettlePayoutUseCase(ledger, dispatcher);
      await expect(reserve.execute(lucia.id, 'manual')).rejects.toThrow('número de PagaYa');
      const first = await reserve.execute(carlos.id, 'manual');
      expect(first).toMatchObject({ amountCents: 617, destination: '987654321' });
      await expect(reserve.execute(carlos.id, 'manual')).rejects.toThrow('retiro en curso');
      expect(await new GetDriverWalletUseCase(drivers, ledger, payPolicy).execute(carlos.id)).toMatchObject({ balanceCents: 0, pendingPayoutCents: 617 });
      // Falla la transferencia: vuelve al saldo y se puede reintentar
      expect((await settle.execute(first.payoutId, 'failed', null, 'PagaYa no responde')).status).toBe('failed');
      expect((await new GetDriverWalletUseCase(drivers, ledger, payPolicy).execute(carlos.id)).balanceCents).toBe(617);
      const second = await reserve.execute(carlos.id, 'manual');
      expect(await settle.execute(second.payoutId, 'paid', 'tr_1', null)).toMatchObject({ status: 'paid', transferId: 'tr_1', amountCents: 617 });
      expect((await settle.execute(second.payoutId, 'paid', 'tr_1', null)).status).toBe('paid'); // idempotente
      await expect(settle.execute(second.payoutId, 'failed', null, 'x')).rejects.toThrow(ConflictError);
      expect((await new GetDriverWalletUseCase(drivers, ledger, payPolicy).execute(carlos.id)).balanceCents).toBe(0);
      await expect(reserve.execute(carlos.id, 'manual')).rejects.toThrow('No tienes saldo');
      await flush();
      expect(push.sent.filter((x) => x.target.endpoint.endsWith('/carlos')).map((x) => x.payload.title)).toContain('Te depositamos tus ganancias');
    });

    it('el depósito automático solo incluye a quien tiene S/ 5+, PagaYa y nada en curso', async () => {
      await deliverOne('ord_wallet0003');
      const due = new DuePayoutsUseCase(ledger, payPolicy);
      expect(await due.execute()).toEqual([{ userId: carlos.id }]);
      await new SetPayoutPhoneUseCase(drivers).execute(lucia.id, '912 345 678');
      expect(await due.execute()).toEqual([{ userId: carlos.id }]); // Lucía no tiene saldo
      await expect(new SetPayoutPhoneUseCase(drivers).execute(lucia.id, '123')).rejects.toThrow(ValidationError);
      await new ReservePayoutUseCase(drivers, ledger, payPolicy).execute(carlos.id, 'auto');
      expect(await due.execute()).toEqual([]);
    });

    it('con DRIVER_SHARE_PERCENT=90 y mínimo de S/ 10, la entrega y los depósitos lo respetan', async () => {
      const custom = new DriverPayPolicy({ driverPay: { sharePercent: 90, minAutoPayoutCents: 1000, minManualPayoutCents: 700 } });
      const deliver90 = new DeliverOrderUseCase(drivers, orders, users, events, ledger, custom);
      await create.execute(newOrder({ id: 'ord_custom0001' }));
      await update.execute('ord_custom0001', { expectStatus: 'pending_payment', status: 'paid' });
      await decide.execute(rosa.id, 'ord_custom0001', 'accept');
      await decide.execute(rosa.id, 'ord_custom0001', 'ready');
      await take.execute(carlos.id, 'ord_custom0001');
      await decide.execute(rosa.id, 'ord_custom0001', 'handoff');
      const done = await deliver90.execute(carlos.id, 'ord_custom0001', (await orders.findById('ord_custom0001'))!.deliveryCode);
      // 10 % de S/ 6.50 = S/ 0.65 para Rapidito
      expect(done).toMatchObject({ commissionCents: 65, commissionPercent: 10, earningsCents: 585 });
      expect(await new GetDriverWalletUseCase(drivers, ledger, custom).execute(carlos.id)).toMatchObject({ balanceCents: 585, driverSharePercent: 90, minAutoPayoutCents: 1000 });
      expect(await new DuePayoutsUseCase(ledger, custom).execute()).toEqual([]); // S/ 5.85 < S/ 10
      await expect(new ReservePayoutUseCase(drivers, ledger, custom).execute(carlos.id, 'manual')).rejects.toThrow('mínimo S/ 7.00');
    });

    it('un depósito que quedó pendiente aparece para conciliar pasados los minutos', async () => {
      await deliverOne('ord_wallet0004');
      const { payoutId } = await new ReservePayoutUseCase(drivers, ledger, payPolicy).execute(carlos.id, 'manual');
      const stuck = new StuckPayoutsUseCase(drivers, ledger);
      expect(await stuck.execute(10)).toEqual([]);
      expect(await stuck.execute(10, new Date(Date.now() + 11 * 60_000))).toEqual([{ payoutId, amountCents: 617, destination: '987654321' }]);
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
