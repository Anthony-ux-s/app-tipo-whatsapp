import { Inject, Injectable, Logger } from '@nestjs/common';
import type { BillingOverview, CheckoutSession, Plan, SandboxCheckout } from '@parla/types';
import { assertPaidPlan, effectivePlan, nextExpiry, planById, PLANS } from '../../../../kernel/billing-plans';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../../kernel/domain-error';
import { assertIsAdmin } from '../../../../kernel/workspace-permissions';
import { APP_ENV, type AppEnv } from '../../../../config/env.validation';
import { PAYMENT_GATEWAY, type PaymentGateway, type WebhookInput } from '../../../../infra/payments/payment-gateway.port';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../infra/realtime/realtime-publisher.port';
import { WORKSPACES_REPOSITORY, type WorkspacesRepository } from '../../workspaces/workspaces.repository';
import { toPaymentRecord } from '../payment.mapper';
import { PAYMENTS_REPOSITORY, type PaymentRow, type PaymentsRepository } from '../payments.repository';

const HISTORY_SIZE = 24;

/** Catálogo público de planes. */
@Injectable()
export class ListPlansUseCase {
  execute(): Plan[] {
    return [...PLANS];
  }
}

/** Requisito común: el espacio existe y quien pide es su administrador (404 si no pertenece). */
async function requireAdmin(workspaces: WorkspacesRepository, workspaceId: string, userId: string) {
  const role = await workspaces.roleOf(workspaceId, userId);
  const ws = role ? await workspaces.findById(workspaceId) : null;
  if (!role || !ws) throw new NotFoundError('Espacio de trabajo no encontrado');
  assertIsAdmin(role);
  return ws;
}

/** Plan, vencimiento, miembros e historial de pagos de un espacio (solo administradores). */
@Injectable()
export class GetBillingOverviewUseCase {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspaces: WorkspacesRepository,
    @Inject(PAYMENTS_REPOSITORY) private readonly payments: PaymentsRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  async execute(userId: string, workspaceId: string): Promise<BillingOverview> {
    const ws = await requireAdmin(this.workspaces, workspaceId, userId);
    const history = await this.payments.listForWorkspace(workspaceId, HISTORY_SIZE);
    const current = effectivePlan(ws.plan, ws.planExpiresAt);
    return {
      workspaceId,
      plan: ws.plan,
      effectivePlan: current,
      expiresAt: current === 'free' ? null : (ws.planExpiresAt?.toISOString() ?? null),
      memberCount: ws.memberCount,
      provider: this.gateway.provider,
      plans: [...PLANS],
      payments: history.map(toPaymentRecord),
    };
  }
}

/** Inicia el pago de un mes de un plan y devuelve a dónde llevar a la persona para pagar. */
@Injectable()
export class StartCheckoutUseCase {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspaces: WorkspacesRepository,
    @Inject(PAYMENTS_REPOSITORY) private readonly payments: PaymentsRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async execute(userId: string, workspaceId: string, planId: string): Promise<CheckoutSession> {
    assertPaidPlan(planId);
    const ws = await requireAdmin(this.workspaces, workspaceId, userId);
    const plan = planById(planId);
    const max = plan.maxMembers;
    if (max !== null && ws.memberCount > max) {
      throw new ValidationError(`El espacio tiene ${ws.memberCount} miembros y el plan ${plan.name} admite ${max}`);
    }
    const payment = await this.payments.create({
      workspaceId,
      createdById: userId,
      plan: planId,
      amount: plan.monthlyPrice,
      currency: plan.currency,
      provider: this.gateway.provider,
    });
    const checkout = await this.gateway.createCheckout({
      paymentId: payment.id,
      title: `Parla ${plan.name} · 1 mes · ${ws.name}`,
      amount: plan.monthlyPrice,
      currency: plan.currency,
      returnUrl: `${this.env.publicWebUrl}/app/w/${workspaceId}/plan?pago=${payment.id}`,
    });
    await this.payments.attachCheckout(payment.id, checkout.checkoutUrl, checkout.providerRef);
    return { paymentId: payment.id, checkoutUrl: checkout.checkoutUrl, provider: this.gateway.provider };
  }
}

/**
 * Aplica el resultado de un pago una sola vez (los avisos de la pasarela pueden repetirse) y, si se
 * aprobó, extiende el plan del espacio un mes.
 */
@Injectable()
export class SettlePaymentUseCase {
  private readonly logger = new Logger('SettlePayment');

  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspaces: WorkspacesRepository,
    @Inject(PAYMENTS_REPOSITORY) private readonly payments: PaymentsRepository,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
  ) {}

  async execute(
    payment: PaymentRow,
    status: 'approved' | 'rejected',
    providerRef: string,
    paid?: { amount: number; currency: string },
  ): Promise<void> {
    if (status === 'approved' && paid && (paid.amount < payment.amount || paid.currency !== payment.currency)) {
      this.logger.warn(`Pago ${payment.id}: el importe recibido no coincide; no se activa el plan`);
      status = 'rejected';
    }
    const now = new Date();
    if (!(await this.payments.settle(payment.id, status, providerRef, now))) return;
    if (status !== 'approved') return;

    const ws = await this.workspaces.findById(payment.workspaceId);
    if (!ws) return;
    const expiresAt = nextExpiry({ plan: ws.plan, expiresAt: ws.planExpiresAt }, payment.plan, now);
    await this.workspaces.update(ws.id, { plan: payment.plan, planExpiresAt: expiresAt });
    const members = await this.workspaces.listMembers(ws.id);
    this.realtime.toUsers(members.map((m) => m.user.id), 'workspace:changed', { workspaceId: ws.id });
  }
}

/** Webhook de la pasarela (público): se consulta el pago real antes de aplicar nada. */
@Injectable()
export class HandlePaymentWebhookUseCase {
  constructor(
    @Inject(PAYMENTS_REPOSITORY) private readonly payments: PaymentsRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly settle: SettlePaymentUseCase,
  ) {}

  async execute(input: WebhookInput): Promise<{ received: true }> {
    const result = await this.gateway.resolveWebhook(input);
    if (!result || result.status === 'pending') return { received: true };
    const payment = await this.payments.findById(result.paymentId);
    if (payment) await this.settle.execute(payment, result.status, result.providerRef, result);
    return { received: true };
  }
}

/** Pantalla de pago simulado (modo sandbox): solo el administrador que inició el pago. */
@Injectable()
export class SandboxCheckoutUseCase {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspaces: WorkspacesRepository,
    @Inject(PAYMENTS_REPOSITORY) private readonly payments: PaymentsRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly settle: SettlePaymentUseCase,
  ) {}

  private async requireOwn(userId: string, paymentId: string): Promise<PaymentRow> {
    if (this.gateway.provider !== 'sandbox') throw new ForbiddenError('Los pagos de prueba están desactivados');
    const payment = await this.payments.findById(paymentId);
    if (!payment || payment.provider !== 'sandbox' || payment.createdById !== userId) {
      throw new NotFoundError('Pago no encontrado');
    }
    return payment;
  }

  async view(userId: string, paymentId: string): Promise<SandboxCheckout> {
    const payment = await this.requireOwn(userId, paymentId);
    const ws = await this.workspaces.findById(payment.workspaceId);
    return {
      paymentId,
      workspaceId: payment.workspaceId,
      workspaceName: ws?.name ?? 'Espacio',
      plan: planById(payment.plan),
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
    };
  }

  async complete(userId: string, paymentId: string, outcome: 'approved' | 'rejected'): Promise<SandboxCheckout> {
    const payment = await this.requireOwn(userId, paymentId);
    if (payment.status !== 'pending') throw new ValidationError('Este pago ya se procesó');
    await this.settle.execute(payment, outcome, `sandbox-${Date.now()}`);
    return this.view(userId, paymentId);
  }
}
