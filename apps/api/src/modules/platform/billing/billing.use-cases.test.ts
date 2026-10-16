import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppEnv } from '../../../config/env.validation';
import { MercadoPagoPaymentGateway, type FetchLike } from '../../../infra/payments/mercadopago-payment-gateway.adapter';
import { addOneMonth, assertCanAddMember, effectivePlan, nextExpiry } from '../../../kernel/billing-plans';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../kernel/domain-error';
import {
  FakePaymentGateway,
  InMemoryPaymentsRepository,
  InMemoryWorkspacesRepository,
  makeUser,
  RecordingRealtime,
} from '../../../testing/in-memory.fakes';
import { JoinByInviteUseCase } from '../workspaces/use-cases/member-use-cases';
import {
  GetBillingOverviewUseCase,
  HandlePaymentWebhookUseCase,
  SandboxCheckoutUseCase,
  SettlePaymentUseCase,
  StartCheckoutUseCase,
} from './use-cases/billing.use-cases';

const env = { publicWebUrl: 'https://parla.example', publicApiUrl: 'https://api.parla.example' } as AppEnv;

describe('reglas de los planes', () => {
  const now = new Date('2026-10-15T12:00:00');

  it('un plan pagado rige hasta su vencimiento y luego vuelve a Gratis', () => {
    expect(effectivePlan('team', new Date('2026-11-01'), now)).toBe('team');
    expect(effectivePlan('team', new Date('2026-10-01'), now)).toBe('free');
    expect(effectivePlan('business', null, now)).toBe('free');
  });

  it('respeta el límite de miembros (los que ya están se quedan)', () => {
    expect(() => assertCanAddMember('free', 9)).not.toThrow();
    expect(() => assertCanAddMember('free', 10)).toThrow(ConflictError);
    expect(() => assertCanAddMember('business', 5000)).not.toThrow();
  });

  it('suma un mes de calendario, y renovar antes de vencer se acumula', () => {
    expect(addOneMonth(new Date(2026, 0, 31)).getDate()).toBe(28);
    const current = { plan: 'team' as const, expiresAt: new Date(2026, 10, 1) };
    expect(nextExpiry(current, 'team', now)).toEqual(new Date(2026, 11, 1));
    expect(nextExpiry(current, 'business', now).getMonth()).toBe(10); // otro plan: empieza hoy
  });
});

describe('pagos de un plan', () => {
  const admin = makeUser({ displayName: 'Laura' });
  const member = makeUser({ displayName: 'Andrés' });
  let workspaces: InMemoryWorkspacesRepository;
  let payments: InMemoryPaymentsRepository;
  let gateway: FakePaymentGateway;
  let realtime: RecordingRealtime;
  let checkout: StartCheckoutUseCase;
  let settle: SettlePaymentUseCase;
  let sandbox: SandboxCheckoutUseCase;
  let overview: GetBillingOverviewUseCase;

  beforeEach(() => {
    workspaces = new InMemoryWorkspacesRepository();
    workspaces.workspaces.push({
      id: 'w1', name: 'Café Andino', description: '', color: 'teal', inviteCode: 'codigo123', allowMemberGroups: true,
      creatorId: admin.id, createdAt: new Date(), memberCount: 2, plan: 'free', planExpiresAt: null,
    });
    workspaces.add(admin, 'w1', 'admin');
    workspaces.add(member, 'w1', 'member');
    payments = new InMemoryPaymentsRepository();
    gateway = new FakePaymentGateway('sandbox');
    realtime = new RecordingRealtime();
    checkout = new StartCheckoutUseCase(workspaces, payments, gateway, env);
    settle = new SettlePaymentUseCase(workspaces, payments, realtime);
    sandbox = new SandboxCheckoutUseCase(workspaces, payments, gateway, settle);
    overview = new GetBillingOverviewUseCase(workspaces, payments, gateway);
  });

  it('el administrador inicia el pago con el precio del catálogo y vuelve a la página del plan', async () => {
    const session = await checkout.execute(admin.id, 'w1', 'team');
    expect(gateway.checkouts[0]).toMatchObject({ amount: 49_900, currency: 'COP', returnUrl: `https://parla.example/app/w/w1/plan?pago=${session.paymentId}` });
    expect(payments.rows[0]).toMatchObject({ status: 'pending', plan: 'team', checkoutUrl: session.checkoutUrl });
  });

  it('solo administradores pagan, y solo planes de pago', async () => {
    await expect(checkout.execute(member.id, 'w1', 'team')).rejects.toThrow(ForbiddenError);
    await expect(checkout.execute(makeUser().id, 'w1', 'team')).rejects.toThrow(NotFoundError);
    await expect(checkout.execute(admin.id, 'w1', 'free')).rejects.toThrow(ValidationError);
    await expect(overview.execute(member.id, 'w1')).rejects.toThrow(ForbiddenError);
  });

  it('al aprobarse el pago el espacio pasa al plan por un mes y todos reciben el aviso', async () => {
    const session = await checkout.execute(admin.id, 'w1', 'team');
    const result = await sandbox.complete(admin.id, session.paymentId, 'approved');
    expect(result.status).toBe('approved');
    const view = await overview.execute(admin.id, 'w1');
    expect(view.effectivePlan).toBe('team');
    expect(new Date(view.expiresAt!).getTime()).toBeGreaterThan(Date.now() + 27 * 86_400_000);
    expect(realtime.events('workspace:changed')[0].userIds).toEqual(expect.arrayContaining([admin.id, member.id]));
    await expect(sandbox.complete(admin.id, session.paymentId, 'approved')).rejects.toThrow('ya se procesó');
  });

  it('un pago rechazado no cambia el plan; un aviso repetido no lo aplica dos veces', async () => {
    const session = await checkout.execute(admin.id, 'w1', 'business');
    await sandbox.complete(admin.id, session.paymentId, 'rejected');
    expect((await overview.execute(admin.id, 'w1')).effectivePlan).toBe('free');

    const again = await checkout.execute(admin.id, 'w1', 'team');
    const row = (await payments.findById(again.paymentId))!;
    await settle.execute(row, 'approved', 'mp-1', { amount: 49_900, currency: 'COP' });
    const firstExpiry = workspaces.workspaces[0].planExpiresAt;
    await settle.execute(row, 'approved', 'mp-1', { amount: 49_900, currency: 'COP' });
    expect(workspaces.workspaces[0].planExpiresAt).toEqual(firstExpiry);
  });

  it('si el importe pagado no coincide, el pago se rechaza (no se activa el plan)', async () => {
    const session = await checkout.execute(admin.id, 'w1', 'business');
    await settle.execute((await payments.findById(session.paymentId))!, 'approved', 'mp-2', { amount: 100, currency: 'COP' });
    expect((await payments.findById(session.paymentId))!.status).toBe('rejected');
    expect(workspaces.workspaces[0].plan).toBe('free');
  });

  it('el webhook aplica el pago que confirma la pasarela', async () => {
    const session = await checkout.execute(admin.id, 'w1', 'team');
    gateway.nextWebhook = { paymentId: session.paymentId, status: 'approved', providerRef: '123', amount: 49_900, currency: 'COP' };
    await new HandlePaymentWebhookUseCase(payments, gateway, settle).execute({ query: {}, body: {}, headers: {} });
    expect(workspaces.workspaces[0].plan).toBe('team');
  });

  it('el pago simulado solo lo ve quien lo inició', async () => {
    const session = await checkout.execute(admin.id, 'w1', 'team');
    await expect(sandbox.view(member.id, session.paymentId)).rejects.toThrow(NotFoundError);
    expect((await sandbox.view(admin.id, session.paymentId)).plan.name).toBe('Equipo');
  });

  it('el plan Gratis no admite un miembro más al llegar a 10', async () => {
    for (let i = 0; i < 8; i++) workspaces.add(makeUser(), 'w1', 'member');
    const join = new JoinByInviteUseCase(workspaces, realtime);
    await expect(join.execute(makeUser().id, 'codigo123')).rejects.toThrow('límite de 10 miembros');
  });
});

describe('MercadoPago (red simulada)', () => {
  const mpEnv = {
    ...env,
    mercadoPago: { accessToken: 'TEST-token', webhookSecret: 'secreto', useSandboxUrl: false },
  } as AppEnv;
  const calls: { url: string; body?: string }[] = [];
  const fakeFetch: FetchLike = async (url, init) => {
    calls.push({ url, body: init?.body });
    if (url.endsWith('/checkout/preferences')) return { ok: true, status: 201, json: async () => ({ id: 'pref-1', init_point: 'https://mp/checkout' }) };
    return { ok: true, status: 200, json: async () => ({ id: 987, status: 'approved', external_reference: 'p1', transaction_amount: 49900, currency_id: 'COP' }) };
  };
  const gateway = new MercadoPagoPaymentGateway(mpEnv).useFetch(fakeFetch);

  it('crea la preferencia con el importe, la referencia y el webhook', async () => {
    const result = await gateway.createCheckout({ paymentId: 'p1', title: 'Parla Equipo', amount: 49_900, currency: 'COP', returnUrl: 'https://parla.example/x' });
    expect(result).toEqual({ checkoutUrl: 'https://mp/checkout', providerRef: 'pref-1' });
    const body = JSON.parse(calls[0].body!);
    expect(body).toMatchObject({ external_reference: 'p1', notification_url: 'https://api.parla.example/api/billing/webhooks/mercadopago' });
    expect(body.items[0]).toMatchObject({ unit_price: 49_900, currency_id: 'COP' });
  });

  it('verifica la firma del webhook y consulta el pago real', async () => {
    const ts = '1700000000';
    const v1 = createHmac('sha256', 'secreto').update(`id:987;request-id:req-1;ts:${ts};`).digest('hex');
    const ok = await gateway.resolveWebhook({
      query: { type: 'payment', 'data.id': '987' },
      body: {},
      headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'req-1' },
    });
    expect(ok).toEqual({ paymentId: 'p1', status: 'approved', providerRef: '987', amount: 49_900, currency: 'COP' });

    const forged = await gateway.resolveWebhook({
      query: { type: 'payment', 'data.id': '987' },
      body: {},
      headers: { 'x-signature': `ts=${ts},v1=${'0'.repeat(64)}`, 'x-request-id': 'req-1' },
    });
    expect(forged).toBeNull();
    expect(await gateway.resolveWebhook({ query: { type: 'merchant_order', 'data.id': '1' }, body: {}, headers: {} })).toBeNull();
  });
});
