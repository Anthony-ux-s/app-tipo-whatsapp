import type { PaidPlanId, Plan, PlanId } from '@parla/types';
import { ConflictError, ValidationError } from './domain-error';

/** Catálogo de planes (precios en pesos colombianos, por espacio de trabajo y por mes). */
export const PLANS: readonly Plan[] = [
  {
    id: 'free',
    name: 'Gratis',
    tagline: 'Para equipos pequeños que empiezan',
    monthlyPrice: 0,
    currency: 'COP',
    maxMembers: 10,
    maxCallParticipants: 4,
    features: [
      'Hasta 10 miembros',
      'Chats y grupos ilimitados, historial sin límite',
      'Cifrado de extremo a extremo',
      'Tareas, hilos y menciones',
      'Llamadas de voz y video de hasta 4 personas',
    ],
  },
  {
    id: 'team',
    name: 'Equipo',
    tagline: 'Para equipos que crecen',
    monthlyPrice: 49_900,
    currency: 'COP',
    maxMembers: 50,
    maxCallParticipants: 8,
    features: ['Hasta 50 miembros', 'Todo lo del plan Gratis', 'Llamadas de hasta 8 personas', 'Soporte por chat'],
  },
  {
    id: 'business',
    name: 'Empresa',
    tagline: 'Para toda la organización',
    monthlyPrice: 149_900,
    currency: 'COP',
    maxMembers: null,
    maxCallParticipants: 8,
    features: ['Miembros ilimitados', 'Todo lo del plan Equipo', 'Soporte prioritario', 'Acompañamiento en la puesta en marcha'],
  },
];

export function planById(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

export function assertPaidPlan(id: string): asserts id is PaidPlanId {
  if (id !== 'team' && id !== 'business') throw new ValidationError('Ese plan no existe o no requiere pago');
}

/** El plan contratado rige hasta su vencimiento; después, el espacio vuelve al plan gratuito. */
export function effectivePlan(plan: PlanId, expiresAt: Date | null, now = new Date()): PlanId {
  if (plan === 'free') return 'free';
  return expiresAt && expiresAt.getTime() > now.getTime() ? plan : 'free';
}

/** Un espacio no admite más miembros que los de su plan (los que ya están, se quedan). */
export function assertCanAddMember(plan: PlanId, memberCount: number): void {
  const max = planById(plan).maxMembers;
  if (max !== null && memberCount >= max) {
    throw new ConflictError(
      `Este espacio llegó al límite de ${max} miembros del plan ${planById(plan).name}. Pide a un administrador que mejore el plan.`,
    );
  }
}

/** Mismo calendario: un mes después (el 31 de enero pasa al último día de febrero). */
export function addOneMonth(date: Date): Date {
  const next = new Date(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

/**
 * Nuevo vencimiento al aprobarse un pago: si se renueva el mismo plan antes de vencer, el mes se suma
 * al final del periodo vigente; si es un plan distinto o ya venció, empieza hoy.
 */
export function nextExpiry(current: { plan: PlanId; expiresAt: Date | null }, paid: PaidPlanId, now = new Date()): Date {
  const active = effectivePlan(current.plan, current.expiresAt, now) === paid && current.expiresAt;
  return addOneMonth(active ? current.expiresAt! : now);
}
