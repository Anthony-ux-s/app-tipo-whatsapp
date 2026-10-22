import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { productImage } from './product-images';

/** Los productos de MercaYa (nombre y categoría), tal como llegan del catálogo. */
const CATALOG: [string, string][] = [
  ['Azúcar rubia', 'Abarrotes'],
  ['Azúcar blanca', 'Abarrotes'],
  ['Arroz extra', 'Abarrotes'],
  ['Arroz superior', 'Abarrotes'],
  ['Aceite vegetal', 'Abarrotes'],
  ['Sal de mesa yodada', 'Abarrotes'],
  ['Fideos spaghetti', 'Abarrotes'],
  ['Fideos codito', 'Abarrotes'],
  ['Harina de trigo', 'Abarrotes'],
  ['Avena en hojuelas', 'Desayuno'],
  ['Café instantáneo', 'Desayuno'],
  ['Leche evaporada', 'Lácteos'],
  ['Leche evaporada (6 latas)', 'Lácteos'],
  ['Yogur de fresa', 'Lácteos'],
  ['Queso fresco', 'Lácteos'],
  ['Huevos pardos', 'Huevos'],
  ['Pan francés', 'Panadería'],
  ['Atún en filete', 'Conservas'],
  ['Sardinas en salsa de tomate', 'Conservas'],
  ['Lentejas bebé', 'Menestras'],
  ['Frejol canario', 'Menestras'],
  ['Garbanzos', 'Menestras'],
  ['Plátano de isla', 'Frutas y verduras'],
  ['Manzana israel', 'Frutas y verduras'],
  ['Papa amarilla', 'Frutas y verduras'],
  ['Cebolla roja', 'Frutas y verduras'],
  ['Limón', 'Frutas y verduras'],
  ['Detergente en polvo', 'Limpieza'],
  ['Lejía', 'Limpieza'],
  ['Papel higiénico doble hoja', 'Limpieza'],
  ['Agua mineral sin gas', 'Bebidas'],
  ['Gaseosa sabor original', 'Bebidas'],
];

describe('imagen de cada producto según su nombre', () => {
  it('todos los productos del catálogo tienen una imagen que existe', () => {
    for (const [name, category] of CATALOG) {
      const src = productImage(name, category);
      expect(src, name).not.toBeNull();
      expect(existsSync(resolve(__dirname, '../../../../public', src!.slice(1))), `${name} → ${src}`).toBe(true);
    }
  });

  it('no confunde nombres parecidos', () => {
    expect(productImage('Sardinas en salsa de tomate')).toBe('/products/conserva.png');
    expect(productImage('Sal de mesa yodada')).toBe('/products/sal.png');
    expect(productImage('Papel higiénico doble hoja')).toBe('/products/papel.png');
    expect(productImage('Papa amarilla')).toBe('/products/papa.png');
    expect(productImage('Yogur de fresa')).toBe('/products/yogur.png');
  });

  it('los productos de tecnología también tienen la suya', () => {
    expect(productImage('Celular Galaxy A15 128 GB')).toBe('/products/celular.png');
    expect(productImage('Laptop IdeaPad 15" Core i5 16 GB')).toBe('/products/laptop.png');
    expect(productImage('Audífonos Bluetooth con cancelación de ruido')).toBe('/products/audifonos.png');
    expect(productImage('Cable USB-C a USB-C 2 m')).toBe('/products/cargador.png');
    expect(productImage('Batería externa 20 000 mAh')).toBe('/products/bateria.png');
    expect(productImage('Monitor 24" Full HD')).toBe('/products/monitor.png');
  });

  it('un producto nuevo usa la de su nombre o, si no, la de su categoría', () => {
    expect(productImage('Arroz integral')).toBe('/products/arroz.png');
    expect(productImage('Mantequilla', 'Lácteos')).toBe('/products/leche.png');
    expect(productImage('Algo raro')).toBeNull();
  });
});
