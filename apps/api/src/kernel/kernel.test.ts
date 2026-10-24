import { describe, expect, it } from 'vitest';
import { aggregateDeliveryStatus, isForwardTransition } from './delivery-status';
import { ConflictError, ValidationError } from './domain-error';
import { assertPasswordStrength, parseIdentifier } from './identifier';
import { assertOrderTotals, assertOrderTransition, businessOrderPush, deliveryPaidOnArrival, formatSoles, orderPush } from './order-rules';

const at = new Date('2026-10-01T10:00:00Z');

describe('estado de entrega de un mensaje', () => {
  it('queda "enviado" mientras algún destinatario no lo recibe', () => {
    expect(aggregateDeliveryStatus([{ deliveredAt: at, readAt: null }, { deliveredAt: null, readAt: null }])).toBe('sent');
  });

  it('pasa a "entregado" cuando llegó a todos', () => {
    expect(aggregateDeliveryStatus([{ deliveredAt: at, readAt: at }, { deliveredAt: at, readAt: null }])).toBe('delivered');
  });

  it('pasa a "leído" solo cuando todos lo leyeron (en grupos manda el más atrasado)', () => {
    expect(aggregateDeliveryStatus([{ deliveredAt: at, readAt: at }, { deliveredAt: at, readAt: at }])).toBe('read');
  });

  it('nunca retrocede', () => {
    expect(isForwardTransition('sent', 'delivered')).toBe(true);
    expect(isForwardTransition('delivered', 'read')).toBe(true);
    expect(isForwardTransition('read', 'delivered')).toBe(false);
    expect(isForwardTransition('delivered', 'delivered')).toBe(false);
  });
});

describe('identificador de inicio de sesión', () => {
  it('reconoce teléfonos con espacios y sin el signo +', () => {
    expect(parseIdentifier('+57 300 123 4567')).toEqual({ phone: '+573001234567' });
    expect(parseIdentifier('573001234567')).toEqual({ phone: '+573001234567' });
  });

  it('reconoce nombres de usuario sin importar la @ ni las mayúsculas', () => {
    expect(parseIdentifier('@Laura')).toEqual({ username: 'laura' });
  });

  it('rechaza formatos inválidos', () => {
    expect(() => parseIdentifier('+12')).toThrow(ValidationError);
    expect(() => parseIdentifier('a b')).toThrow(ValidationError);
  });

  it('exige contraseñas de 8+ caracteres con letras y números', () => {
    expect(() => assertPasswordStrength('corta1')).toThrow(ValidationError);
    expect(() => assertPasswordStrength('soloLetrasLargas')).toThrow(ValidationError);
    expect(() => assertPasswordStrength('Parla2026!')).not.toThrow();
  });
});

describe('pedidos de Servicios', () => {
  const line = (unitPriceCents: number, quantity: number) => ({
    productId: 'AZ-1KG', name: 'Azúcar rubia', unit: '1 kg', quantity, unitPriceCents, totalCents: unitPriceCents * quantity,
  });

  it('un pedido solo avanza: pagado no vuelve a pendiente y entregado es final', () => {
    expect(() => assertOrderTransition('pending_payment', 'paid')).not.toThrow();
    expect(() => assertOrderTransition('paid', 'preparing')).not.toThrow();
    expect(() => assertOrderTransition('paid', 'rejected')).not.toThrow();
    expect(() => assertOrderTransition('preparing', 'searching_driver')).not.toThrow();
    expect(() => assertOrderTransition('paid', 'searching_driver')).toThrow(ConflictError);
    expect(() => assertOrderTransition('rejected', 'preparing')).toThrow(ConflictError);
    expect(() => assertOrderTransition('searching_driver', 'driver_assigned')).not.toThrow();
    expect(() => assertOrderTransition('driver_assigned', 'on_the_way')).not.toThrow();
    expect(() => assertOrderTransition('searching_driver', 'delivered')).toThrow(ConflictError);
    expect(() => assertOrderTransition('on_the_way', 'delivered')).not.toThrow();
    expect(() => assertOrderTransition('paid', 'pending_payment')).toThrow(ConflictError);
    expect(() => assertOrderTransition('delivered', 'on_the_way')).toThrow(ConflictError);
    expect(() => assertOrderTransition('payment_expired', 'paid')).toThrow(ConflictError);
  });

  it('los montos deben cuadrar: líneas, subtotal y total con delivery', () => {
    expect(() => assertOrderTotals([line(450, 2), line(520, 1)], 1420, 650, 2070)).not.toThrow();
    expect(() => assertOrderTotals([], 0, 650, 650)).toThrow(ValidationError);
    expect(() => assertOrderTotals([{ ...line(450, 2), totalCents: 100 }], 100, 0, 100)).toThrow('no cuadra');
    expect(() => assertOrderTotals([line(450, 2)], 800, 650, 1450)).toThrow('subtotal');
    expect(() => assertOrderTotals([line(450, 2)], 900, 650, 1000)).toThrow('total');
    // Delivery contra entrega: por el QR van solo los productos (menos el cupón); sin propina.
    expect(() => assertOrderTotals([line(450, 2)], 900, 650, 900)).not.toThrow();
    expect(() => assertOrderTotals([line(450, 2)], 900, 650, 700, 0, 200)).not.toThrow();
    expect(() => assertOrderTotals([line(450, 2)], 900, 650, 900, 300)).toThrow('total');
    expect(deliveryPaidOnArrival({ subtotalCents: 900, deliveryFeeCents: 650, tipCents: 0, discountCents: 0, totalCents: 900 })).toBe(true);
    expect(deliveryPaidOnArrival({ subtotalCents: 900, deliveryFeeCents: 650, tipCents: 0, discountCents: 0, totalCents: 1550 })).toBe(false);
    expect(deliveryPaidOnArrival({ subtotalCents: 900, deliveryFeeCents: 0, tipCents: 0, discountCents: 0, totalCents: 900 })).toBe(false);
  });

  it('los avisos al cliente hablan en soles y enlazan al pedido', () => {
    expect(formatSoles(2070)).toBe('S/ 20.70');
    expect(orderPush('ord_1', 'paid', 2070, null, 'Bodega MercaYa')).toMatchObject({ body: expect.stringContaining('S/ 20.70'), url: '/app/pedidos/ord_1' });
    expect(orderPush('ord_1', 'preparing', 2070, null, 'Bodega MercaYa')?.body).toContain('Bodega MercaYa aceptó');
    expect(orderPush('ord_1', 'on_the_way', 2070, 'Carlos', null)?.body).toBe('Carlos lleva tu pedido.');
    expect(orderPush('ord_1', 'pending_payment', 2070, null, null)).toBeNull();
  });

  it('al dueño solo le avisa el pedido pagado que debe aceptar', () => {
    expect(businessOrderPush('ord_1', 'paid', 2070, 'Laura')).toMatchObject({ body: expect.stringContaining('Laura pagó S/ 20.70'), url: '/app/negocio/pedidos/ord_1' });
    expect(businessOrderPush('ord_1', 'preparing', 2070, 'Laura')).toBeNull();
  });
});
