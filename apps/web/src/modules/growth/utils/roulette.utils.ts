import type { Product, MyInterests } from '@parla/types';

/**
 * Rotación (en grados, siempre creciente) con la que el centro del gajo `index` queda justo bajo la
 * flecha de arriba. `turns` vueltas completas dan la sensación de velocidad; `jitter` (−0.4 a 0.4)
 * corre un poco el punto de parada dentro del gajo para que no pare siempre en el centro.
 */
export function landingRotation(current: number, index: number, count: number, turns = 6, jitter = 0): number {
  const slice = 360 / count;
  const target = 360 - (index + 0.5 + jitter) * slice;
  const base = Math.ceil(current / 360) * 360;
  return base + turns * 360 + target;
}

/** Los gajos de la rueda: ángulos de inicio y fin (grados desde arriba, en sentido horario). */
export function sliceAngles(count: number): { start: number; end: number; mid: number }[] {
  const slice = 360 / count;
  return Array.from({ length: count }, (_, i) => ({ start: i * slice, end: (i + 1) * slice, mid: (i + 0.5) * slice }));
}

const toPoint = (cx: number, cy: number, r: number, angle: number) => {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

/** El trazado SVG de un gajo (de `start` a `end` grados). */
export function slicePath(cx: number, cy: number, r: number, start: number, end: number): string {
  const a = toPoint(cx, cy, r, start);
  const b = toPoint(cx, cy, r, end);
  return `M ${cx} ${cy} L ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)} Z`;
}

export const pointOnCircle = toPoint;

const norm = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Qué tanto le interesa a la persona cada categoría: lo que compró pesa 3 por unidad (más si fue
 * hace poco) y cada búsqueda suma 1 a las categorías de los productos que coinciden con ella.
 */
export function categoryScores(products: Product[], interests: MyInterests, now = Date.now()): Map<string, number> {
  const byId = new Map(products.map((p) => [p.id, p]));
  const scores = new Map<string, number>();
  const add = (category: string, points: number) => scores.set(category, (scores.get(category) ?? 0) + points);

  for (const buy of interests.purchases) {
    const product = byId.get(buy.productId);
    if (!product) continue;
    const days = Math.max(0, (now - new Date(buy.lastAt).getTime()) / 86_400_000);
    add(product.category, 3 * buy.quantity * (days <= 30 ? 1 : days <= 90 ? 0.6 : 0.3));
  }
  for (const search of interests.searches) {
    const term = norm(search.term);
    const hit = new Set(products.filter((p) => norm(p.name).includes(term) || norm(p.category).includes(term)).map((p) => p.category));
    for (const category of hit) add(category, search.count);
  }
  return scores;
}

export interface ForYou {
  products: Product[];
  /** Las categorías que más le interesan, de mayor a menor (para el título de la sección). */
  categories: string[];
}

/**
 * Ofertas «para ti»: los productos rebajados (o, si no hay, los que ya compra) de las categorías que
 * más le interesan, primero lo que más le toca y dentro de eso lo más rebajado. Sin historial no hay
 * nada que recomendar, así que devuelve vacío.
 */
export function rankForYou(products: Product[], interests: MyInterests | null, limit = 8, now = Date.now()): ForYou {
  if (!interests || (!interests.purchases.length && !interests.searches.length)) return { products: [], categories: [] };
  const scores = categoryScores(products, interests, now);
  const bought = new Set(interests.purchases.map((p) => p.productId));
  const off = (p: Product) => (p.listPriceCents && p.listPriceCents > p.priceCents ? 1 - p.priceCents / p.listPriceCents : 0);
  const ranked = products
    .filter((p) => p.stock > 0 && (scores.get(p.category) ?? 0) > 0)
    .map((p) => ({ p, score: (scores.get(p.category) ?? 0) * (1 + off(p) * 2) + (bought.has(p.id) ? 2 : 0) }))
    .filter(({ p }) => off(p) > 0 || bought.has(p.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ p }) => p);
  const categories = [...scores].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([category]) => category);
  return { products: ranked, categories };
}
