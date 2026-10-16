import type { WorkspaceRole } from '@parla/types';
import { ConflictError, ForbiddenError } from './domain-error';

/** Reglas de permisos dentro de un espacio de trabajo, sin dependencias de infraestructura. */

export function assertIsAdmin(role: WorkspaceRole | null): asserts role is 'admin' {
  if (role !== 'admin') throw new ForbiddenError('Solo un administrador puede hacer esto');
}

export function assertCanCreateGroup(role: WorkspaceRole | null, allowMemberGroups: boolean): void {
  if (role === null) throw new ForbiddenError('No perteneces a este espacio de trabajo');
  if (role !== 'admin' && !allowMemberGroups) {
    throw new ForbiddenError('En este espacio solo los administradores crean grupos');
  }
}

/** Un espacio nunca puede quedarse sin administradores. */
export function assertKeepsAnAdmin(
  adminCount: number,
  currentRole: WorkspaceRole,
  nextRole: WorkspaceRole | 'removed',
): void {
  if (currentRole === 'admin' && nextRole !== 'admin' && adminCount <= 1) {
    throw new ConflictError('El espacio debe tener al menos un administrador');
  }
}
