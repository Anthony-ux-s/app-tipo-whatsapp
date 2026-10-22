import type { CampaignKind, CustomerSegment, PrizeKind, RouletteCampaignInput, RoulettePrize } from '@parla/types';

export const PRIZE_KINDS: { id: PrizeKind; label: string }[] = [
  { id: 'percent', label: '% de descuento' },
  { id: 'amount', label: 'Monto fijo (S/)' },
  { id: 'free_delivery', label: 'Envío gratis' },
  { id: 'none', label: 'Sin premio' },
];

export interface KindInfo {
  id: CampaignKind;
  label: string;
  short: string;
  hint: string;
  /** Premios mínimos y máximos que admite. */
  min: number;
  max: number;
}

/** Las estrategias de campaña: qué hacen y cuántos premios admiten. */
export const KINDS: KindInfo[] = [
  { id: 'roulette', label: 'Ruleta', short: 'Ruleta', hint: 'Gira la rueda y gana un premio al azar.', min: 4, max: 12 },
  { id: 'scratch', label: 'Rasca y gana', short: 'Rasca y gana', hint: 'Raspa la tarjeta con el dedo para descubrir el premio.', min: 2, max: 12 },
  { id: 'box', label: 'Cofre sorpresa', short: 'Cofre', hint: 'Elige entre 3 cofres: uno se abre con el premio.', min: 2, max: 12 },
  { id: 'flash', label: 'Oferta relámpago', short: 'Relámpago', hint: 'Un cupón con cuenta regresiva: se acaba y desaparece.', min: 1, max: 1 },
];
export const kindInfo = (id: CampaignKind): KindInfo => KINDS.find((k) => k.id === id) ?? KINDS[0];

export const SEGMENT_HINT: Record<CustomerSegment, { tone: string; goal: string }> = {
  vip: { tone: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200', goal: 'Premiar y que no se vayan' },
  loyal: { tone: 'bg-teal-100 text-teal-900 dark:bg-teal-900/50 dark:text-teal-200', goal: 'Que sigan pidiendo seguido' },
  lapsed: { tone: 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200', goal: 'Recuperarlos' },
  never_bought: { tone: 'bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200', goal: 'Que hagan su primera compra' },
  new: { tone: 'bg-cyan-100 text-cyan-900 dark:bg-cyan-900/40 dark:text-cyan-200', goal: 'Bienvenida y primer pedido' },
  all: { tone: 'bg-surface-3 text-ink-soft', goal: 'Red de seguridad para el resto' },
};

let counter = 0;
export const newPrizeId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

export const blankPrize = (over: Partial<RoulettePrize> = {}): RoulettePrize => ({
  id: newPrizeId(),
  label: '10 % OFF',
  kind: 'percent',
  value: 10,
  maxDiscountCents: null,
  minSubtotalCents: 0,
  validDays: 7,
  weight: 10,
  ...over,
});

const none = (weight: number, label = 'Sigue intentando'): RoulettePrize => blankPrize({ label, kind: 'none', value: 0, validDays: 1, weight });

/** Ruletas listas para usar: el costo ya está pensado, soporte solo ajusta. */
export const TEMPLATES: { id: string; name: string; hint: string; kind: CampaignKind; build: () => RouletteCampaignInput }[] = [
  {
    id: 'welcome',
    kind: 'roulette',
    name: 'Bienvenida',
    hint: 'Para quien recién llega y aún no pide.',
    build: () => ({
      kind: 'roulette',
      startsAt: null,
      endsAt: null,
      name: 'Bienvenida',
      title: '¡Gira y gana!',
      subtitle: 'Un premio de bienvenida para tu primer pedido',
      segment: 'new',
      cooldownDays: 30,
      testMode: false,
      prizes: [
        blankPrize({ label: '10 % OFF', value: 10, weight: 25, validDays: 14 }),
        blankPrize({ label: 'Envío gratis', kind: 'free_delivery', value: 0, weight: 25, validDays: 14 }),
        blankPrize({ label: 'S/ 5 OFF', kind: 'amount', value: 500, minSubtotalCents: 2500, weight: 20, validDays: 14 }),
        blankPrize({ label: '15 % OFF', value: 15, maxDiscountCents: 1000, weight: 8, validDays: 14 }),
        none(22),
      ],
    }),
  },
  {
    id: 'winback',
    kind: 'roulette',
    name: 'Te extrañamos',
    hint: 'Para quien no compra hace más de 30 días.',
    build: () => ({
      kind: 'roulette',
      startsAt: null,
      endsAt: null,
      name: 'Reactivación',
      title: '¡Te extrañamos!',
      subtitle: 'Vuelve y gira: hoy tienes premio',
      segment: 'lapsed',
      cooldownDays: 14,
      testMode: false,
      prizes: [
        blankPrize({ label: '20 % OFF', value: 20, maxDiscountCents: 1500, weight: 12, validDays: 7 }),
        blankPrize({ label: 'Envío gratis', kind: 'free_delivery', value: 0, weight: 30, validDays: 7 }),
        blankPrize({ label: 'S/ 10 OFF', kind: 'amount', value: 1000, minSubtotalCents: 4000, weight: 18, validDays: 7 }),
        blankPrize({ label: '10 % OFF', value: 10, weight: 30, validDays: 7 }),
        none(10),
      ],
    }),
  },
  {
    id: 'first-purchase',
    kind: 'roulette',
    name: 'Primera compra',
    hint: 'Para quien lleva tiempo registrado y nunca compró.',
    build: () => ({
      kind: 'roulette',
      startsAt: null,
      endsAt: null,
      name: 'Primera compra',
      title: '¡Tu primera compra con premio!',
      subtitle: 'Gira, gana y estrena Parla',
      segment: 'never_bought',
      cooldownDays: 14,
      testMode: false,
      prizes: [
        blankPrize({ label: 'Envío gratis', kind: 'free_delivery', value: 0, weight: 35, validDays: 10 }),
        blankPrize({ label: '15 % OFF', value: 15, maxDiscountCents: 1200, weight: 25, validDays: 10 }),
        blankPrize({ label: 'S/ 8 OFF', kind: 'amount', value: 800, minSubtotalCents: 3000, weight: 20, validDays: 10 }),
        blankPrize({ label: '20 % OFF', value: 20, maxDiscountCents: 1500, weight: 5, validDays: 10 }),
        none(15),
      ],
    }),
  },
  {
    id: 'vip',
    kind: 'roulette',
    name: 'Mejores clientes',
    hint: 'Siempre ganan algo: es para agradecerles.',
    build: () => ({
      kind: 'roulette',
      startsAt: null,
      endsAt: null,
      name: 'VIP',
      title: 'Para nuestros mejores clientes',
      subtitle: 'Gracias por pedir con nosotros: gira y llévate algo',
      segment: 'vip',
      cooldownDays: 7,
      testMode: false,
      prizes: [
        blankPrize({ label: '25 % OFF', value: 25, maxDiscountCents: 2000, weight: 8, validDays: 7 }),
        blankPrize({ label: 'Envío gratis', kind: 'free_delivery', value: 0, weight: 40, validDays: 7 }),
        blankPrize({ label: 'S/ 15 OFF', kind: 'amount', value: 1500, minSubtotalCents: 6000, weight: 12, validDays: 7 }),
        blankPrize({ label: '15 % OFF', value: 15, maxDiscountCents: 1500, weight: 30, validDays: 7 }),
        blankPrize({ label: '10 % OFF', value: 10, weight: 10, validDays: 7 }),
      ],
    }),
  },
  {
    id: 'scratch-lapsed',
    kind: 'scratch',
    name: 'Rasca y gana',
    hint: 'Una raspadita para quien dejó de comprar.',
    build: () => ({
      kind: 'scratch',
      startsAt: null,
      endsAt: null,
      name: 'Rasca y gana · reactivación',
      title: '¡Rasca y gana!',
      subtitle: 'Hay un premio esperándote debajo',
      segment: 'lapsed',
      cooldownDays: 7,
      testMode: false,
      prizes: [
        blankPrize({ label: '15 % OFF', value: 15, maxDiscountCents: 1200, weight: 25, validDays: 7 }),
        blankPrize({ label: 'Envío gratis', kind: 'free_delivery', value: 0, weight: 35, validDays: 7 }),
        blankPrize({ label: 'S/ 5 OFF', kind: 'amount', value: 500, minSubtotalCents: 2500, weight: 25, validDays: 7 }),
        none(15),
      ],
    }),
  },
  {
    id: 'box-loyal',
    kind: 'box',
    name: 'Cofre sorpresa',
    hint: 'Tres cofres para premiar a tus clientes frecuentes.',
    build: () => ({
      kind: 'box',
      startsAt: null,
      endsAt: null,
      name: 'Cofre sorpresa · frecuentes',
      title: 'Elige tu cofre',
      subtitle: 'Uno de los tres tiene un regalo para ti',
      segment: 'loyal',
      cooldownDays: 7,
      testMode: false,
      prizes: [
        blankPrize({ label: '10 % OFF', value: 10, weight: 40, validDays: 7 }),
        blankPrize({ label: 'Envío gratis', kind: 'free_delivery', value: 0, weight: 40, validDays: 7 }),
        blankPrize({ label: '20 % OFF', value: 20, maxDiscountCents: 1500, weight: 12, validDays: 7 }),
        none(8, 'Vacío'),
      ],
    }),
  },
  {
    id: 'flash',
    kind: 'flash',
    name: 'Oferta relámpago',
    hint: 'Un cupón que se acaba en 48 horas.',
    build: () => ({
      kind: 'flash',
      startsAt: null,
      endsAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
      name: 'Relámpago 48 h',
      title: '¡Solo por 48 horas!',
      subtitle: 'Reclama tu cupón antes de que se acabe',
      segment: 'all',
      cooldownDays: 7,
      testMode: false,
      prizes: [blankPrize({ label: '20 % OFF', value: 20, maxDiscountCents: 1500, minSubtotalCents: 3000, validDays: 3, weight: 1 })],
    }),
  },
];
