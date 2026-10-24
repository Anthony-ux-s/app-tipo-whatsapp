import type { ServiceId, StoreConnector } from '@parla/types';

/**
 * Qué sistemas externos puede conectar cada categoría. Hoy solo las ferreterías (FerroHub); mañana una categoría
 * suma su conector aquí y declara su pantalla, sin tocar el resto del flujo «Crear tienda».
 */
export const CATEGORY_CONNECTORS: Record<ServiceId, StoreConnector[]> = {
  ferreteria: ['ferrohub'],
  mercado: [],
  tecnologia: [],
  salud: [],
};

/** Dónde empieza «Crear tienda» para cada categoría. */
export function createStorePath(service: ServiceId): string {
  return CATEGORY_CONNECTORS[service].includes('ferrohub') ? `/app/negocio/nueva/${service}` : `/app/negocio/abrir?service=${service}`;
}

/** Rubros que vende una ferretería (se eligen al crearla; puede cambiarlos después en FerroHub). */
export const FERRETERIA_RUBROS = [
  'Herramientas manuales',
  'Herramientas eléctricas',
  'Electricidad',
  'Gasfitería y plomería',
  'Pinturas y acabados',
  'Cemento y construcción',
  'Tornillería y fijación',
  'Cerrajería y seguridad',
  'Iluminación',
  'Jardinería',
];

const ALPHABET = /[A-HJ-NP-Z2-9]/;

/** Mientras se escribe: mayúsculas, sin 0/O/1/I ni espacios, y con el formato FH-XXXX-XXXX. */
export function formatFerrohubCode(raw: string): string {
  const letters = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^FH/, '')
    .split('')
    .filter((c) => ALPHABET.test(c))
    .slice(0, 8)
    .join('');
  if (!letters) return raw.trim() ? 'FH-' : '';
  return letters.length <= 4 ? `FH-${letters}` : `FH-${letters.slice(0, 4)}-${letters.slice(4)}`;
}

export const isFerrohubCodeComplete = (code: string): boolean => /^FH-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code);
