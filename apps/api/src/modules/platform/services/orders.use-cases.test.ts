import { RecordStoreSaleUseCase } from './use-cases/store-wallet.use-cases';
import { StoreStatusSync } from './use-cases/store-status-sync';
import { toOrder } from './use-cases/orders.use-cases';
import { WatchBigOrdersUseCase } from './use-cases/big-order-watch.use-cases';
import type { BusinessOrder, DriverOrder, InternalCreateOrder, Order } from '@parla/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../kernel/domain-error';
import { DEFAULT_DELIVERY_PRICING } from '../../../kernel/delivery-pricing';
import { PresenceRegistry } from '../../../infra/realtime/presence.registry';
import {
  InMemoryAuthRepository,
  InMemoryBusinessesRepository,
  InMemoryAddresses,
  InMemoryClaims,
  InMemoryCoupons,
  InMemoryDriverLedger,
  InMemoryPhotos,
  makeBusiness,
  makeDriver,
  InMemoryDriversRepository,
  InMemoryOrdersRepository,
  InMemoryStoreLedger,
  InMemoryPushSubscriptions,
  makeUser,
  RecordingPushSender,
  RecordingRealtime,
} from '../../../testing/in-memory.fakes';
import { NotificationDispatcher } from '../messaging/push/use-cases/notification-dispatcher';
import { DEFAULT_DRIVER_PAY } from '../../../kernel/driver-earnings';
import { DriverPayPolicy } from './driver-pay.policy';
import { DispatchPolicy } from './dispatch.policy';
import { DEFAULT_DISPATCH } from '../../../kernel/dispatch';
import { WatchDeliveriesUseCase } from './use-cases/delivery-watch.use-cases';
import { GetDriverDocumentUseCase, ListDriversForReviewUseCase, ReviewDriverUseCase } from './use-cases/admin-drivers.use-cases';
import {
  CreateClaimUseCase,
  ListAdminClaimsUseCase,
  RejectClaimUseCase,
  ReserveClaimRefundUseCase,
  SettleClaimRefundUseCase,
} from './use-cases/claims.use-cases';
import { GetOrderPhotoUseCase } from './use-cases/photos.use-cases';
import { CreateCouponUseCase, ListCouponsUseCase, QuoteCouponUseCase, SetCouponActiveUseCase } from './use-cases/coupons.use-cases';
import { DeleteAddressUseCase, LabelAddressUseCase, ListMyAddressesUseCase } from './use-cases/addresses.use-cases';
import { IsAdminUseCase, ListAdminOrdersUseCase } from './use-cases/admin-orders.use-cases';
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
import { OptimalDispatchUseCase } from './use-cases/optimal-dispatch.use-cases';
import {
  GetDriverEarningsUseCase,
  LeaveDriverUseCase,
  RegisterDriverUseCase,
  ReportDriverLocationUseCase,
  SetDriverDocumentUseCase,
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
  /** Soporte de Parla. */
  const soporte = makeUser({ displayName: 'Soporte Parla', isAdmin: true });
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
  /** Ofertas por cercanía por defecto: 3, 6 y 12 km, cada 2 minutos. */
  const dispatchPolicy = new DispatchPolicy({ dispatch: DEFAULT_DISPATCH });
  let photos: InMemoryPhotos;
  let coupons: InMemoryCoupons;
  let addresses: InMemoryAddresses;
  let claims: InMemoryClaims;
  let create: CreateOrderUseCase;
  let update: UpdateOrderUseCase;
  let decide: DecideBusinessOrderUseCase;
  let take: AcceptDeliveryUseCase;
  let deliver: DeliverOrderUseCase;

  const newOrder = (overrides: Partial<InternalCreateOrder> = {}): InternalCreateOrder => ({
    id: ID,
    userId: ana.id,
    service: 'biz_1',
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
    users.users.push(ana, beto, rosa, carlos, lucia, soporte);
    businesses = new InMemoryBusinessesRepository();
    businesses.businesses.push(makeBusiness({ id: 'biz_1', ownerId: rosa.id }));
    drivers = new InMemoryDriversRepository();
    drivers.drivers.push(makeDriver(carlos.id, { payoutPhone: '987654321' }), makeDriver(lucia.id, { plate: 'D5T-663' }));
    photos = new InMemoryPhotos();
    ledger = new InMemoryDriverLedger(drivers);
    orders = new InMemoryOrdersRepository(businesses, drivers);
    claims = new InMemoryClaims(orders);
    realtime = new RecordingRealtime();
    const subs = new InMemoryPushSubscriptions();
    for (const [u, name] of [[ana, 'ana'], [rosa, 'rosa'], [carlos, 'carlos'], [soporte, 'soporte']] as const) {
      await subs.save({ userId: u.id, endpoint: `https://push.example/${name}`, p256dh: 'k', auth: 'a' });
    }
    push = new RecordingPushSender();
    dispatcher = new NotificationDispatcher(subs, push, new PresenceRegistry());
    events = new OrderEvents(realtime, users, drivers, dispatcher, payPolicy, dispatchPolicy);
    coupons = new InMemoryCoupons(orders);
    addresses = new InMemoryAddresses();
    create = new CreateOrderUseCase(orders, users, businesses, events, coupons, addresses);
    update = new UpdateOrderUseCase(orders, events);
    decide = new DecideBusinessOrderUseCase(orders, users, events, dispatchPolicy);
    // Un pedido por viaje en estas pruebas (soporte puede subirlo hasta 5).
    const oneAtATime = { get: async () => ({ pricing: { ...DEFAULT_DELIVERY_PRICING, maxActiveOrders: 1 }, updatedAt: null, updatedById: null }), save: async () => { throw new Error('no se usa'); } };
    take = new AcceptDeliveryUseCase(drivers, orders, users, events, payPolicy, dispatchPolicy, oneAtATime);
    deliver = new DeliverOrderUseCase(drivers, orders, users, events, ledger, payPolicy, dispatchPolicy, photos);
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
    const done = await deliver.execute(carlos.id, ID, { code: await codeOf() });
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
    await expect(deliver.execute(carlos.id, ID, { code: await codeOf() })).rejects.toThrow('Primero recoge');
    await decide.execute(rosa.id, ID, 'handoff');
    const wrong = (await codeOf()) === '0000' ? '1111' : '0000';
    await expect(deliver.execute(carlos.id, ID, { code: wrong })).rejects.toThrow('Te quedan 4 intentos');
    for (let i = 0; i < 4; i++) await deliver.execute(carlos.id, ID, { code: wrong }).catch(() => undefined);
    await expect(deliver.execute(carlos.id, ID, { code: await codeOf() })).rejects.toThrow('Demasiados intentos');
    expect((await orders.findById(ID))!.status).toBe('on_the_way');
  });

  it('gana el primer repartidor; el otro ya no lo ve; y una entrega a la vez', async () => {
    await readyForDrivers();
    await take.execute(carlos.id, ID);
    await expect(take.execute(lucia.id, ID)).rejects.toThrow(NotFoundError);
    expect((await new ListDriverOrdersUseCase(drivers, orders, users, payPolicy, dispatchPolicy).execute(lucia.id)).available).toEqual([]);
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
      expect((await new GetBusinessStatusUseCase(businesses, orders).execute('biz_1', noon))?.open).toBe(true);
      await expect(update.execute(beto.id, { acceptingOrders: false })).rejects.toThrow(NotFoundError);
      await expect(update.execute(rosa.id, { opensAt: '9:00' })).rejects.toThrow(ValidationError);
      await expect(update.execute(rosa.id, {})).rejects.toThrow('No hay cambios');
      expect(await update.execute(rosa.id, { acceptingOrders: false })).toMatchObject({ acceptingOrders: false });
      const internal = await new GetInternalBusinessUseCase(businesses).execute('store', 'biz_1', noon);
      expect(internal).toMatchObject({ ownerId: rosa.id, open: false, closedMessage: expect.stringContaining('pausó') });
      await update.execute(rosa.id, { acceptingOrders: true, opensAt: '13:00', closesAt: '23:00' });
      expect((await new GetBusinessStatusUseCase(businesses, orders).execute('biz_1', noon))?.closedMessage).toBe('Bodega MercaYa está cerrada. Abre a las 13:00.');
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
    const release = new ReleaseDeliveryUseCase(drivers, orders, users, events, payPolicy, dispatchPolicy);
    await take.execute(carlos.id, ID);
    const dropped = await release.execute(carlos.id, ID);
    expect(dropped).toMatchObject({ status: 'searching_driver', mine: false });
    expect((await new ListDriverOrdersUseCase(drivers, orders, users, payPolicy, dispatchPolicy).execute(lucia.id)).available.map((o) => o.id)).toEqual([ID]);
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
    for (let i = 0; i < 5; i++) await deliver.execute(carlos.id, ID, { code: wrong }).catch(() => undefined);
    expect((await new GetMyOrderUseCase(orders).execute(ana.id, ID)).deliveryCodeLocked).toBe(true);
    await expect(renew.execute(beto.id, ID)).rejects.toThrow(NotFoundError);
    const renewed = await renew.execute(ana.id, ID);
    expect(renewed.deliveryCodeLocked).toBe(false);
    expect((await deliver.execute(carlos.id, ID, { code: renewed.deliveryCode! })).status).toBe('delivered');
  });

  describe('pedidos grandes', () => {
    /** Una obra: un solo producto, S/ 700. */
    const bigByTotal = () =>
      newOrder({ lines: [{ productId: 'CEM-1', name: 'Cemento', unit: 'bolsa', quantity: 10, unitPriceCents: 7000, totalCents: 70000 }], subtotalCents: 70000, totalCents: 70650 });
    /** Mucha cantidad, poco dinero: 30 unidades de S/ 1. */
    const bigByUnits = () =>
      newOrder({ lines: [{ productId: 'CLA-1', name: 'Clavos', unit: 'unidad', quantity: 30, unitPriceCents: 100, totalCents: 3000 }], subtotalCents: 3000, totalCents: 3650 });
    const titlesFor = (who: string) => push.sent.filter((s) => s.target.endpoint.endsWith(`/${who}`)).map((s) => s.payload.title);

    it('un pedido normal no es grande: aviso normal y sin el teléfono del cliente', async () => {
      Object.assign(ana, { phone: '+51999000111' });
      await create.execute(newOrder());
      await pay();
      await flush();
      expect(toOrder((await orders.findById(ID))!).big).toBe(false);
      expect(titlesFor('rosa')).toEqual(['Nuevo pedido']);
      const forStore = realtime.events('business-order:updated').at(-1)!.payload as { big: boolean; customer: { phone?: string | null } };
      expect(forStore.big).toBe(false);
      expect(forStore.customer.phone).toBeUndefined();
      Object.assign(ana, { phone: null });
    });

    it('lo es por total o por unidades; la tienda recibe un aviso GRANDE y ve el teléfono del cliente para confirmarlo', async () => {
      Object.assign(ana, { phone: '+51999000111' });
      for (const [index, make] of [bigByTotal, bigByUnits].entries()) {
        const id = `ord_grande${index}xx`;
        await create.execute({ ...make(), id });
        await update.execute(id, { expectStatus: 'pending_payment', status: 'paid' });
        await flush();
        expect(toOrder((await orders.findById(id))!).big).toBe(true);
        const forStore = realtime.events('business-order:updated').filter((e) => (e.payload as { id: string }).id === id).at(-1)!.payload as { big: boolean; customer: { phone?: string | null } };
        expect(forStore).toMatchObject({ big: true, customer: { phone: '+51999000111' } });
      }
      expect(titlesFor('rosa')).toEqual(['Pedido GRANDE', 'Pedido GRANDE']);
      Object.assign(ana, { phone: null });
    });

    it('cada tienda tiene sus umbrales: con los suyos, un pedido chico puede ser grande', async () => {
      await businesses.setBigOrderRules('biz_1', { totalCents: 2_000, units: null, whatsapp: '+51 987 654 321' });
      await create.execute(newOrder());
      const order = (await orders.findById(ID))!;
      expect(toOrder(order).big).toBe(true);
      expect(order.business!.bigOrder).toEqual({ totalCents: 2_000, units: 25, whatsapp: '51987654321' });
    });

    it('vigilancia: a los 10 minutos recuerda a la tienda, a los 20 avisa a soporte, una sola vez cada uno', async () => {
      const watch = new WatchBigOrdersUseCase(orders, users, dispatcher);
      await create.execute(bigByTotal());
      await pay();
      await flush();
      const at = (minutes: number) => new Date(Date.now() + minutes * 60_000);

      expect(await watch.execute(at(9))).toEqual({ reminded: [], escalated: [] });
      expect(await watch.execute(at(11))).toEqual({ reminded: [ID], escalated: [] });
      expect(await watch.execute(at(12))).toEqual({ reminded: [], escalated: [] });
      expect(await watch.execute(at(21))).toEqual({ reminded: [], escalated: [ID] });
      expect(await watch.execute(at(25))).toEqual({ reminded: [], escalated: [] });
      await flush();
      expect(titlesFor('rosa')).toContain('Pedido GRANDE sin confirmar');
      expect(titlesFor('soporte')).toEqual(['Pedido grande sin atender']);
    });

    it('vigilancia: un pedido normal o uno que la tienda ya aceptó no genera avisos', async () => {
      const watch = new WatchBigOrdersUseCase(orders, users, dispatcher);
      await create.execute(newOrder());
      await pay();
      const later = () => new Date(Date.now() + 60 * 60_000);
      expect(await watch.execute(later())).toEqual({ reminded: [], escalated: [] });

      await create.execute({ ...bigByUnits(), id: 'ord_aceptado1x' });
      await update.execute('ord_aceptado1x', { expectStatus: 'pending_payment', status: 'paid' });
      await decide.execute(rosa.id, 'ord_aceptado1x', 'accept');
      expect(await watch.execute(later())).toEqual({ reminded: [], escalated: [] });
    });
  });

  describe('estados hacia la ferretería', () => {
    const calls: { url: string; method?: string; headers: Record<string, string>; body: unknown }[] = [];
    const fetchStub = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, headers: init?.headers as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response('{}', { status: 200 });
    });

    beforeEach(() => {
      calls.length = 0;
      fetchStub.mockClear();
      vi.stubGlobal('fetch', fetchStub);
    });
    afterEach(() => vi.unstubAllGlobals());

    const connect = () =>
      businesses.setSource('biz_1', 'api', { format: 'redwiiil', baseUrl: 'https://api.ferrohub.pe', prefix: '', apiKey: 'wiiil_llave', adminKey: '' });

    it('cada paso del pedido se le dice a la ferretería con su nombre de estado', async () => {
      await connect();
      const sync = new StoreStatusSync(businesses);
      await create.execute(newOrder());
      const record = (await orders.findById(ID))!;
      const steps: [OrderStatus, string][] = [
        ['paid', 'nuevo'],
        ['preparing', 'preparando'],
        ['searching_driver', 'listo'],
        ['driver_assigned', 'listo'],
        ['on_the_way', 'en_camino'],
        ['delivered', 'entregado'],
        ['rejected', 'cancelado'],
        ['cancelled', 'cancelado'],
      ];
      for (const [status] of steps) await sync.statusChanged({ ...record, status });
      expect(calls.map((c) => (c.body as { estado: string }).estado)).toEqual(steps.map(([, estado]) => estado));
      expect(calls[0]).toMatchObject({ url: `https://api.ferrohub.pe/api/v1/orders/${ID}`, method: 'PATCH', headers: { authorization: 'Bearer wiiil_llave' } });
    });

    it('sin conexión con la ferretería (catálogo de Parla) no se llama a nadie, y un estado sin equivalente tampoco', async () => {
      const sync = new StoreStatusSync(businesses);
      await create.execute(newOrder());
      const record = (await orders.findById(ID))!;
      await sync.statusChanged({ ...record, status: 'paid' });
      await connect();
      await sync.statusChanged({ ...record, status: 'pending_payment' });
      expect(fetchStub).not.toHaveBeenCalled();
    });

    it('si la ferretería no tiene la ruta (404) o no responde, el pedido sigue como siempre', async () => {
      await connect();
      const sync = new StoreStatusSync(businesses);
      await create.execute(newOrder());
      const record = (await orders.findById(ID))!;
      fetchStub.mockResolvedValueOnce(new Response('{}', { status: 404 }));
      await expect(sync.statusChanged({ ...record, status: 'paid' })).resolves.toBeUndefined();
      fetchStub.mockRejectedValueOnce(new Error('timeout'));
      await expect(sync.statusChanged({ ...record, status: 'preparing' })).resolves.toBeUndefined();
    });

    it('el flujo real avisa solo: al pagar y al aceptar el pedido llegan nuevo y preparando', async () => {
      await connect();
      const wired = new OrderEvents(realtime, users, drivers, dispatcher, payPolicy, dispatchPolicy, new StoreStatusSync(businesses));
      const createWired = new CreateOrderUseCase(orders, users, businesses, wired, coupons, addresses);
      const updateWired = new UpdateOrderUseCase(orders, wired);
      const decideWired = new DecideBusinessOrderUseCase(orders, users, wired, dispatchPolicy);
      await createWired.execute(newOrder());
      await updateWired.execute(ID, { expectStatus: 'pending_payment', status: 'paid' });
      await decideWired.execute(rosa.id, ID, 'accept');
      await flush();
      expect(calls.map((c) => (c.body as { estado: string }).estado)).toEqual(['nuevo', 'preparando']);
    });
  });

  describe('ventas de la tienda al entregar', () => {
    it('al entregar, la venta (productos menos comisión) suma a la billetera de la tienda, una sola vez', async () => {
      const storeLedger = new InMemoryStoreLedger(businesses);
      const withSales = new DeliverOrderUseCase(drivers, orders, users, events, ledger, payPolicy, dispatchPolicy, photos, new RecordStoreSaleUseCase(storeLedger));
      await readyForDrivers();
      await take.execute(carlos.id, ID);
      await decide.execute(rosa.id, ID, 'handoff');
      // newOrder(): productos S/ 14.20 + delivery S/ 6.50. Antes de entregar, la tienda no tiene nada.
      expect((await storeLedger.balance('biz_1')).availableCents).toBe(0);
      await withSales.execute(carlos.id, ID, { code: await codeOf() });
      await withSales.execute(carlos.id, ID, { code: await codeOf() }).catch(() => undefined);
      // 1420 de productos − 5 % de comisión (71) = 1349; el delivery es del repartidor.
      expect((await storeLedger.balance('biz_1')).availableCents).toBe(1349);
      expect(storeLedger.entries.filter((e) => e.kind === 'sale')).toHaveLength(1);
    });
  });

  describe('repartidores', () => {
    it('soporte no puede registrarse como repartidor', async () => {
      const register = new RegisterDriverUseCase(drivers, users);
      await expect(register.execute(soporte.id, { vehicle: 'Moto', plate: 'ABC-123', dniNumber: '45678912', licenseNumber: 'q12345678' })).rejects.toThrow(ForbiddenError);
    });

    it('cualquiera se registra, edita su vehículo, se conecta y deja de repartir (y puede volver)', async () => {
      const register = new RegisterDriverUseCase(drivers, users);
      const docs = { dniNumber: '45678912', licenseNumber: 'q12345678' };
      await expect(register.execute(beto.id, { vehicle: 'Moto', plate: 'x', ...docs })).rejects.toThrow('placa');
      await expect(register.execute(beto.id, { vehicle: 'Patineta' as never, ...docs })).rejects.toThrow('Elige un vehículo');
      await expect(register.execute(beto.id, { vehicle: 'Moto', plate: 'ABC123', dniNumber: '123' })).rejects.toThrow('DNI');
      await expect(register.execute(beto.id, { vehicle: 'Moto', plate: 'ABC123', dniNumber: '45678912' })).rejects.toThrow('licencia');
      expect(await register.execute(beto.id, { vehicle: 'Moto', plate: ' abc 123 ', ...docs })).toEqual({
        vehicle: 'Moto', plate: 'ABC123', online: false, status: 'pending', reviewNote: null, hasDocument: false,
      });
      expect((await drivers.findByUser(beto.id))!.licenseNumber).toBe('Q12345678');
      await expect(register.execute(beto.id, { vehicle: 'Bicicleta', dniNumber: '45678912' })).rejects.toThrow('Ya eres repartidor');
      expect(await new UpdateDriverProfileUseCase(drivers).execute(beto.id, { vehicle: 'Bicicleta', plate: 'ABC123', dniNumber: '45678912' })).toMatchObject({ vehicle: 'Bicicleta', plate: '', online: false });
      // En revisión no puede conectarse; soporte lo aprueba
      const setOnline = new SetDriverOnlineUseCase(drivers);
      await expect(setOnline.execute(beto.id, true)).rejects.toThrow(ForbiddenError);
      await drivers.update(beto.id, { status: 'approved' });
      // Desconectado no recibe ofertas ni puede tomar pedidos
      await readyForDrivers();
      expect((await drivers.listOnline()).map((d) => d.userId)).not.toContain(beto.id);
      await expect(take.execute(beto.id, ID)).rejects.toThrow('Conéctate');
      await setOnline.execute(beto.id, true);
      expect((await drivers.listOnline()).map((d) => d.userId)).toContain(beto.id);
      await take.execute(beto.id, ID);
      // Con una entrega en curso no puede irse; al terminarla, sí
      const leave = new LeaveDriverUseCase(drivers, orders);
      await expect(leave.execute(beto.id)).rejects.toThrow('entrega en curso');
      await decide.execute(rosa.id, ID, 'handoff');
      await deliver.execute(beto.id, ID, { code: await codeOf() });
      await leave.execute(beto.id);
      await expect(take.execute(beto.id, ID)).rejects.toThrow(ForbiddenError);
      // Al volver sigue aprobado (no repite la verificación)
      expect(await register.execute(beto.id, { vehicle: 'A pie', dniNumber: '45678912' })).toMatchObject({ vehicle: 'A pie', online: false, status: 'approved' });
    });

    it('sus ganancias suman las tarifas de lo entregado', async () => {
      await readyForDrivers();
      await take.execute(carlos.id, ID);
      await decide.execute(rosa.id, ID, 'handoff');
      await deliver.execute(carlos.id, ID, { code: await codeOf() });
      expect(await new GetDriverEarningsUseCase(drivers, orders, ledger).execute(carlos.id)).toEqual({
        // 95 % de S/ 6.50: Rapidito descuenta S/ 0.33 de comisión
        todayCents: 617, todayDeliveries: 1, weekCents: 617, weekDeliveries: 1, totalCents: 617, totalDeliveries: 1,
        tipsCents: 0, commissionCents: 33, rating: { average: null, count: 0 },
      });
    });

    it('su ubicación solo llega a la clienta y la tienda del pedido que lleva', async () => {
      const report = new ReportDriverLocationUseCase(drivers, orders, realtime);
      const here = { lat: -12.12, lng: -77.03 };
      // Conectado sin entrega: se guarda (para las ofertas cercanas) pero no se comparte con nadie
      expect(await report.execute(carlos.id, here, new Date(Date.now() - 60_000))).toEqual({ shared: 0 });
      expect((await drivers.findByUser(carlos.id))!.location).toMatchObject(here);
      expect(realtime.events('delivery:location')).toHaveLength(0);
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
    expect((await new ListDriverOrdersUseCase(drivers, orders, users, payPolicy, dispatchPolicy).execute(carlos.id)).available[0]).toMatchObject({
      deliveryFeeCents: 650,
      tipCents: 200,
      commissionCents: 33,
      earningsCents: 817,
    });
    await take.execute(carlos.id, ID);
    await decide.execute(rosa.id, ID, 'handoff');
    await deliver.execute(carlos.id, ID, { code: await codeOf() });
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
    await deliver.execute(carlos.id, ID, { code: await codeOf() });
    await expect(rate.execute(beto.id, ID, { driverStars: 5 })).rejects.toThrow(NotFoundError);
    await expect(rate.execute(ana.id, ID, { driverStars: 6 })).rejects.toThrow('1 a 5');
    await expect(rate.execute(ana.id, ID, {})).rejects.toThrow('al menos una');
    const rated = await rate.execute(ana.id, ID, { driverStars: 5, storeStars: 4, comment: '  ¡Rapidísimo!  ' });
    expect(rated.rating).toMatchObject({ driverStars: 5, storeStars: 4, comment: '¡Rapidísimo!' });
    await expect(rate.execute(ana.id, ID, { driverStars: 1 })).rejects.toThrow('Ya calificaste');
    expect((await new GetDriverEarningsUseCase(drivers, orders, ledger).execute(carlos.id)).rating).toEqual({ average: 5, count: 1 });
    expect((await new GetBusinessStatusUseCase(businesses, orders).execute('biz_1'))?.rating).toEqual({ average: 4, count: 1 });
    // La tienda ve la calificación en su pedido
    expect((realtime.events('business-order:updated').at(-1)!.payload as BusinessOrder).rating?.storeStars).toBe(4);
  });

  describe('vigilancia de los deliveries', () => {
    const config = { intervalMs: 60_000, untakenMinutes: 5, pickupMinutes: 25, silentMinutes: 8 };
    const later = (minutes: number) => new Date(Date.now() + minutes * 60_000);

    it('un pedido que nadie toma se vuelve a ofrecer y se avisa a la tienda, sin repetir antes de tiempo', async () => {
      const watch = new WatchDeliveriesUseCase(orders, drivers, events, dispatcher, users, realtime, payPolicy, dispatchPolicy);
      await readyForDrivers();
      expect((await watch.execute(config, later(2))).nudged).toEqual([]);
      expect((await watch.execute(config, later(6))).nudged).toEqual([ID]);
      expect((await watch.execute(config, later(8))).nudged).toEqual([]);
      expect((await watch.execute(config, later(12))).nudged).toEqual([ID]);
      await flush();
      expect(push.sent.filter((s) => s.target.endpoint.endsWith('/rosa')).map((s) => s.payload.title)).toContain('Tu pedido sigue esperando repartidor');
    });

    it('si el repartidor no lo recoge a tiempo o se queda sin señal, se reasigna solo', async () => {
      const watch = new WatchDeliveriesUseCase(orders, drivers, events, dispatcher, users, realtime, payPolicy, dispatchPolicy);
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
      await deliver.execute(carlos.id, id, { code: (await orders.findById(id))!.deliveryCode });
    };

    it('cada entrega suma tarifa − 5 % + propina una sola vez, y el saldo se ve en la billetera', async () => {
      await deliverOne('ord_wallet0001', 300);
      // Confirmar la entrega otra vez no la anota dos veces
      await deliver.execute(carlos.id, 'ord_wallet0001', { code: (await orders.findById('ord_wallet0001'))!.deliveryCode });
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
      const deliver90 = new DeliverOrderUseCase(drivers, orders, users, events, ledger, custom, dispatchPolicy, photos);
      await create.execute(newOrder({ id: 'ord_custom0001' }));
      await update.execute('ord_custom0001', { expectStatus: 'pending_payment', status: 'paid' });
      await decide.execute(rosa.id, 'ord_custom0001', 'accept');
      await decide.execute(rosa.id, 'ord_custom0001', 'ready');
      await take.execute(carlos.id, 'ord_custom0001');
      await decide.execute(rosa.id, 'ord_custom0001', 'handoff');
      const done = await deliver90.execute(carlos.id, 'ord_custom0001', { code: (await orders.findById('ord_custom0001'))!.deliveryCode });
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
  describe('ofertas por cercanía', () => {
    /** La tienda en Miraflores; Carlos a ~1 km y Lucía a ~9 km. */
    const store = { lat: -12.1268, lng: -77.0195 };
    const later = (minutes: number) => new Date(Date.now() + minutes * 60_000);

    describe('asignación óptima', () => {
      const optimalSettings = { get: async () => ({ pricing: { ...DEFAULT_DELIVERY_PRICING, dispatchMode: 'optimal' as const, exclusiveOfferSeconds: 45 }, updatedAt: null, updatedById: null }), save: async () => { throw new Error('no se usa'); } };
      /** Sin servidor de rutas en las pruebas: línea recta × factor de calles. */
      const noStreets = { route: async () => null, matrix: async () => null };
      const policy = new DispatchPolicy({ dispatch: DEFAULT_DISPATCH }, optimalSettings);
      let optimal: OptimalDispatchUseCase;
      let list: ListDriverOrdersUseCase;
      let accept: AcceptDeliveryUseCase;

      beforeEach(async () => {
        businesses.businesses[0].location = store;
        // Carlos a ~1 km de la tienda y Lucía a ~2 km: los dos dentro de la primera oleada.
        await drivers.saveLocation(carlos.id, { lat: -12.12, lng: -77.03 }, new Date());
        await drivers.saveLocation(lucia.id, { lat: -12.135, lng: -77.006 }, new Date());
        decide = new DecideBusinessOrderUseCase(orders, users, events, policy);
        optimal = new OptimalDispatchUseCase(orders, drivers, optimalSettings, noStreets, users, realtime, dispatcher, policy, payPolicy);
        list = new ListDriverOrdersUseCase(drivers, orders, users, payPolicy, policy);
        accept = new AcceptDeliveryUseCase(drivers, orders, users, events, payPolicy, policy, optimalSettings);
      });

      it('retiene el pedido listo, lo reserva para el más conveniente y solo él lo ve', async () => {
        await readyForDrivers();
        // Recién listo: retenido mientras se decide (nadie lo ve todavía).
        expect((await orders.findById(ID))!.reservedFor).toMatchObject({ driverId: null });
        expect((await list.execute(carlos.id)).available).toEqual([]);

        const round = await optimal.execute();
        expect(round.offered).toEqual([expect.objectContaining({ orderId: ID, driverId: carlos.id })]);
        expect((await list.execute(carlos.id)).available.map((o) => o.id)).toEqual([ID]);
        expect((await list.execute(lucia.id)).available).toEqual([]);
        await expect(accept.execute(lucia.id, ID)).rejects.toThrow();
        const taken = await accept.execute(carlos.id, ID);
        expect(taken.status).toBe('driver_assigned');
        expect((await orders.findById(ID))!.reservedFor).toBeNull();
      });

      it('si el elegido deja vencer la oferta, pasa al siguiente mejor; si nadie queda, a las oleadas', async () => {
        await readyForDrivers();
        await optimal.execute();
        // Carlos no responde en 45 s: la siguiente ronda se lo ofrece a Lucía.
        const second = await optimal.execute(new Date(Date.now() + 50_000));
        expect(second.offered).toEqual([expect.objectContaining({ orderId: ID, driverId: lucia.id })]);
        // Lucía tampoco: vuelve a la oferta por oleadas y lo ven los dos.
        const third = await optimal.execute(new Date(Date.now() + 100_000));
        expect(third.released).toEqual([ID]);
        expect((await orders.findById(ID))!.reservedFor).toBeNull();
        expect((await list.execute(lucia.id)).available.map((o) => o.id)).toEqual([ID]);
      });
    });

    it('primero a los cercanos y, si nadie lo toma, se amplía el radio en oleadas', async () => {
      businesses.businesses[0].location = store;
      await drivers.saveLocation(carlos.id, { lat: -12.12, lng: -77.03 }, new Date());
      await drivers.saveLocation(lucia.id, { lat: -12.05, lng: -77.04 }, new Date());
      const list = new ListDriverOrdersUseCase(drivers, orders, users, payPolicy, dispatchPolicy);
      const watch = new WatchDeliveriesUseCase(orders, drivers, events, dispatcher, users, realtime, payPolicy, dispatchPolicy);
      const config = { intervalMs: 60_000, untakenMinutes: 30, pickupMinutes: 25, silentMinutes: 8 };
      await readyForDrivers();
      await flush();
      // Oleada de 3 km: solo Carlos
      expect(realtime.events('driver-order:updated').map((e) => e.userIds[0])).toEqual([carlos.id]);
      const offer = (await list.execute(carlos.id)).available[0];
      expect(offer.distanceToStoreKm).toBeGreaterThan(0.5);
      expect(offer.distanceToStoreKm).toBeLessThan(2);
      expect((await list.execute(lucia.id)).available).toEqual([]);
      await expect(take.execute(lucia.id, ID)).rejects.toThrow();
      // A los 2 minutos sube a 6 km: Lucía todavía no
      expect((await watch.execute(config, later(2.1))).widened).toEqual([ID]);
      expect((await orders.findById(ID))!.offerRadiusKm).toBe(6);
      expect(realtime.events('driver-order:updated').some((e) => e.userIds.includes(lucia.id))).toBe(false);
      expect((await watch.execute(config, later(3))).widened).toEqual([]);
      // A 12 km le llega a Lucía, y puede tomarlo
      expect((await watch.execute(config, later(4.3))).widened).toEqual([ID]);
      expect(realtime.events('driver-order:updated').filter((e) => e.userIds.includes(lucia.id))).toHaveLength(1);
      await drivers.saveLocation(lucia.id, { lat: -12.05, lng: -77.04 }, later(4.3));
      // Sin más radios, ya se ofrece a todos
      expect((await watch.execute(config, later(6.5))).widened).toEqual([ID]);
      expect((await orders.findById(ID))!.offerRadiusKm).toBeNull();
      expect((await watch.execute(config, later(9))).widened).toEqual([]);
      await take.execute(lucia.id, ID);
      // Si lo suelta, vuelve a empezar por los cercanos
      await new ReleaseDeliveryUseCase(drivers, orders, users, events, payPolicy, dispatchPolicy).execute(lucia.id, ID);
      expect((await orders.findById(ID))!.offerRadiusKm).toBe(3);
    });

    it('sin ubicación reciente, el repartidor solo entra cuando se ofrece a todos', async () => {
      businesses.businesses[0].location = store;
      await drivers.saveLocation(carlos.id, { lat: -12.12, lng: -77.03 }, new Date(Date.now() - 20 * 60_000));
      await readyForDrivers();
      const list = new ListDriverOrdersUseCase(drivers, orders, users, payPolicy, dispatchPolicy);
      expect((await list.execute(carlos.id)).available).toEqual([]);
      // Una tienda sin ubicación se ofrece a todos desde el inicio
      const order = (await orders.findById(ID))!;
      expect(dispatchPolicy.canSee({ ...order, business: { ...order.business!, location: null } }, null)).toBe(true);
    });
  });

  describe('verificación de repartidores', () => {
    const photoOf = async (userId: string, n: string) => {
      const id = `ph${n.repeat(32)}`;
      await photos.create(id, userId);
      return id;
    };

    it('se registra en revisión, sube su documento y soporte lo aprueba o lo rechaza con motivo', async () => {
      const register = new RegisterDriverUseCase(drivers, users);
      const setDocument = new SetDriverDocumentUseCase(drivers, photos);
      const review = new ReviewDriverUseCase(users, drivers, dispatcher, realtime);
      const pending = new ListDriversForReviewUseCase(users, drivers);
      const document = new GetDriverDocumentUseCase(users, drivers);
      const setOnline = new SetDriverOnlineUseCase(drivers);
      await register.execute(beto.id, { vehicle: 'Bicicleta', dniNumber: '45678912' });
      // Solo soporte revisa
      await expect(pending.execute(beto.id, 'pending')).rejects.toThrow(ForbiddenError);
      await expect(review.execute(carlos.id, beto.id, 'approve', '')).rejects.toThrow(ForbiddenError);
      expect((await pending.execute(soporte.id, 'pending')).map((d) => d.userId)).toEqual([beto.id]);
      // Sin documento no se aprueba; la foto debe ser suya
      await expect(review.execute(soporte.id, beto.id, 'approve', '')).rejects.toThrow('documento');
      await expect(setDocument.execute(beto.id, await photoOf(lucia.id, 'a'))).rejects.toThrow(ValidationError);
      const doc = await photoOf(beto.id, 'b');
      expect(await setDocument.execute(beto.id, doc)).toMatchObject({ status: 'pending', hasDocument: true });
      expect(await document.execute(soporte.id, beto.id)).toBe(doc);
      expect(await document.execute(beto.id, beto.id)).toBe(doc);
      await expect(document.execute(lucia.id, beto.id)).rejects.toThrow(ForbiddenError);
      // Rechazo con motivo; al corregir vuelve a revisión
      await expect(review.execute(soporte.id, beto.id, 'reject', '  ')).rejects.toThrow('motivo');
      await review.execute(soporte.id, beto.id, 'reject', 'La foto está borrosa');
      expect((await drivers.findByUser(beto.id))).toMatchObject({ status: 'rejected', reviewNote: 'La foto está borrosa', online: false });
      await expect(setOnline.execute(beto.id, true)).rejects.toThrow(ForbiddenError);
      expect(await setDocument.execute(beto.id, await photoOf(beto.id, 'c'))).toMatchObject({ status: 'pending' });
      await review.execute(soporte.id, beto.id, 'approve', '');
      // Su app se entera al instante
      expect(realtime.events('driver:updated').at(-1)).toMatchObject({ userIds: [beto.id], payload: { status: 'approved' } });
      expect(await setOnline.execute(beto.id, true)).toMatchObject({ online: true, status: 'approved' });
      expect(await pending.execute(soporte.id, 'pending')).toEqual([]);
    });
  });

  it('si la clienta no responde, el repartidor lo deja con una foto que ven ella, la tienda y soporte', async () => {
    await readyForDrivers();
    await take.execute(carlos.id, ID);
    await decide.execute(rosa.id, ID, 'handoff');
    await expect(deliver.execute(carlos.id, ID, {})).rejects.toThrow('foto');
    const anaPhoto = `ph${'d'.repeat(32)}`;
    await photos.create(anaPhoto, ana.id);
    await expect(deliver.execute(carlos.id, ID, { photoId: anaPhoto })).rejects.toThrow(ValidationError);
    const proof = `ph${'e'.repeat(32)}`;
    await photos.create(proof, carlos.id);
    expect((await deliver.execute(carlos.id, ID, { photoId: proof })).status).toBe('delivered');
    const order = (await new GetMyOrderUseCase(orders).execute(ana.id, ID)) as Order;
    expect(order).toMatchObject({ hasDeliveryPhoto: true, deliveredWithoutCode: true });
    expect(order.timeline.at(-1)?.note).toContain('sin código');
    const photo = new GetOrderPhotoUseCase(orders, users);
    for (const viewer of [ana, rosa, carlos, soporte]) expect(await photo.execute(viewer.id, ID)).toBe(proof);
    await expect(photo.execute(beto.id, ID)).rejects.toThrow(NotFoundError);
    await expect(photo.execute(lucia.id, ID)).rejects.toThrow(NotFoundError);
  });

  describe('reclamos', () => {
    const delivered = async () => {
      await create.execute(newOrder({ payment: { ...newOrder().payment, chargeId: 'ch_1' } }));
      await pay();
      await decide.execute(rosa.id, ID, 'accept');
      await decide.execute(rosa.id, ID, 'ready');
      await take.execute(carlos.id, ID);
      await decide.execute(rosa.id, ID, 'handoff');
      await deliver.execute(carlos.id, ID, { code: await codeOf() });
    };

    it('la clienta reclama lo que faltó y soporte le devuelve una parte (con PagaYa, sin duplicar)', async () => {
      const claim = new CreateClaimUseCase(orders, claims, photos, events);
      await create.execute(newOrder({ payment: { ...newOrder().payment, chargeId: 'ch_1' } }));
      await expect(claim.execute(ana.id, ID, { reason: 'other', comment: 'x' })).rejects.toThrow('cuando recibas');
      orders.orders.length = 0;
      await delivered();
      await expect(claim.execute(beto.id, ID, { reason: 'other', comment: 'x' })).rejects.toThrow(NotFoundError);
      await expect(claim.execute(ana.id, ID, { reason: 'missing_items' })).rejects.toThrow('productos');
      await expect(claim.execute(ana.id, ID, { reason: 'missing_items', items: [{ productId: 'AZ-1KG', quantity: 3 }] })).rejects.toThrow('cantidades');
      await expect(claim.execute(ana.id, ID, { reason: 'other', comment: 'x' }, new Date(Date.now() + 49 * 3_600_000))).rejects.toThrow('48 horas');
      // Faltó 1 azúcar (S/ 4.50)
      const opened = await claim.execute(ana.id, ID, { reason: 'missing_items', items: [{ productId: 'AZ-1KG', quantity: 1 }], comment: 'Llegó una sola' });
      expect(opened).toMatchObject({ status: 'open', suggestedCents: 450, items: [{ productId: 'AZ-1KG', name: 'Azúcar rubia', quantity: 1, totalCents: 450 }] });
      await expect(claim.execute(ana.id, ID, { reason: 'other', comment: 'otra' })).rejects.toThrow('abierto');

      const inbox = new ListAdminClaimsUseCase(users, claims, orders);
      await expect(inbox.execute(ana.id, 'open')).rejects.toThrow(ForbiddenError);
      expect(await inbox.execute(soporte.id, 'open')).toMatchObject([{ id: opened.id, customerName: 'Ana Pérez', refundableCents: 2070, driverName: 'Carlos Huamán' }]);

      const reserve = new ReserveClaimRefundUseCase(users, claims, orders);
      const settle = new SettleClaimRefundUseCase(users, claims, orders, events, dispatcher);
      await expect(reserve.execute(ana.id, opened.id, 450)).rejects.toThrow(ForbiddenError);
      await expect(reserve.execute(soporte.id, opened.id, 3000)).rejects.toThrow('Solo se pueden devolver');
      const r1 = await reserve.execute(soporte.id, opened.id, 450);
      expect(r1).toMatchObject({ chargeId: 'ch_1', amountCents: 450, refundRef: expect.stringMatching(/^rf_/) });
      // Repetir (reintento del gateway) devuelve la misma referencia; otro monto, no
      expect(await reserve.execute(soporte.id, opened.id, 450)).toEqual(r1);
      await expect(reserve.execute(soporte.id, opened.id, 500)).rejects.toThrow('en curso');
      // Si PagaYa falla vuelve a abierto; al reintentar, se cierra
      expect(await settle.execute(opened.id, 'failed', null, 'PagaYa no respondió')).toMatchObject({ status: 'open' });
      await reserve.execute(soporte.id, opened.id, 450);
      expect(await settle.execute(opened.id, 'refunded', 'prf_1', null)).toMatchObject({ status: 'refunded', refundCents: 450 });
      expect(await settle.execute(opened.id, 'refunded', 'prf_1', null)).toMatchObject({ status: 'refunded' });
      expect(((await new GetMyOrderUseCase(orders).execute(ana.id, ID)) as Order).claims).toMatchObject([{ status: 'refunded', refundCents: 450 }]);
      await flush();
      expect(push.sent.filter((s) => s.target.endpoint.endsWith('/ana')).map((s) => s.payload.title)).toContain('Te devolvimos tu dinero');

      // Otro reclamo: lo que queda por devolver ya descuenta lo devuelto; soporte puede rechazarlo
      const second = await claim.execute(ana.id, ID, { reason: 'not_delivered' });
      expect(second.suggestedCents).toBe(1620);
      const reject = new RejectClaimUseCase(users, claims, orders, events, dispatcher);
      await expect(reject.execute(soporte.id, second.id, '')).rejects.toThrow('motivo');
      expect(await reject.execute(soporte.id, second.id, 'El repartidor dejó foto de la entrega')).toMatchObject({ status: 'rejected' });
      await expect(reserve.execute(soporte.id, second.id, 100)).rejects.toThrow('ya se resolvió');
      expect((await inbox.execute(soporte.id, 'resolved')).map((c) => c.status).sort()).toEqual(['refunded', 'rejected']);
    });

    it('la foto del reclamo la ven la clienta, la tienda y soporte, pero no el repartidor', async () => {
      await delivered();
      const evidence = `ph${'f'.repeat(32)}`;
      await photos.create(evidence, ana.id);
      const opened = await new CreateClaimUseCase(orders, claims, photos, events).execute(ana.id, ID, { reason: 'damaged', items: [{ productId: 'AR-1KG', quantity: 1 }], photoId: evidence });
      expect(opened).toMatchObject({ hasPhoto: true, suggestedCents: 520 });
      const photo = new GetOrderPhotoUseCase(orders, users);
      for (const viewer of [ana, rosa, soporte]) expect(await photo.execute(viewer.id, ID, opened.id)).toBe(evidence);
      await expect(photo.execute(carlos.id, ID, opened.id)).rejects.toThrow(NotFoundError);
    });
  });
  describe('cupones', () => {
    const newCoupon = (input: Parameters<CreateCouponUseCase['execute']>[1]) => new CreateCouponUseCase(users, coupons).execute(soporte.id, input);

    it('soporte los crea; el gateway cotiza el descuento y el core lo vuelve a validar al crear', async () => {
      await expect(new CreateCouponUseCase(users, coupons).execute(ana.id, { code: 'X10', description: 'x', kind: 'amount', value: 100 })).rejects.toThrow(ForbiddenError);
      await expect(newCoupon({ code: 'no vale!', description: 'x', kind: 'amount', value: 100 })).rejects.toThrow(ValidationError);
      expect(await newCoupon({ code: ' parla5 ', description: 'S/ 5 de descuento', kind: 'amount', value: 500, minSubtotalCents: 1000 })).toMatchObject({ code: 'PARLA5', uses: 0, active: true });
      await expect(newCoupon({ code: 'PARLA5', description: 'otra', kind: 'amount', value: 100 })).rejects.toThrow('Ya existe');
      const quote = new QuoteCouponUseCase(coupons);
      expect(await quote.execute({ code: 'parla5', userId: ana.id, subtotalCents: 1420, deliveryFeeCents: 650 })).toEqual({ code: 'PARLA5', description: 'S/ 5 de descuento', kind: 'amount', discountCents: 500 });
      await expect(quote.execute({ code: 'NOEXISTE', userId: ana.id, subtotalCents: 1420, deliveryFeeCents: 650 })).rejects.toThrow(NotFoundError);
      await expect(quote.execute({ code: 'PARLA5', userId: ana.id, subtotalCents: 900, deliveryFeeCents: 650 })).rejects.toThrow('desde S/ 10.00');

      // Crear con un descuento que no cuadra, o sin cupón, no pasa
      await expect(create.execute(newOrder({ couponCode: 'PARLA5', discountCents: 400, totalCents: 1670 }))).rejects.toThrow('cambió');
      await expect(create.execute(newOrder({ discountCents: 500, totalCents: 1570 }))).rejects.toThrow('necesita un cupón');
      await expect(create.execute(newOrder({ couponCode: 'PARLA5', discountCents: 500, totalCents: 2070 }))).rejects.toThrow('total');
      const order = await create.execute(newOrder({ couponCode: 'parla5', discountCents: 500, totalCents: 1570 }));
      expect(order).toMatchObject({ discountCents: 500, couponCode: 'PARLA5', totalCents: 1570 });
      // Ya lo usó (una vez por persona); si el pedido se cancela, vuelve a quedar libre
      await expect(quote.execute({ code: 'PARLA5', userId: ana.id, subtotalCents: 1420, deliveryFeeCents: 650 })).rejects.toThrow('Ya usaste');
      expect((await new ListCouponsUseCase(users, coupons).execute(soporte.id))[0].uses).toBe(1);
      await update.execute(ID, { expectStatus: 'pending_payment', status: 'cancelled' });
      expect((await quote.execute({ code: 'PARLA5', userId: ana.id, subtotalCents: 1420, deliveryFeeCents: 650 })).discountCents).toBe(500);
      // Pausado no vale
      await new SetCouponActiveUseCase(users, coupons).execute(soporte.id, 'parla5', false);
      await expect(quote.execute({ code: 'PARLA5', userId: ana.id, subtotalCents: 1420, deliveryFeeCents: 650 })).rejects.toThrow('no está activo');
    });

    it('envío gratis solo en el primer pedido; el repartidor igual gana su tarifa', async () => {
      await newCoupon({ code: 'BIENVENIDA', description: 'Envío gratis en tu primer pedido', kind: 'free_delivery', firstOrderOnly: true });
      const quote = new QuoteCouponUseCase(coupons);
      expect((await quote.execute({ code: 'BIENVENIDA', userId: ana.id, subtotalCents: 1420, deliveryFeeCents: 650 })).discountCents).toBe(650);
      await create.execute(newOrder({ couponCode: 'BIENVENIDA', discountCents: 650, totalCents: 1420 }));
      await pay();
      await decide.execute(rosa.id, ID, 'accept');
      await decide.execute(rosa.id, ID, 'ready');
      expect((await new ListDriverOrdersUseCase(drivers, orders, users, payPolicy, dispatchPolicy).execute(carlos.id)).available[0]).toMatchObject({ deliveryFeeCents: 650, earningsCents: 617 });
      // Ya no es su primer pedido
      await expect(quote.execute({ code: 'BIENVENIDA', userId: ana.id, subtotalCents: 1420, deliveryFeeCents: 650 })).rejects.toThrow();
      expect((await quote.execute({ code: 'BIENVENIDA', userId: beto.id, subtotalCents: 1420, deliveryFeeCents: 650 })).discountCents).toBe(650);
    });
  });

  it('las direcciones se recuerdan al pedir; se les pone nombre o se borran', async () => {
    await create.execute(newOrder());
    await create.execute(newOrder({ id: 'ord_second12', address: { line: 'Jr. Cusco 450, Lima', reference: '', location: { lat: -12.05, lng: -77.03 } } }));
    await new Promise((r) => setTimeout(r, 5));
    await create.execute(newOrder({ id: 'ord_third123', address: { line: 'Av. Larco 123, Miraflores', reference: 'Puerta azul' } }));
    const list = new ListMyAddressesUseCase(addresses);
    const mine = await list.execute(ana.id);
    expect(mine.map((a) => [a.line, a.reference])).toEqual([['Av. Larco 123, Miraflores', 'Puerta azul'], ['Jr. Cusco 450, Lima', '']]);
    expect(mine[1].location).toEqual({ lat: -12.05, lng: -77.03 });
    expect(await list.execute(beto.id)).toEqual([]);
    expect(await new LabelAddressUseCase(addresses).execute(ana.id, mine[0].id, '  Casa ')).toMatchObject({ label: 'Casa' });
    await expect(new LabelAddressUseCase(addresses).execute(beto.id, mine[0].id, 'Mía')).rejects.toThrow(NotFoundError);
    await expect(new DeleteAddressUseCase(addresses).execute(beto.id, mine[1].id)).rejects.toThrow(NotFoundError);
    await new DeleteAddressUseCase(addresses).execute(ana.id, mine[1].id);
    expect((await list.execute(ana.id)).map((a) => a.label)).toEqual(['Casa']);
  });

  it('soporte ve todos los pedidos por pestaña y busca por id', async () => {
    await create.execute(newOrder());
    await create.execute(newOrder({ id: 'ord_other123' }));
    await update.execute('ord_other123', { expectStatus: 'pending_payment', status: 'cancelled' });
    const admin = new ListAdminOrdersUseCase(users, orders);
    await expect(admin.execute(ana.id, 'all')).rejects.toThrow(ForbiddenError);
    expect((await admin.execute(soporte.id, 'active')).map((o) => o.id)).toEqual([ID]);
    expect((await admin.execute(soporte.id, 'closed')).map((o) => o.id)).toEqual(['ord_other123']);
    expect(await admin.execute(soporte.id, 'all', 'other')).toMatchObject([{ id: 'ord_other123', customerName: 'Ana Pérez', status: 'cancelled' }]);
    expect(await new IsAdminUseCase(users).execute(soporte.id)).toEqual({ isAdmin: true });
    expect(await new IsAdminUseCase(users).execute(ana.id)).toEqual({ isAdmin: false });
  });
});
