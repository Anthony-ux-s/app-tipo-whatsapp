import { describe, expect, it } from 'vitest';
import { CATALOG_CSV_TEMPLATE, chunk, parseCatalogCsv, parseCsv, parseSoles } from './catalog-csv.utils';

describe('parseCsv', () => {
  it('lee comas, punto y coma y comillas', () => {
    expect(parseCsv('a,b,c\n1,"x, y",3')).toEqual([['a', 'b', 'c'], ['1', 'x, y', '3']]);
    expect(parseCsv('a;b\n1;"dijo ""hola"""')).toEqual([['a', 'b'], ['1', 'dijo "hola"']]);
  });

  it('ignora el BOM, los saltos de Windows y las filas vacías', () => {
    expect(parseCsv('﻿a;b\r\n1;2\r\n\r\n3;4\r\n')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });

  it('acepta saltos de línea dentro de comillas', () => {
    expect(parseCsv('a,b\n"uno\ndos",2')).toEqual([['a', 'b'], ['uno\ndos', '2']]);
  });
});

describe('parseSoles', () => {
  it('convierte soles a céntimos', () => {
    expect(parseSoles('4.50')).toBe(450);
    expect(parseSoles('4,50')).toBe(450);
    expect(parseSoles('S/ 12,9')).toBe(1290);
    expect(parseSoles('7')).toBe(700);
    expect(parseSoles('1,234.50')).toBe(123450);
    expect(parseSoles('1.234,50')).toBe(123450);
    expect(parseSoles('1.234.567')).toBe(123456700);
  });

  it('rechaza lo que no es un monto', () => {
    expect(parseSoles('')).toBeNull();
    expect(parseSoles('gratis')).toBeNull();
    expect(parseSoles('-3')).toBeNull();
  });
});

describe('parseCatalogCsv', () => {
  it('lee la plantilla sin errores', () => {
    const parsed = parseCatalogCsv(CATALOG_CSV_TEMPLATE);
    expect(parsed.fileError).toBeNull();
    expect(parsed.rows.every((r) => r.errors.length === 0)).toBe(true);
    expect(parsed.rows[0]!.product).toEqual({
      sku: 'ARR-001',
      name: 'Arroz extra',
      unit: '1 kg',
      priceCents: 450,
      listPriceCents: 520,
      stock: 40,
      category: 'Abarrotes',
      imageUrl: null,
      active: true,
    });
    expect(parsed.rows[1]!.product).toMatchObject({ listPriceCents: null, imageUrl: 'https://ejemplo.pe/leche.jpg' });
  });

  it('entiende cabeceras en inglés y español, con tildes y punto y coma', () => {
    const parsed = parseCatalogCsv('Código;Name;Unit;Price;List_Price;Cantidad;Categoría;Activo\nA1;Leche;1 L;5,90;6,50;3;Lácteos;no');
    expect(parsed.fileError).toBeNull();
    expect(parsed.rows[0]!.product).toMatchObject({ sku: 'A1', name: 'Leche', unit: '1 L', priceCents: 590, listPriceCents: 650, stock: 3, category: 'Lácteos', active: false });
  });

  it('usa valores por defecto para presentación, categoría y activo', () => {
    const parsed = parseCatalogCsv('sku,nombre,precio,stock\nX,Pan,0.5,10');
    expect(parsed.rows[0]!.product).toMatchObject({ unit: 'unidad', category: 'General', active: true });
  });

  it('marca los errores de cada fila sin frenar las demás', () => {
    const parsed = parseCatalogCsv(
      ['sku,nombre,precio,precio_antes,stock,imagen', 'A,Bien,2,3,5,', ',Sin código,2,,1,', 'B,Caro,5,4,1,', 'C,Foto,1,,x,http://malo', 'A,Repetido,1,,1,'].join('\n'),
    );
    expect(parsed.rows.map((r) => r.row)).toEqual([1, 2, 3, 4, 5]);
    expect(parsed.rows[0]!.errors).toEqual([]);
    expect(parsed.rows[1]!.errors[0]).toMatch(/código/);
    expect(parsed.rows[2]!.errors[0]).toMatch(/antes/);
    expect(parsed.rows[3]!.errors).toHaveLength(2);
    expect(parsed.rows[4]!.errors[0]).toMatch(/repetido/);
    expect(parsed.rows.filter((r) => r.product)).toHaveLength(1);
  });

  it('avisa cuando faltan columnas obligatorias o el archivo está vacío', () => {
    expect(parseCatalogCsv('nombre,stock\nPan,1').fileError).toMatch(/sku o codigo, precio/);
    expect(parseCatalogCsv('').fileError).toMatch(/vacío/);
    expect(parseCatalogCsv('sku,nombre,precio,stock').fileError).toMatch(/no tiene productos/);
  });

  it('avisa de las columnas que no reconoce', () => {
    expect(parseCatalogCsv('sku,nombre,precio,stock,color\nA,B,1,1,rojo').ignored).toEqual(['color']);
  });
});

describe('chunk', () => {
  it('parte en lotes', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});
