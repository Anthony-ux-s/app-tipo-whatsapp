import type { IntegrableService, IntegrationFormat } from '@parla/types';

/** La integración completa (con las claves): solo la leen el core y el gateway. */
export interface IntegrationRecord {
  service: IntegrableService;
  name: string;
  format: IntegrationFormat;
  enabled: boolean;
  baseUrl: string;
  prefix: string;
  apiKey: string;
  adminKey: string;
  updatedAt: Date | null;
  updatedById: string | null;
}

export type IntegrationChanges = Pick<IntegrationRecord, 'name' | 'format' | 'enabled' | 'baseUrl' | 'prefix' | 'apiKey' | 'adminKey'>;

export interface IntegrationsRepository {
  /** La del servicio, o una vacía (apagada) si nunca se configuró. */
  get(service: IntegrableService): Promise<IntegrationRecord>;
  save(service: IntegrableService, changes: IntegrationChanges, adminId: string): Promise<IntegrationRecord>;
}

export const INTEGRATIONS_REPOSITORY = Symbol('INTEGRATIONS_REPOSITORY');
