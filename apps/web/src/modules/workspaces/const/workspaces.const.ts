import type { PlanId, WorkspaceRole } from '@parla/types';

export const PLAN_NAMES: Record<PlanId, string> = { free: 'Gratis', team: 'Equipo', business: 'Empresa' };

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  admin: 'Administrador',
  member: 'Colaborador',
};

export const ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  admin: 'Invita personas, asigna roles y configura el espacio.',
  member: 'Conversa en chats y grupos del espacio.',
};

export const WORKSPACE_COLORS = [
  { id: 'teal', label: 'Teal', swatch: 'from-teal-500 to-teal-700' },
  { id: 'emerald', label: 'Esmeralda', swatch: 'from-emerald-500 to-teal-700' },
  { id: 'cyan', label: 'Cian', swatch: 'from-cyan-500 to-teal-700' },
] as const;
