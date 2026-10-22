import type { IntegrableService } from '@parla/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError, ValidationError } from '../../../kernel/domain-error';
import { InMemoryAuthRepository, makeUser } from '../../../testing/in-memory.fakes';
import type { IntegrationChanges, IntegrationRecord, IntegrationsRepository } from './integrations.repository';
import { ListIntegrationsUseCase, UpdateIntegrationUseCase, normalizeBaseUrl, normalizePrefix } from './use-cases/integrations.use-cases';

class MemoryIntegrations implements IntegrationsRepository {
  rows = new Map<IntegrableService, IntegrationRecord>();
  async get(service: IntegrableService): Promise<IntegrationRecord> {
    return this.rows.get(service) ?? { service, name: '', format: 'parla', enabled: false, baseUrl: '', prefix: '', apiKey: '', adminKey: '', updatedAt: null, updatedById: null };
  }
  async save(service: IntegrableService, changes: IntegrationChanges, adminId: string): Promise<IntegrationRecord> {
    const row = { service, ...changes, updatedAt: new Date(), updatedById: adminId };
    this.rows.set(service, row);
    return row;
  }
}

describe('integraciones de servicios (API de tienda)', () => {
  const soporte = makeUser({ displayName: 'Soporte Parla', isAdmin: true });
  const ana = makeUser({ displayName: 'Ana' });
  let repo: MemoryIntegrations;
  let update: UpdateIntegrationUseCase;
  let list: ListIntegrationsUseCase;
  const tecno = { name: 'TecnoYa', enabled: true, baseUrl: 'http://localhost:4103/', prefix: '/tecnoya/v1', apiKey: 'tecnoya-demo-2026' };

  beforeEach(() => {
    const users = new InMemoryAuthRepository();
    users.users.push(soporte, ana);
    repo = new MemoryIntegrations();
    update = new UpdateIntegrationUseCase(users, repo);
    list = new ListIntegrationsUseCase(users, repo);
  });

  it('solo soporte la configura, y la clave nunca vuelve completa', async () => {
    await expect(update.execute(ana.id, 'tecnologia', tecno)).rejects.toThrow(ForbiddenError);
    const saved = await update.execute(soporte.id, 'tecnologia', tecno);
    expect(saved).toMatchObject({ enabled: true, baseUrl: 'http://localhost:4103', prefix: '/tecnoya/v1', apiKeySet: true, apiKeyHint: '••••2026', updatedByName: 'Soporte Parla' });
    expect(JSON.stringify(await list.execute(soporte.id))).not.toContain('tecnoya-demo-2026');
  });

  it('si no se escribe una clave nueva, se conserva la guardada; y se puede quitar', async () => {
    await update.execute(soporte.id, 'tecnologia', tecno);
    await update.execute(soporte.id, 'tecnologia', { ...tecno, apiKey: '', enabled: false });
    expect((await repo.get('tecnologia')).apiKey).toBe('tecnoya-demo-2026');
    await update.execute(soporte.id, 'tecnologia', { ...tecno, apiKey: '', clearApiKey: true });
    expect((await repo.get('tecnologia')).apiKey).toBe('');
  });

  it('reconoce una llave de RED WIIIL y usa la raíz de su sitio', async () => {
    const saved = await update.execute(soporte.id, 'ferreteria', { name: 'Red Wiiil', enabled: false, baseUrl: 'http://localhost:3000/admin/inventory', prefix: '/algo', apiKey: 'wiiil_abc123' });
    expect(saved).toMatchObject({ format: 'redwiiil', baseUrl: 'http://localhost:3000', prefix: '', apiKeyHint: '••••c123' });
    // Una llave de otro sistema deja el formato de Parla.
    expect((await update.execute(soporte.id, 'tecnologia', tecno)).format).toBe('parla');
  });

  it('valida la URL y la ruta, y no se enciende sin URL', async () => {
    await expect(update.execute(soporte.id, 'tecnologia', { ...tecno, baseUrl: '' })).rejects.toThrow(ValidationError);
    expect(() => normalizeBaseUrl('ftp://tienda.pe')).toThrow(ValidationError);
    expect(() => normalizeBaseUrl('https://user:clave@tienda.pe')).toThrow(ValidationError);
    expect(normalizeBaseUrl('https://api.tienda.pe/')).toBe('https://api.tienda.pe');
    expect(normalizePrefix('tienda/v1/')).toBe('/tienda/v1');
    expect(() => normalizePrefix('/tienda v1')).toThrow(ValidationError);
  });
});
