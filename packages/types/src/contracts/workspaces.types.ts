import type { WorkspaceRole } from './enums.types';
import type { PublicUser } from './identity.types';

export interface WorkspaceSummary {
  id: string;
  name: string;
  description: string;
  color: string;
  role: WorkspaceRole;
  memberCount: number;
  createdAt: string;
}

export interface WorkspaceMember {
  memberId: string;
  role: WorkspaceRole;
  joinedAt: string;
  user: PublicUser;
}

export interface WorkspaceDetail extends WorkspaceSummary {
  /** Solo visible para administradores. */
  inviteCode: string | null;
  allowMemberGroups: boolean;
  members: WorkspaceMember[];
}

export interface CreateWorkspaceRequest {
  name: string;
  description?: string;
  color?: string;
}

export interface UpdateWorkspaceRequest {
  name?: string;
  description?: string;
  allowMemberGroups?: boolean;
}

export interface ChangeMemberRoleRequest {
  role: WorkspaceRole;
}

export interface InvitePreview {
  workspaceId: string;
  name: string;
  description: string;
  color: string;
  memberCount: number;
  alreadyMember: boolean;
}
