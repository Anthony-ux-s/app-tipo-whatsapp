import type { StoreProduct } from '@parla/types';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppEnv } from '../../../config/env.validation';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../kernel/domain-error';
import { InMemoryAuthRepository, InMemoryBusinessesRepository, InMemoryOrdersRepository, InMemoryProductsRepository, makeBusiness, makeUser } from '../../../testing/in-memory.fakes';
import { StoreApiUseCase } from './store-api.use-cases';
import { UpdateMyBusinessUseCase } from '../services/use-cases/business-orders.use-cases';
import {
  GetInternalIntegrationUseCase,
  ListAdminStoresUseCase,
  ListStoresUseCase,
  ManageIntegrationUseCase,
  ManageProductsUseCase,
  RegisterStoreUseCase,
  ReviewStoreUseCase,
} from './stores.use-cases';

const env = { internalToken: 'token-interno', coreInternalUrl: 'http://core:4101' } as AppEnv;

const arroz = (over: Partial<StoreProduct> = {}): StoreProduct => ({ sku: 'ARR-1', name: 'Arroz extra', unit: '5 kg', priceCents: 2290, listPriceCents: null, stock: 10, category: 'abarrotes', imageUrl: null, active: true, ...over });
const registro = { name: 'Bodega Don Lucho', service: 'mercado' as const, description: 'Abarrotes', address: 'Av. Benavides 1180, Miraflores', opensAt: '08:00', closesAt: '22:00' };

describe('tiendas (marketplace)', () => {
  const soporte = makeUser({ displayName: 'Soporte', isAdmin: true });
  const rosa = makeUser({ displayName: 'Rosa', phone: '+51999111222' });
  const luis = makeUser({ displayName: 'Luis' });
  let users: InMemoryAuthRepository;
  let businesses: InMemoryBusinessesRepository;
  let products: InMemoryProductsRepository;
  let register: RegisterStoreUseCase;
  let review: ReviewStoreUseCase;
  let list: ListStoresUseCase;
  let manage: ManageProductsUseCase;
  let integration: ManageIntegrationUseCase;
  let storeApi: StoreApiUseCase;

  beforeEach(() => {
    users = new InMemoryAuthRepository();
    users.users.push(soporte, rosa, luis);
    businesses = new InMemoryBusinessesRepository();
    products = new InMemoryProductsRepository();
    const orders = new InMemoryOrdersRepository(businesses);
    register = new RegisterStoreUseCase(businesses, users);
    const adminList = new ListAdminStoresUseCase(users, businesses, products);
    review = new ReviewStoreUseCase(users, businesses, adminList);
    list = new ListStoresUseCase(businesses, orders);
    manage = new ManageProductsUseCase(businesses, products);
    integration = new ManageIntegrationUseCase(businesses);
    storeApi = new StoreApiUseCase(businesses, products);
  });

  describe('abrir una tienda', () => {
    it('queda en revisión y no vende hasta que soporte la apruebe', async () => {
      const mine = await register.execute(rosa.id, registro);
      expect(mine).toMatchObject({ status: 'pending', service: 'mercado', source: 'native', name: 'Bodega Don Lucho' });
      expect(await list.execute('mercado')).toEqual([]);
      const store = (await businesses.list({}))[0];
      expect((await new GetInternalIntegrationUseCase(businesses, env).execute(store.id)).enabled).toBe(false);
    });

    it('soporte no puede abrir una tienda: solo administra Parla', async () => {
      await expect(register.execute(soporte.id, registro)).rejects.toThrow('no pueden abrir una tienda');
      expect(await businesses.findByOwner(soporte.id)).toBeFalsy();
    });

    it('pide datos razonables y una sola tienda por cuenta', async () => {
      await expect(register.execute(rosa.id, { ...registro, name: 'ab' })).rejects.toThrow(ValidationError);
      await expect(register.execute(rosa.id, { ...registro, address: 'x' })).rejects.toThrow(/dirección/);
      await expect(register.execute(rosa.id, { ...registro, service: 'viajes' as never })).rejects.toThrow(/categoría/);
      await expect(register.execute(rosa.id, { ...registro, opensAt: '8am' })).rejects.toThrow(/HH:MM/);
      await register.execute(rosa.id, registro);
      await expect(register.execute(rosa.id, registro)).rejects.toThrow(ConflictError);
    });
  });

  describe('revisión de soporte', () => {
    let id: string;
    beforeEach(async () => {
      await register.execute(rosa.id, registro);
      id = (await businesses.list({}))[0].id;
    });

    it('solo soporte decide, y aprobar la deja a la venta', async () => {
      await expect(review.execute(luis.id, id, { action: 'approve' })).rejects.toThrow(ForbiddenError);
      const approved = await review.execute(soporte.id, id, { action: 'approve' });
      expect(approved).toMatchObject({ status: 'approved', ownerName: 'Rosa', ownerPhone: '+51999111222' });
      expect((await list.execute('mercado', new Date('2026-10-22T17:00:00Z'))).map((s) => s.name)).toEqual(['Bodega Don Lucho']);
    });

    it('rechazar y suspender llevan motivo, que el dueño ve', async () => {
      await expect(review.execute(soporte.id, id, { action: 'reject' })).rejects.toThrow(/motivo/);
      await review.execute(soporte.id, id, { action: 'reject', note: 'Falta la dirección exacta' });
      expect((await businesses.findByOwner(rosa.id))?.reviewNote).toBe('Falta la dirección exacta');
      await review.execute(soporte.id, id, { action: 'approve' });
      expect((await businesses.findByOwner(rosa.id))?.reviewNote).toBe('');
      await review.execute(soporte.id, id, { action: 'suspend', note: 'Reclamos repetidos' });
      expect(await list.execute('mercado')).toEqual([]);
      await review.execute(soporte.id, id, { action: 'reactivate' });
      expect((await businesses.findByOwner(rosa.id))?.status).toBe('approved');
    });

    it('una tienda rechazada que corrige sus datos vuelve a revisión', async () => {
      await review.execute(soporte.id, id, { action: 'reject', note: 'Falta la dirección exacta' });
      const update = new UpdateMyBusinessUseCase(businesses);
      // Pausar o cambiar el horario no cuenta como corregir: sigue rechazada.
      expect((await update.execute(rosa.id, { acceptingOrders: false })).status).toBe('rejected');
      const fixed = await update.execute(rosa.id, { address: 'Av. Benavides 1180, piso 2, Miraflores' });
      expect(fixed).toMatchObject({ status: 'pending', reviewNote: '' });
    });

    it('no se puede saltar pasos (suspender una pendiente, reactivar una aprobada)', async () => {
      await expect(review.execute(soporte.id, id, { action: 'suspend', note: 'x' })).rejects.toThrow(ConflictError);
      await review.execute(soporte.id, id, { action: 'approve' });
      await expect(review.execute(soporte.id, id, { action: 'reactivate' })).rejects.toThrow(ConflictError);
      await expect(review.execute(soporte.id, 'no-existe', { action: 'approve' })).rejects.toThrow(NotFoundError);
    });
  });

  describe('lista para los clientes', () => {
    it('solo aprobadas, por categoría, con las abiertas primero', async () => {
      businesses.businesses.push(
        makeBusiness({ id: 'a', name: 'Abierta', ownerId: 'o1', opensAt: '00:00', closesAt: '00:00' }),
        makeBusiness({ id: 'b', name: 'Cerrada por pausa', ownerId: 'o2', acceptingOrders: false }),
        makeBusiness({ id: 'c', name: 'En revisión', ownerId: 'o3', status: 'pending' }),
        makeBusiness({ id: 'd', name: 'Tecno', ownerId: 'o4', service: 'tecnologia' }),
      );
      const mercado = await list.execute('mercado', new Date('2026-10-22T17:00:00Z'));
      expect(mercado.map((s) => [s.name, s.open])).toEqual([
        ['Abierta', true],
        ['Cerrada por pausa', false],
      ]);
      expect(mercado[1].closedMessage).toMatch(/pausó/);
      await expect(list.execute('viajes' as never)).rejects.toThrow(ValidationError);
    });
  });

  describe('catálogo propio', () => {
    beforeEach(async () => {
      await register.execute(rosa.id, registro);
    });

    it('crea, edita y borra productos; el sku no se repite', async () => {
      await manage.create(rosa.id, arroz());
      await expect(manage.create(rosa.id, arroz())).rejects.toThrow(ConflictError);
      expect((await manage.update(rosa.id, 'ARR-1', arroz({ priceCents: 2490 }))).priceCents).toBe(2490);
      await expect(manage.update(rosa.id, 'NO-EXISTE', arroz())).rejects.toThrow(NotFoundError);
      await manage.remove(rosa.id, 'ARR-1');
      expect(await manage.list(rosa.id)).toEqual([]);
    });

    it('valida precio, stock, oferta y foto', async () => {
      await expect(manage.create(rosa.id, arroz({ priceCents: 0 }))).rejects.toThrow(/precio/i);
      await expect(manage.create(rosa.id, arroz({ stock: -1 }))).rejects.toThrow(/stock/i);
      await expect(manage.create(rosa.id, arroz({ imageUrl: 'http://x.com/a.jpg' }))).rejects.toThrow(/https/);
      await expect(manage.create(rosa.id, arroz({ sku: 'con espacio' }))).rejects.toThrow(/código/);
      // Una «oferta» que no es más barata se ignora.
      expect((await manage.create(rosa.id, arroz({ listPriceCents: 2000 }))).listPriceCents).toBeNull();
      expect((await manage.create(rosa.id, arroz({ sku: 'ARR-2', listPriceCents: 2890 }))).listPriceCents).toBe(2890);
    });

    it('importa por lote: guarda las buenas y devuelve las malas con su fila', async () => {
      await manage.create(rosa.id, arroz());
      const result = await manage.import(rosa.id, [arroz({ priceCents: 2300 }), arroz({ sku: 'AZU-1', name: 'Azúcar', priceCents: 450 }), arroz({ sku: 'MAL 1' }), arroz({ sku: 'MAL-2', priceCents: -5 })]);
      expect(result).toMatchObject({ created: 1, updated: 1 });
      expect(result.errors.map((e) => e.row)).toEqual([3, 4]);
      expect((await manage.list(rosa.id)).map((p) => p.sku).sort()).toEqual(['ARR-1', 'AZU-1']);
      await expect(manage.import(rosa.id, [])).rejects.toThrow(/No hay filas/);
      await expect(manage.import(rosa.id, Array.from({ length: 201 }, (_, i) => arroz({ sku: `S${i}` })))).rejects.toThrow(/hasta 200/);
    });

    it('sin tienda no hay catálogo, y cada dueño ve solo el suyo', async () => {
      await expect(manage.list(luis.id)).rejects.toThrow(NotFoundError);
      await manage.create(rosa.id, arroz());
      await register.execute(luis.id, { ...registro, name: 'Ferretería Luis', service: 'ferreteria' });
      expect(await manage.list(luis.id)).toEqual([]);
    });
  });

  describe('conectar la API propia', () => {
    beforeEach(async () => {
      await register.execute(rosa.id, registro);
      const id = (await businesses.list({}))[0].id;
      await review.execute(soporte.id, id, { action: 'approve' });
    });

    it('con URL la tienda pasa a vender desde su API (y se bloquea el catálogo de Parla); sin URL vuelve', async () => {
      await manage.create(rosa.id, arroz());
      const saved = await integration.save(rosa.id, { baseUrl: 'https://api.tienda.pe/', prefix: 'tienda/v1', apiKey: 'clave-secreta-1234' });
      expect(saved).toMatchObject({ source: 'api', baseUrl: 'https://api.tienda.pe', prefix: '/tienda/v1', apiKeySet: true, apiKeyHint: '••••1234' });
      expect(JSON.stringify(saved)).not.toContain('clave-secreta');
      await expect(manage.list(rosa.id)).rejects.toThrow(/propio sistema/);
      const id = (await businesses.findByOwner(rosa.id))!.id;
      expect(await new GetInternalIntegrationUseCase(businesses, env).execute(id)).toMatchObject({ enabled: true, baseUrl: 'https://api.tienda.pe', prefix: '/tienda/v1', apiKey: 'clave-secreta-1234' });
      // Sin escribir una clave nueva se conserva la guardada.
      await integration.save(rosa.id, { baseUrl: 'https://api.tienda.pe', prefix: '/tienda/v1' });
      expect((await businesses.findByOwner(rosa.id))!.api.apiKey).toBe('clave-secreta-1234');
      expect((await integration.save(rosa.id, { baseUrl: '', prefix: '' })).source).toBe('native');
      expect(await manage.list(rosa.id)).toHaveLength(1);
    });

    it('rechaza URLs raras', async () => {
      await expect(integration.save(rosa.id, { baseUrl: 'ftp://x.com', prefix: '' })).rejects.toThrow(/https/);
      await expect(integration.save(rosa.id, { baseUrl: 'https://u:p@x.com', prefix: '' })).rejects.toThrow(/clave/);
      await expect(integration.save(rosa.id, { baseUrl: 'https://x.com', prefix: '/a b' })).rejects.toThrow(/ruta/);
    });

    it('para el gateway, una tienda con el catálogo de Parla se sirve desde el core', async () => {
      const id = (await businesses.findByOwner(rosa.id))!.id;
      expect(await new GetInternalIntegrationUseCase(businesses, env).execute(id)).toMatchObject({
        enabled: true,
        format: 'parla',
        baseUrl: 'http://core:4101',
        prefix: `/api/internal/store-api/${id}`,
        apiKey: 'token-interno',
      });
      expect((await new GetInternalIntegrationUseCase(businesses, env).execute('desconocida')).enabled).toBe(false);
    });
  });

  describe('API de tienda del core (lo que usa el gateway)', () => {
    let id: string;
    beforeEach(async () => {
      await register.execute(rosa.id, registro);
      id = (await businesses.list({}))[0].id;
      await review.execute(soporte.id, id, { action: 'approve' });
      await manage.create(rosa.id, arroz({ stock: 5 }));
      await manage.create(rosa.id, arroz({ sku: 'OCULTO', name: 'Oculto', active: false }));
    });

    it('el catálogo solo muestra lo activo y se busca por nombre', async () => {
      expect((await storeApi.search(id, '')).map((p) => p.sku)).toEqual(['ARR-1']);
      expect(await storeApi.search(id, 'zzz')).toEqual([]);
      await expect(storeApi.product(id, 'OCULTO')).rejects.toThrow(NotFoundError);
      expect((await storeApi.product(id, 'ARR-1')).priceCents).toBe(2290);
    });

    it('reservar descuenta el stock una sola vez por pedido, y anular lo devuelve', async () => {
      expect(await storeApi.reserve(id, 'ord_1', [{ sku: 'ARR-1', quantity: 2 }])).toEqual({ ok: true });
      expect(await storeApi.reserve(id, 'ord_1', [{ sku: 'ARR-1', quantity: 2 }])).toEqual({ ok: true });
      expect((await storeApi.product(id, 'ARR-1')).stock).toBe(3);
      expect(await storeApi.release(id, 'ord_1')).toBe(true);
      expect(await storeApi.release(id, 'ord_1')).toBe(false);
      expect((await storeApi.product(id, 'ARR-1')).stock).toBe(5);
    });

    it('es todo o nada: si una línea no alcanza, no se descuenta nada', async () => {
      await manage.create(rosa.id, arroz({ sku: 'AZU-1', name: 'Azúcar', stock: 1 }));
      expect(await storeApi.reserve(id, 'ord_2', [{ sku: 'ARR-1', quantity: 2 }, { sku: 'AZU-1', quantity: 3 }])).toEqual({ ok: false, reason: 'OUT_OF_STOCK', sku: 'AZU-1' });
      expect((await storeApi.product(id, 'ARR-1')).stock).toBe(5);
      expect(await storeApi.reserve(id, 'ord_3', [{ sku: 'NOPE', quantity: 1 }])).toEqual({ ok: false, reason: 'UNKNOWN_PRODUCT', sku: 'NOPE' });
    });

    it('una tienda suspendida ya no vende, pero se puede anular lo que tenía reservado', async () => {
      await storeApi.reserve(id, 'ord_4', [{ sku: 'ARR-1', quantity: 1 }]);
      await review.execute(soporte.id, id, { action: 'suspend', note: 'Reclamos' });
      await expect(storeApi.reserve(id, 'ord_5', [{ sku: 'ARR-1', quantity: 1 }])).rejects.toThrow(NotFoundError);
      await expect(storeApi.search(id, '')).rejects.toThrow(NotFoundError);
      expect(await storeApi.release(id, 'ord_4')).toBe(true);
    });

    it('un cambio rápido de precio, oferta y stock se valida', async () => {
      expect(await storeApi.patch(id, 'ARR-1', { priceCents: 2000, listPriceCents: 2500, stock: 9 })).toMatchObject({ priceCents: 2000, listPriceCents: 2500, stock: 9 });
      expect((await storeApi.patch(id, 'ARR-1', { listPriceCents: null })).listPriceCents).toBeNull();
      await expect(storeApi.patch(id, 'ARR-1', { priceCents: 0 })).rejects.toThrow(ValidationError);
      await expect(storeApi.patch(id, 'NOPE', { stock: 1 })).rejects.toThrow(NotFoundError);
    });
  });
});
