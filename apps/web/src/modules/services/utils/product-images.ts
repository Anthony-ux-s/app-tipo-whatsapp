/**
 * Imagen de cada producto según su nombre (íconos 3D Fluent Emoji de Microsoft, MIT, en
 * /public/products). Así un producto nuevo («Arroz integral») también tiene la suya. El orden importa:
 * «Sardinas en salsa» antes que «sal», «papel» antes que «papa».
 */
const BY_NAME: [RegExp, string][] = [
  [/sardina|conserva|enlatad/, 'conserva'],
  [/atun/, 'atun'],
  [/azucar/, 'azucar'],
  [/arroz/, 'arroz'],
  [/aceite/, 'aceite'],
  [/\bsal\b/, 'sal'],
  [/fideo|spaghetti|tallarin|codito/, 'fideos'],
  [/harina|trigo/, 'harina'],
  [/avena|cereal/, 'avena'],
  [/cafe/, 'cafe'],
  [/yogur/, 'yogur'],
  [/leche/, 'leche'],
  [/queso/, 'queso'],
  [/huevo/, 'huevos'],
  [/\bpan\b/, 'pan'],
  [/lenteja|frejol|frijol|garbanzo|menestra/, 'menestras'],
  [/platano|banana/, 'platano'],
  [/manzana/, 'manzana'],
  [/papel/, 'papel'],
  [/\bpapa\b/, 'papa'],
  [/cebolla/, 'cebolla'],
  [/limon/, 'limon'],
  [/detergente|jabon/, 'detergente'],
  [/lejia|desinfectante/, 'lejia'],
  [/\bagua\b/, 'agua'],
  [/gaseosa|refresco|bebida/, 'gaseosa'],
  // Tecnología
  [/audifono|earbud|auricular/, 'audifonos'],
  [/parlante|altavoz/, 'parlante'],
  [/reloj|smartwatch/, 'reloj'],
  [/bateria|power ?bank/, 'bateria'],
  [/cargador|cable/, 'cargador'],
  [/mouse/, 'mouse'],
  [/teclado/, 'teclado'],
  [/monitor/, 'monitor'],
  [/laptop|notebook|computadora/, 'laptop'],
  [/celular|smartphone|tablet/, 'celular'],
  // Ferretería
  [/martillo|comba/, 'martillo'],
  [/taladro|atornillador/, 'taladro'],
  [/pintura|brocha|rodillo|esmalte/, 'pintura'],
  [/tornillo|clavo|perno|tuerca/, 'tornillo'],
  [/llave|alicate|destornillador|herramienta/, 'herramientas'],
  [/foco|bombilla|led\b/, 'foco'],
  [/candado|cerradura/, 'candado'],
  [/cinta|metro|wincha/, 'wincha'],
];

/** Si el nombre no dice nada conocido, una imagen de su categoría. */
const BY_CATEGORY: Record<string, string> = {
  abarrotes: 'abarrotes',
  desayuno: 'cafe',
  lacteos: 'leche',
  huevos: 'huevos',
  panaderia: 'pan',
  conservas: 'conserva',
  menestras: 'menestras',
  'frutas y verduras': 'manzana',
  limpieza: 'detergente',
  bebidas: 'gaseosa',
  celulares: 'celular',
  tablets: 'celular',
  laptops: 'laptop',
  audio: 'audifonos',
  accesorios: 'cargador',
  computacion: 'monitor',
  herramientas: 'herramientas',
  ferreteria: 'herramientas',
  pinturas: 'pintura',
  electricidad: 'foco',
  gasfiteria: 'herramientas',
};

const fold = (v: string) => v.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Ruta de la imagen del producto, o null si no hay ninguna que le quede. */
export function productImage(name: string, category?: string | null): string | null {
  const n = fold(name);
  const slug = BY_NAME.find(([pattern]) => pattern.test(n))?.[1] ?? (category ? BY_CATEGORY[fold(category)] : undefined);
  return slug ? `/products/${slug}.png` : null;
}
