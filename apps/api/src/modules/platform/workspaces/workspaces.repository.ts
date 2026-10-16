import type { WorkspaceRole } from '@parla/types';
import type { UserRecord } from '../identity/user.record';

export interface WorkspaceRecord {
  id: string;
  name: string;
  description: string;
  color: string;
  inviteCode: string;
  allowMemberGroups: boolean;
  creatorId: string;
  createdAt: Date;
  memberCount: number;
}

export interface MembershipRecord {
  memberId: string;
  role: WorkspaceRole;
  joinedAt: Date;
  user: UserRecord;
}

export interface NewWorkspace {
  name: string;
  description: string;
  color: string;
  inviteCode: string;
  creatorId: string;
}

export interface WorkspaceChanges {
  name?: string;
  description?: string;
  allowMemberGroups?: boolean;
  inviteCode?: string;
}

export interface WorkspacesRepository {
  listForUser(userId: string): Promise<(WorkspaceRecord & { role: WorkspaceRole })[]>;
  findById(id: string): Promise<WorkspaceRecord | null>;
  findByInviteCode(code: string): Promise<WorkspaceRecord | null>;
  roleOf(workspaceId: string, userId: string): Promise<WorkspaceRole | null>;
  listMembers(workspaceId: string): Promise<MembershipRecord[]>;
  countAdmins(workspaceId: string): Promise<number>;
  /** Crea el espacio y deja a su creador como administrador. */
  create(input: NewWorkspace): Promise<WorkspaceRecord>;
  update(id: string, changes: WorkspaceChanges): Promise<WorkspaceRecord>;
  addMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<void>;
  changeRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<void>;
  /** Saca al miembro del espacio y de todas sus conversaciones dentro de él. */
  removeMember(workspaceId: string, userId: string): Promise<void>;
  /** Usuarios que comparten algún espacio con este (para avisos de presencia). */
  listContactIds(userId: string): Promise<string[]>;
}

export const WORKSPACES_REPOSITORY = Symbol('WORKSPACES_REPOSITORY');
