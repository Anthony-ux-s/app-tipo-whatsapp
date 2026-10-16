export type PlanId = 'free' | 'team' | 'business';
export type PaidPlanId = Exclude<PlanId, 'free'>;
export type PaymentStatus = 'pending' | 'approved' | 'rejected';
export type PaymentProvider = 'sandbox' | 'mercadopago';

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Precio mensual por espacio de trabajo, en la unidad de la moneda (COP sin decimales). */
  monthlyPrice: number;
  currency: string;
  /** null = ilimitado. */
  maxMembers: number | null;
  /** Personas en una misma llamada (las llamadas grupales son de malla P2P). */
  maxCallParticipants: number;
  features: string[];
}

export interface PaymentRecord {
  id: string;
  plan: PaidPlanId;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: PaymentProvider;
  createdAt: string;
  paidAt: string | null;
}

export interface BillingOverview {
  workspaceId: string;
  /** Plan contratado (aunque haya vencido). */
  plan: PlanId;
  /** Plan que rige hoy (gratis si el contratado venció). */
  effectivePlan: PlanId;
  expiresAt: string | null;
  memberCount: number;
  provider: PaymentProvider;
  plans: Plan[];
  payments: PaymentRecord[];
}

export interface CheckoutRequest {
  plan: PaidPlanId;
}

export interface CheckoutSession {
  paymentId: string;
  checkoutUrl: string;
  provider: PaymentProvider;
}

/** Pago de prueba (modo sandbox): lo que muestra la pantalla de pago simulado. */
export interface SandboxCheckout {
  paymentId: string;
  workspaceId: string;
  workspaceName: string;
  plan: Plan;
  amount: number;
  currency: string;
  status: PaymentStatus;
}
