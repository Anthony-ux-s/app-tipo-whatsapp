import type { PresenceStatus, WorkspaceDetail, WorkspaceRole, WorkspaceSummary } from '@parla/types';
import { toPublicUser } from '../identity/user.mapper';
import type { MembershipRecord, WorkspaceRecord } from './workspaces.repository';

export function toWorkspaceSummary(ws: WorkspaceRecord, role: WorkspaceRole): WorkspaceSummary {
  return {
    id: ws.id,
    name: ws.name,
    description: ws.description,
    color: ws.color,
    role,
    memberCount: ws.memberCount,
    createdAt: ws.createdAt.toISOString(),
  };
}

export function toWorkspaceDetail(
  ws: WorkspaceRecord,
  role: WorkspaceRole,
  members: MembershipRecord[],
  presenceOf: (userId: string) => PresenceStatus,
): WorkspaceDetail {
  return {
    ...toWorkspaceSummary(ws, role),
    inviteCode: role === 'admin' ? ws.inviteCode : null,
    allowMemberGroups: ws.allowMemberGroups,
    members: members.map((m) => ({
      memberId: m.memberId,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
      user: toPublicUser(m.user, presenceOf(m.user.id)),
    })),
  };
}
