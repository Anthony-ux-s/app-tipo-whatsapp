import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../../config/env.validation';
import { ConflictError, ForbiddenError, NotFoundError, TooManyRequestsError, UnauthorizedError, ValidationError } from '../../../kernel/domain-error';
import { open, seal } from '../../../kernel/secret-box';
import { InMemoryAuthRepository, InMemoryBusinessesRepository, makeBusiness, makeUser } from '../../../testing/in-memory.fakes';
import type { FerrohubClient, FerrohubProvisionInput, FerrohubProvisionResult, FerrohubRedeemInput, FerrohubRedeemResult, FerrohubStoreInfo } from './ferrohub.client';
import {
  ConnectFerrohubUseCase,
  DisconnectFerrohubUseCase,
  FerrohubSsoUseCase,
  FerrohubWebhookUseCase,
  normalizeFerrohubCode,
  ProvisionFerrohubUseCase,
  webhookUrlFor,
} from './ferrohub.use-cases';

const env = { publicWebUrl: 'https://parla.pe' } as AppEnv;

/** FerroHub de mentira: responde lo que cada prueba le pida y recuerda a qué se le llamó. */
class FakeFerrohub implements FerrohubClient {
  calls: string[] = [];
  redeemInput: FerrohubRedeemInput | null = null;
  provisionInput: FerrohubProvisionInput | null = null;
  redeemError: Error | null = null;
  provisionError: Error | null = null;
  info: FerrohubStoreInfo | null = {
    nombre: 'Ferretería El Maestro',
    aceptaPedidos: true,
    whatsappAdmin: '51987654321',
    umbralPedidoGrande: 600,
    umbralUnidades: 25,
    horario: { abre: '08:00', cierra: '19:00', dias: ['lun', 'mar'] },
    sucursales: [{ nombre: 'Centro', direccion: 'Jr. Pizarro 745, Trujillo', lat: -8.11, lng: -79.03 }],
    estado: 'activa',
    tenantId: 't_abc',
  };

  async redeem(input: FerrohubRedeemInput): Promise<FerrohubRedeemResult> {
    this.calls.push('redeem');
    this.redeemInput = input;
    if (this.redeemError) throw this.redeemError;
    return { apiBaseUrl: 'https://api.ferrohub.pe', apiKey: 'wiiil_secreta123', permisos: ['productos:leer'], tienda: { nombre: 'Ferretería El Maestro', sucursal: 'Centro' } };
  }
  async storeInfo() {
    this.calls.push('storeInfo');
    return this.info;
  }
  async provision(input: FerrohubProvisionInput): Promise<FerrohubProvisionResult> {
    this.calls.push('provision');
    this.provisionInput = input;
    if (this.provisionError) throw this.provisionError;
    return { tenantId: 't_nuevo', plan: 'semilla', estado: 'prueba', apiBaseUrl: 'https://api.ferrohub.pe', apiKey: 'wiiil_nueva456', ssoUrl: 'https://app.ferrohub.pe/sso?token=abc', ssoExpiraEn: 60 };
  }
  async sso(tenantId: string, parlaUserId: string) {
    this.calls.push(`sso:${tenantId}:${parlaUserId}`);
    return { ssoUrl: 'https://app.ferrohub.pe/sso?token=otro' };
  }
  async unlink(_url: string, _key: string, storeId: string) {
    this.calls.push(`unlink:${storeId}`);
  }
  async deprovision(tenantId: string) {
    this.calls.push(`deprovision:${tenantId}`);
  }
}

const redWiiilOk = () =>
  vi.fn(async () => new Response(JSON.stringify({ data: [{ nombre: 'Cemento Sol 42.5 kg' }, { nombre: 'Clavos 2"' }], siguiente: null }), { status: 200, headers: { 'content-type': 'application/json' } }));

describe('conectar una ferretería con FerroHub', () => {
  const rosa = makeUser({ displayName: 'Rosa' });
  const soporte = makeUser({ displayName: 'Soporte', isAdmin: true });
  let users: InMemoryAuthRepository;
  let businesses: InMemoryBusinessesRepository;
  let ferrohub: FakeFerrohub;
  let connect: ConnectFerrohubUseCase;
  let provision: ProvisionFerrohubUseCase;

  beforeEach(() => {
    users = new InMemoryAuthRepository();
    users.users.push(rosa, soporte);
    businesses = new InMemoryBusinessesRepository();
    ferrohub = new FakeFerrohub();
    connect = new ConnectFerrohubUseCase(businesses, users, ferrohub, env);
    provision = new ProvisionFerrohubUseCase(businesses, users, ferrohub, env);
    vi.stubGlobal('fetch', redWiiilOk());
  });
  afterEach(() => vi.unstubAllGlobals());

  describe('el código de enlace', () => {
    it('se acepta con o sin guiones y en minúsculas, y se rechaza lo que no es un código', () => {
      expect(normalizeFerrohubCode('fh-7k3m-92qx')).toBe('FH-7K3M-92QX');
      expect(normalizeFerrohubCode(' FH 7K3M 92QX ')).toBe('FH-7K3M-92QX');
      expect(normalizeFerrohubCode('FH7K3M92QX')).toBe('FH-7K3M-92QX');
      expect(() => normalizeFerrohubCode('FH-7K3M-92Q')).toThrow(ValidationError);
      // Sin 0, O, 1 ni I: son letras que se confunden al escribir.
      expect(() => normalizeFerrohubCode('FH-7K3M-92Q0')).toThrow(ValidationError);
      expect(() => normalizeFerrohubCode('FH-7K3M-92QI')).toThrow(ValidationError);
    });
  });

  describe('con código', () => {
    it('crea la tienda con los datos de FerroHub ya puestos, verificada y aprobada, y guarda la llave', async () => {
      const result = await connect.execute(rosa.id, 'FH-7K3M-92QX');

      expect(result.verified).toBe(true);
      expect(result.products).toBe(2);
      expect(result.business).toMatchObject({
        name: 'Ferretería El Maestro',
        service: 'ferreteria',
        address: 'Jr. Pizarro 745, Trujillo',
        location: { lat: -8.11, lng: -79.03 },
        opensAt: '08:00',
        closesAt: '19:00',
        status: 'approved',
        source: 'api',
        connector: 'ferrohub',
        verified: true,
      });
      const saved = (await businesses.findByOwner(rosa.id))!;
      expect(saved.api).toMatchObject({ format: 'redwiiil', baseUrl: 'https://api.ferrohub.pe', apiKey: 'wiiil_secreta123' });
      expect(saved.connector).toMatchObject({ kind: 'ferrohub', origin: 'code', tenantId: 't_abc' });
      // Se manda a FerroHub la tienda de Parla, a dónde avisar y un secreto propio de esa tienda.
      expect(ferrohub.redeemInput).toMatchObject({ code: 'FH-7K3M-92QX', parlaStoreId: saved.id, webhookUrl: `https://parla.pe/api/stores/${saved.id}/ferrohub-events` });
      expect(ferrohub.redeemInput!.webhookSecret).toHaveLength(64);
      expect(saved.connector!.webhookSecret).toBe(ferrohub.redeemInput!.webhookSecret);
    });

    it('una ferretería que FerroHub no tiene activa queda en revisión de soporte', async () => {
      ferrohub.info = { ...ferrohub.info!, estado: 'prueba' };
      const result = await connect.execute(rosa.id, 'FH-7K3M-92QX');
      expect(result.verified).toBe(false);
      expect(result.business.status).toBe('pending');
      expect(result.business.verified).toBe(false);
    });

    it('si la API todavía no tiene la ficha (store-info), conecta igual con los datos mínimos', async () => {
      ferrohub.info = null;
      const result = await connect.execute(rosa.id, 'FH-7K3M-92QX');
      expect(result.business.name).toBe('Ferretería El Maestro');
      expect(result.business.status).toBe('pending');
    });

    it('si FerroHub dice que no acepta pedidos, la tienda queda en pausa', async () => {
      ferrohub.info = { ...ferrohub.info!, aceptaPedidos: false };
      expect((await connect.execute(rosa.id, 'FH-7K3M-92QX')).business.acceptingOrders).toBe(false);
    });

    it('un código malo no deja ninguna tienda a medias', async () => {
      ferrohub.redeemError = new NotFoundError('No existe ese código');
      await expect(connect.execute(rosa.id, 'FH-7K3M-92QX')).rejects.toThrow(NotFoundError);
      expect(await businesses.findByOwner(rosa.id)).toBeNull();
    });

    it('si el código sirve pero Parla no puede leer los productos, avisa y deja todo como estaba', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
      await expect(connect.execute(rosa.id, 'FH-7K3M-92QX')).rejects.toThrow('no pudo leer tus productos');
      expect(await businesses.findByOwner(rosa.id)).toBeNull();
    });

    it('tras 5 intentos fallidos pide esperar; un acierto reinicia la cuenta', async () => {
      ferrohub.redeemError = new NotFoundError('No existe');
      for (let i = 0; i < 5; i += 1) await expect(connect.execute(rosa.id, 'FH-7K3M-92QX')).rejects.toThrow(NotFoundError);
      await expect(connect.execute(rosa.id, 'FH-7K3M-92QX')).rejects.toThrow(TooManyRequestsError);
      expect(ferrohub.calls.filter((c) => c === 'redeem')).toHaveLength(5);

      const other = makeUser({ displayName: 'Luis' });
      users.users.push(other);
      ferrohub.redeemError = new NotFoundError('No existe');
      for (let i = 0; i < 4; i += 1) await expect(connect.execute(other.id, 'FH-7K3M-92QX')).rejects.toThrow(NotFoundError);
      ferrohub.redeemError = null;
      await connect.execute(other.id, 'FH-7K3M-92QX');
    });

    it('conecta la tienda que la persona ya tenía (una cuenta, una tienda) y no la duplica', async () => {
      businesses.businesses.push(makeBusiness({ id: 'biz_rosa', ownerId: rosa.id, service: 'ferreteria', name: 'Mi ferre', status: 'pending' }));
      const result = await connect.execute(rosa.id, 'FH-7K3M-92QX');
      expect(result.business.id).toBe('biz_rosa');
      expect(businesses.businesses).toHaveLength(1);
      expect(result.business.status).toBe('approved');
    });

    it('una tienda ya conectada no se vuelve a conectar sin desvincular', async () => {
      await connect.execute(rosa.id, 'FH-7K3M-92QX');
      await expect(connect.execute(rosa.id, 'FH-7K3M-92QX')).rejects.toThrow(ConflictError);
    });

    it('soporte no abre tiendas', async () => {
      await expect(connect.execute(soporte.id, 'FH-7K3M-92QX')).rejects.toThrow(ForbiddenError);
      expect(ferrohub.calls).toEqual([]);
    });
  });

  describe('«Crear mi ferretería»', () => {
    const form = { name: 'Ferretería El Maestro', city: 'Trujillo', categories: ['Herramientas manuales', 'Electricidad'], ruc: '', ownerName: 'Juan Pérez', email: 'Juan@Correo.pe', phone: '+51 999 999 999' };

    it('crea la ferretería en FerroHub, la deja conectada y entrega el enlace al panel del dueño', async () => {
      const result = await provision.execute(rosa.id, form);

      expect(result.ssoUrl).toBe('https://app.ferrohub.pe/sso?token=abc');
      expect(result.business).toMatchObject({ name: 'Ferretería El Maestro', service: 'ferreteria', status: 'pending', source: 'api', connector: 'ferrohub', verified: false });
      expect(ferrohub.provisionInput).toMatchObject({
        owner: { parlaUserId: rosa.id, nombre: 'Juan Pérez', email: 'juan@correo.pe', telefono: '51999999999' },
        tienda: { nombre: 'Ferretería El Maestro', ciudad: 'Trujillo', rubros: ['Herramientas manuales', 'Electricidad'] },
      });
      const saved = (await businesses.findByOwner(rosa.id))!;
      expect(saved.api.apiKey).toBe('wiiil_nueva456');
      expect(saved.connector).toMatchObject({ origin: 'provision', tenantId: 't_nuevo' });
    });

    it('si FerroHub rechaza los datos (correo en uso) no queda nada creado y se explica el motivo', async () => {
      ferrohub.provisionError = new ConflictError('Ese correo ya está en uso con otra ferretería');
      await expect(provision.execute(rosa.id, form)).rejects.toThrow('correo ya está en uso');
      expect(await businesses.findByOwner(rosa.id)).toBeNull();
      expect(ferrohub.calls).not.toContain('deprovision:t_nuevo');
    });

    it('si algo falla después de crearla en FerroHub, la deshace allá y acá', async () => {
      vi.spyOn(businesses, 'setConnector').mockRejectedValueOnce(new Error('base caída'));
      await expect(provision.execute(rosa.id, form)).rejects.toThrow('base caída');
      expect(ferrohub.calls).toContain('deprovision:t_nuevo');
      expect(await businesses.findByOwner(rosa.id)).toBeNull();
    });

    it('pide datos razonables antes de llamar a FerroHub', async () => {
      await expect(provision.execute(rosa.id, { ...form, name: 'a' })).rejects.toThrow(ValidationError);
      await expect(provision.execute(rosa.id, { ...form, email: 'sin-arroba' })).rejects.toThrow(ValidationError);
      await expect(provision.execute(rosa.id, { ...form, phone: '123' })).rejects.toThrow(ValidationError);
      await expect(provision.execute(soporte.id, form)).rejects.toThrow(ForbiddenError);
      expect(ferrohub.calls).toEqual([]);
    });
  });

  describe('Mi negocio', () => {
    it('abre el panel de FerroHub con un enlace nuevo, y solo si la tienda está conectada', async () => {
      const sso = new FerrohubSsoUseCase(businesses, ferrohub);
      await expect(sso.execute(rosa.id)).rejects.toThrow(NotFoundError);
      await provision.execute(rosa.id, { name: 'Ferretería El Maestro', city: 'Trujillo', ownerName: 'Juan', email: 'j@correo.pe', phone: '999999999' });
      expect(await sso.execute(rosa.id)).toEqual({ url: 'https://app.ferrohub.pe/sso?token=otro' });
      expect(ferrohub.calls).toContain(`sso:t_nuevo:${rosa.id}`);
    });

    it('desvincular borra la llave, avisa a la ferretería y la tienda vuelve al catálogo de Parla', async () => {
      const disconnect = new DisconnectFerrohubUseCase(businesses, ferrohub);
      await expect(disconnect.execute(rosa.id)).rejects.toThrow(NotFoundError);
      const { business } = await connect.execute(rosa.id, 'FH-7K3M-92QX');
      const result = await disconnect.execute(rosa.id);
      expect(ferrohub.calls).toContain(`unlink:${business.id}`);
      expect(result).toMatchObject({ source: 'native', connector: null, verified: false });
      expect((await businesses.findByOwner(rosa.id))!.api.apiKey).toBe('');
    });
  });
});

describe('avisos de FerroHub (webhook)', () => {
  const SECRET = 'a'.repeat(64);
  const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);
  let businesses: InMemoryBusinessesRepository;
  let webhook: FerrohubWebhookUseCase;
  const connector = (origin: 'code' | 'provision' = 'code') => ({ kind: 'ferrohub' as const, origin, tenantId: 't_1', webhookSecret: SECRET, connectedAt: new Date(NOW), verifiedAt: null });
  const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body).digest('hex');
  const send = (body: object, over: { signature?: string; timestamp?: number } = {}) => {
    const raw = JSON.stringify(body);
    return webhook.execute('biz_1', raw, over.signature ?? sign(raw), String(Math.floor((over.timestamp ?? NOW) / 1000)), NOW);
  };

  beforeEach(() => {
    businesses = new InMemoryBusinessesRepository();
    businesses.businesses.push(makeBusiness({ id: 'biz_1', service: 'ferreteria', status: 'approved', source: 'api', connector: connector() }));
    webhook = new FerrohubWebhookUseCase(businesses);
  });

  it('acepta un aviso firmado y reciente', async () => {
    expect(await send({ eventId: 'e1', tipo: 'tienda.cerrada' })).toEqual({ ok: true });
    expect((await businesses.findById('biz_1'))!.acceptingOrders).toBe(false);
    await send({ eventId: 'e2', tipo: 'tienda.abierta' });
    expect((await businesses.findById('biz_1'))!.acceptingOrders).toBe(true);
  });

  it('rechaza firma mala, otro secreto, aviso viejo o tienda sin conexión (siempre la misma respuesta)', async () => {
    await expect(send({ eventId: 'x', tipo: 'tienda.cerrada' }, { signature: 'f'.repeat(64) })).rejects.toThrow(UnauthorizedError);
    const raw = JSON.stringify({ eventId: 'y', tipo: 'tienda.cerrada' });
    await expect(webhook.execute('biz_1', raw, sign(raw, 'otro-secreto'), String(NOW / 1000), NOW)).rejects.toThrow(UnauthorizedError);
    await expect(send({ eventId: 'z', tipo: 'tienda.cerrada' }, { timestamp: NOW - 6 * 60_000 })).rejects.toThrow(UnauthorizedError);
    await expect(webhook.execute('no-existe', raw, sign(raw), String(NOW / 1000), NOW)).rejects.toThrow(UnauthorizedError);
    expect((await businesses.findById('biz_1'))!.acceptingOrders).toBe(true);
  });

  it('un mismo eventId cuenta una sola vez', async () => {
    await send({ eventId: 'e1', tipo: 'tienda.cerrada' });
    await send({ eventId: 'e-otro', tipo: 'tienda.abierta' });
    expect(await send({ eventId: 'e1', tipo: 'tienda.cerrada' })).toEqual({ ok: true, duplicate: true });
    expect((await businesses.findById('biz_1'))!.acceptingOrders).toBe(true);
  });

  it('«desvinculada» corta la conexión, borra la llave y pausa los pedidos', async () => {
    await send({ eventId: 'd1', tipo: 'desvinculada' });
    const b = (await businesses.findById('biz_1'))!;
    expect(b.connector).toBeNull();
    expect(b.source).toBe('native');
    expect(b.api.apiKey).toBe('');
    expect(b.acceptingOrders).toBe(false);
  });

  it('el primer producto publica solo una ferretería creada desde Parla, pero no una conectada con código', async () => {
    businesses.businesses.push(makeBusiness({ id: 'biz_2', ownerId: 'o2', service: 'ferreteria', status: 'pending', source: 'api', connector: connector('provision') }));
    businesses.businesses.push(makeBusiness({ id: 'biz_3', ownerId: 'o3', service: 'ferreteria', status: 'pending', source: 'api', connector: connector('code') }));
    for (const id of ['biz_2', 'biz_3']) {
      const raw = JSON.stringify({ eventId: `p-${id}`, tipo: 'producto.actualizado' });
      await webhook.execute(id, raw, sign(raw), String(NOW / 1000), NOW);
    }
    expect((await businesses.findById('biz_2'))!.status).toBe('approved');
    expect((await businesses.findById('biz_3'))!.status).toBe('pending');
  });
});

describe('llaves cifradas en reposo', () => {
  it('se guardan cifradas, se leen de vuelta y un valor viejo sin cifrar se acepta tal cual', () => {
    const stored = seal('wiiil_secreta123');
    expect(stored).not.toContain('wiiil_secreta123');
    expect(stored.startsWith('enc:v1:')).toBe(true);
    expect(open(stored)).toBe('wiiil_secreta123');
    expect(open('wiiil_vieja')).toBe('wiiil_vieja');
    expect(seal(stored)).toBe(stored);
    expect(seal('')).toBe('');
    // Dos cifrados del mismo texto no se parecen (cada uno lleva su propio vector).
    expect(seal('igual')).not.toBe(seal('igual'));
  });

  it('un valor alterado no se abre (queda vacío en vez de dar una llave equivocada)', () => {
    const stored = seal('wiiil_secreta123');
    expect(open(`${stored.slice(0, -4)}AAAA`)).toBe('');
  });
});

describe('dirección de los avisos', () => {
  it('apunta al sitio público de Parla (o a FERROHUB_WEBHOOK_BASE si se define)', () => {
    expect(webhookUrlFor(env, 'biz_9')).toBe('https://parla.pe/api/stores/biz_9/ferrohub-events');
    vi.stubEnv('FERROHUB_WEBHOOK_BASE', 'https://tunel.ngrok.app/');
    expect(webhookUrlFor(env, 'biz_9')).toBe('https://tunel.ngrok.app/api/stores/biz_9/ferrohub-events');
    vi.unstubAllEnvs();
  });
});
