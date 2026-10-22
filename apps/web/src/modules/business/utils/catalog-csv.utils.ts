import type { StoreProduct } from '@parla/types';

/** Filas que se envían por llamada a /business/products/import (el máximo que acepta el servidor). */
export const IMPORT_BATCH_SIZE = 200;

/**
 * Lee un CSV (o texto copiado de Excel): acepta «,» «;» o tabulador como separador, comillas con
 * comillas dobles escapadas y el BOM de UTF-8 que agrega Excel. Las filas totalmente vacías se omiten.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) endField();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else field += ch;
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

/** El separador más usado en la primera línea (fuera de comillas). */
function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch in counts) counts[ch]!++;
  }
  const [best, uses] = Object.entries(counts).sort((x, y) => y[1] - x[1])[0]!;
  return uses === 0 ? ',' : best;
}

/**
 * Soles escritos por una persona → céntimos. Acepta «4.50», «4,50», «S/ 4,50» y miles («1,234.50»,
 * «1.234,50»). Devuelve null si no es un monto.
 */
export function parseSoles(raw: string): number | null {
  const text = raw.replace(/s\/\.?/gi, '').replace(/\s/g, '');
  if (!/^\d[\d.,]*$/.test(text)) return null;
  const dot = text.lastIndexOf('.');
  const comma = text.lastIndexOf(',');
  let normalized: string;
  if (dot >= 0 && comma >= 0) {
    // Los dos separadores: el último es el decimal y el otro separa miles.
    const decimal = dot > comma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    normalized = text.split(thousands).join('').replace(decimal, '.');
  } else if (dot >= 0 || comma >= 0) {
    const sep = dot >= 0 ? '.' : ',';
    // Uno solo es el decimal; repetido («1.234.567») separa miles.
    normalized = text.split(sep).length === 2 ? text.replace(sep, '.') : text.split(sep).join('');
  } else normalized = text;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

/** Cabecera → campo del producto (sin tildes, mayúsculas ni separadores: «Precio_antes» = «precio antes»). */
const HEADER_ALIASES: Record<string, keyof StoreProduct> = {
  sku: 'sku',
  codigo: 'sku',
  code: 'sku',
  nombre: 'name',
  name: 'name',
  producto: 'name',
  presentacion: 'unit',
  unidad: 'unit',
  unit: 'unit',
  precio: 'priceCents',
  price: 'priceCents',
  precioventa: 'priceCents',
  precioantes: 'listPriceCents',
  oferta: 'listPriceCents',
  listprice: 'listPriceCents',
  preciolista: 'listPriceCents',
  stock: 'stock',
  cantidad: 'stock',
  categoria: 'category',
  category: 'category',
  imagen: 'imageUrl',
  image: 'imageUrl',
  foto: 'imageUrl',
  activo: 'active',
  active: 'active',
};

const normalizeHeader = (header: string) =>
  header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const TRUE_WORDS = new Set(['si', 'sí', 'yes', 'true', '1', 'activo', 'x']);
const FALSE_WORDS = new Set(['no', 'false', '0', 'inactivo']);

export interface CatalogRow {
  /** Número de fila de datos (1 = la primera después de las cabeceras). */
  row: number;
  /** El producto listo para enviar; null si la fila tiene errores. */
  product: StoreProduct | null;
  errors: string[];
}

export interface ParsedCatalog {
  rows: CatalogRow[];
  /** Problema con las cabeceras (faltan columnas obligatorias) o con el archivo en general. */
  fileError: string | null;
  /** Cabeceras que no se reconocieron (se ignoran). */
  ignored: string[];
}

/** Convierte el texto de un CSV en productos, con los errores de cada fila para mostrarlos antes de enviar. */
export function parseCatalogCsv(text: string): ParsedCatalog {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], fileError: 'El archivo está vacío.', ignored: [] };

  const header = table[0]!;
  const columns = new Map<keyof StoreProduct, number>();
  const ignored: string[] = [];
  header.forEach((title, index) => {
    const field = HEADER_ALIASES[normalizeHeader(title)];
    if (field && !columns.has(field)) columns.set(field, index);
    else if (title.trim()) ignored.push(title.trim());
  });
  const missing = (
    [
      ['sku', 'sku o codigo'],
      ['name', 'nombre'],
      ['priceCents', 'precio'],
    ] as const
  )
    .filter(([field]) => !columns.has(field))
    .map(([, label]) => label);
  if (missing.length) {
    return { rows: [], fileError: `Faltan columnas obligatorias en la primera fila: ${missing.join(', ')}. Descarga la plantilla para ver el formato.`, ignored };
  }

  const cell = (line: string[], field: keyof StoreProduct) => {
    const index = columns.get(field);
    return index === undefined ? '' : (line[index] ?? '').trim();
  };

  const seen = new Set<string>();
  const rows = table.slice(1).map<CatalogRow>((line, i) => {
    const errors: string[] = [];
    const sku = cell(line, 'sku');
    const name = cell(line, 'name');
    if (!sku) errors.push('Falta el código (sku).');
    else if (seen.has(sku.toLowerCase())) errors.push(`El código «${sku}» está repetido en el archivo.`);
    else seen.add(sku.toLowerCase());
    if (!name) errors.push('Falta el nombre.');

    const price = parseSoles(cell(line, 'priceCents'));
    if (price === null || price <= 0) errors.push('El precio debe ser un monto en soles mayor a cero (ej. 4.50).');

    let listPrice: number | null = null;
    const listRaw = cell(line, 'listPriceCents');
    if (listRaw) {
      listPrice = parseSoles(listRaw);
      if (listPrice === null) errors.push('El precio de antes no es un monto válido.');
      else if (price !== null && listPrice <= price) errors.push('El precio de antes debe ser mayor que el precio (si no hay oferta, déjalo vacío).');
    }

    const stockRaw = cell(line, 'stock');
    const stock = /^\d+$/.test(stockRaw) ? Number(stockRaw) : NaN;
    if (!Number.isInteger(stock)) errors.push('El stock debe ser un número entero (0 = agotado).');

    const image = cell(line, 'imageUrl');
    if (image && !/^https:\/\//i.test(image)) errors.push('La imagen debe ser un enlace que empiece con https://');

    const activeRaw = cell(line, 'active').toLowerCase();
    if (activeRaw && !TRUE_WORDS.has(activeRaw) && !FALSE_WORDS.has(activeRaw)) errors.push('«Activo» debe ser sí o no.');

    if (errors.length) return { row: i + 1, product: null, errors };
    return {
      row: i + 1,
      errors,
      product: {
        sku,
        name,
        unit: cell(line, 'unit') || 'unidad',
        priceCents: price!,
        listPriceCents: listPrice,
        stock,
        category: cell(line, 'category') || 'General',
        imageUrl: image || null,
        active: activeRaw ? TRUE_WORDS.has(activeRaw) : true,
      },
    };
  });

  return { rows, fileError: rows.length === 0 ? 'El archivo no tiene productos debajo de las cabeceras.' : null, ignored };
}

/** Parte la lista en lotes del tamaño que acepta el servidor. */
export function chunk<T>(items: T[], size = IMPORT_BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Archivo de ejemplo (con BOM para que Excel respete las tildes). */
export const CATALOG_CSV_TEMPLATE =
  '﻿sku,nombre,presentacion,precio,precio_antes,stock,categoria,imagen,activo\n' +
  'ARR-001,Arroz extra,1 kg,4.50,5.20,40,Abarrotes,,si\n' +
  'LEC-002,Leche entera,Caja 1 L,5.90,,25,Lácteos,https://ejemplo.pe/leche.jpg,si\n';
