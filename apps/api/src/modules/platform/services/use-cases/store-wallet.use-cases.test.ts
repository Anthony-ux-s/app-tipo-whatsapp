import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../../../../kernel/domain-error';
import { PresenceRegistry } from '../../../../infra/realtime/presence.registry';
import {
  InMemoryBusinessesRepository,
  InMemoryPushSubscriptions,
  InMemoryStoreLedger,
  RecordingPushSender,
  makeBusiness,
  makeUser,
} from '../../../../testing/in-memory.fakes';
import { NotificationDispatcher } from '../../messaging/push/use-cases/notification-dispatcher';
import { DEFAULT_DRIVER_PAY } from '../../../../kernel/driver-earnings';
import { DriverPayPolicy } from '../driver-pay.policy';
import type { OrderRecord } from '../orders.repository';
import {
  DueStorePayoutsUseCase,
  GetStoreWalletUseCase,
  RecordStoreSaleUseCase,
  ReserveStorePayoutUseCase,
  SetStorePayoutPhoneUseCase,
  SettleStorePayoutUseCase,
  StuckStorePayoutsUseCase,
} from './store-wallet.use-cases';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('billetera de la tienda (ventas, comisión y depósitos)', () => {
  const rosa = makeUser({ displayName: 'Rosa' });
  const luis = makeUser({ displayName: 'Luis' });
  let businesses: InMemoryBusinessesRepository;
  let ledger: InMemoryStoreLedger;
  let push: RecordingPushSender;
  let record: RecordStoreSaleUseCase;
  let wallet: GetStoreWalletUseCase;
  let setPhone: SetStorePayoutPhoneUseCase;
  let reserve: ReserveStorePayoutUseCase;
  let settle: SettleStorePayoutUseCase;
  let due: DueStorePayoutsUseCase;
  let stuck: StuckStorePayoutsUseCase;

  /** Un pedido entregado de S/ 100 en productos (más delivery, que no es de la tienda). */
  const delivered = (id: string, subtotalCents = 10_000) =>
    ({ id, service: 'ferreteria', subtotalCents, totalCents: subtotalCents + 650, business: { id: 'biz_1', ownerId: rosa.id } }) as unknown as OrderRecord;

  beforeEach(async () => {
    businesses = new InMemoryBusinessesRepository();
    businesses.businesses.push(makeBusiness({ id: 'biz_1', ownerId: rosa.id, service: 'ferreteria' }));
    ledger = new InMemoryStoreLedger(businesses);
    const subs = new InMemoryPushSubscriptions();
    await subs.save({ userId: rosa.id, endpoint: 'https://push.example/rosa', p256dh: 'k', auth: 'a' });
    push = new RecordingPushSender();
    const dispatcher = new NotificationDispatcher(subs, push, new PresenceRegistry());
    const pay = new DriverPayPolicy({ driverPay: DEFAULT_DRIVER_PAY });
    record = new RecordStoreSaleUseCase(ledger);
    wallet = new GetStoreWalletUseCase(businesses, ledger, pay);
    setPhone = new SetStorePayoutPhoneUseCase(businesses);
    reserve = new ReserveStorePayoutUseCase(businesses, ledger, pay);
    settle = new SettleStorePayoutUseCase(businesses, ledger, dispatcher);
    due = new DueStorePayoutsUseCase(businesses, ledger, pay);
    stuck = new StuckStorePayoutsUseCase(businesses, ledger);
  });

  it('una venta entregada suma los productos menos la comisión de Parla (el delivery no es de la tienda)', async () => {
    await record.execute(delivered('ord_1'));
    const w = await wallet.execute(rosa.id);
    expect(w).toMatchObject({ balanceCents: 9_500, pendingPayoutCents: 0, payoutPhone: null, commissionPercent: 5, autoPayoutAt: '23:00' });
    expect(w.entries.map((e) => [e.kind, e.amountCents])).toEqual(expect.arrayContaining([['sale', 10_000], ['commission', -500]]));
  });

  it('si la entrega se confirma dos veces, la venta no se anota dos veces', async () => {
    await record.execute(delivered('ord_1'));
    await record.execute(delivered('ord_1'));
    expect((await wallet.execute(rosa.id)).balanceCents).toBe(9_500);
  });

  it('un pedido sin tienda no anota nada, y quien no tiene tienda no tiene billetera', async () => {
    await record.execute({ ...delivered('ord_2'), business: null } as unknown as OrderRecord);
    expect(ledger.entries).toHaveLength(0);
    await expect(wallet.execute(luis.id)).rejects.toThrow(NotFoundError);
  });

  it('el número de PagaYa se guarda normalizado y se rechaza si no es un celular', async () => {
    expect(await setPhone.execute(rosa.id, '+51 987 654 321')).toEqual({ payoutPhone: '987654321' });
    expect((await wallet.execute(rosa.id)).payoutPhone).toBe('987654321');
    await expect(setPhone.execute(rosa.id, '12345')).rejects.toThrow(ValidationError);
  });

  describe('depósitos', () => {
    beforeEach(async () => {
      await record.execute(delivered('ord_1', 50_000));
      await setPhone.execute(rosa.id, '987654321');
    });

    it('aparta todo el saldo en un depósito pendiente hacia su PagaYa y no deja pedir otro hasta cerrarlo', async () => {
      const reserved = await reserve.execute(rosa.id, 'manual');
      expect(reserved).toMatchObject({ amountCents: 47_500, destination: '987654321' });
      expect(reserved.payoutId).toMatch(/^sp_/);
      expect(await wallet.execute(rosa.id)).toMatchObject({ balanceCents: 0, pendingPayoutCents: 47_500 });
      await expect(reserve.execute(rosa.id, 'manual')).rejects.toThrow('Ya tienes un retiro en curso');
    });

    it('sin número de PagaYa o sin saldo suficiente no se aparta nada, y se dice qué falta', async () => {
      const sinNumero = makeBusiness({ id: 'biz_2', ownerId: luis.id, service: 'mercado' });
      businesses.businesses.push(sinNumero);
      await expect(reserve.execute(luis.id, 'manual')).rejects.toThrow('número de PagaYa');
      await setPhone.execute(luis.id, '911222333');
      await expect(reserve.execute(luis.id, 'manual')).rejects.toThrow('No tienes saldo para retirar');
      await expect(reserve.execute('nadie', 'manual')).rejects.toThrow(NotFoundError);
    });

    it('al depositarse queda pagado, avisa a la dueña y el cierre se puede repetir sin efecto', async () => {
      const { payoutId } = await reserve.execute(rosa.id, 'auto');
      const paid = await settle.execute(payoutId, 'paid', 'tr_1', null);
      await flush();
      expect(paid).toEqual({ payoutId, amountCents: 47_500, status: 'paid', transferId: 'tr_1' });
      expect(push.sent.map((s) => s.payload.title)).toEqual(['Te depositamos tus ventas']);
      expect(await settle.execute(payoutId, 'paid', 'tr_1', null)).toMatchObject({ status: 'paid' });
      await expect(settle.execute(payoutId, 'failed', null, 'x')).rejects.toThrow(ConflictError);
      expect((await wallet.execute(rosa.id)).balanceCents).toBe(0);
    });

    it('si la transferencia falla, el dinero vuelve al saldo y se puede pedir de nuevo', async () => {
      const { payoutId } = await reserve.execute(rosa.id, 'manual');
      expect(await settle.execute(payoutId, 'failed', null, 'PagaYa no responde')).toMatchObject({ status: 'failed' });
      expect((await wallet.execute(rosa.id)).balanceCents).toBe(47_500);
      await expect(reserve.execute(rosa.id, 'manual')).resolves.toMatchObject({ amountCents: 47_500 });
      await expect(settle.execute('sp_nada', 'paid', 't', null)).rejects.toThrow(NotFoundError);
    });

    it('el depósito automático solo incluye tiendas con saldo suficiente, con PagaYa y sin un depósito en curso', async () => {
      expect(await due.execute()).toEqual([{ userId: rosa.id }]);
      await reserve.execute(rosa.id, 'auto');
      expect(await due.execute()).toEqual([]);
    });

    it('un depósito que quedó pendiente se concilia con su número de PagaYa', async () => {
      const { payoutId } = await reserve.execute(rosa.id, 'auto');
      const later = new Date(Date.now() + 11 * 60_000);
      expect(await stuck.execute(10, later)).toEqual([{ payoutId, amountCents: 47_500, destination: '987654321' }]);
      expect(await stuck.execute(10, new Date())).toEqual([]);
    });
  });
});
