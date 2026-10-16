import { Injectable } from '@nestjs/common';
import type { PlanId, WorkspaceRole } from '@parla/types';
import type { Workspace } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { toUserRecord } from '../../../infra/prisma/user-row';
import type {
  MembershipRecord,
  NewWorkspace,
  WorkspaceChanges,
  WorkspaceRecord,
  WorkspacesRepository,
} from './workspaces.repository';

type WorkspaceRow = Workspace & { _count: { members: number } };

const withCount = { _count: { select: { members: true } } } as const;

function toRecord(row: WorkspaceRow): WorkspaceRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    inviteCode: row.inviteCode,
    allowMemberGroups: row.allowMemberGroups,
    creatorId: row.creatorId,
    createdAt: row.createdAt,
    memberCount: row._count.members,
    plan: row.plan as PlanId,
    planExpiresAt: row.planExpiresAt,
  };
}

@Injectable()
export class PrismaWorkspacesRepository implements WorkspacesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string) {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { userId },
      orderBy: { joinedAt: 'asc' },
      include: { workspace: { include: withCount } },
    });
    return rows.map((m) => ({ ...toRecord(m.workspace), role: m.role as WorkspaceRole }));
  }

  async findById(id: string): Promise<WorkspaceRecord | null> {
    const row = await this.prisma.workspace.findUnique({ where: { id }, include: withCount });
    return row ? toRecord(row) : null;
  }

  async findByInviteCode(code: string): Promise<WorkspaceRecord | null> {
    const row = await this.prisma.workspace.findUnique({ where: { inviteCode: code }, include: withCount });
    return row ? toRecord(row) : null;
  }

  async roleOf(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
    const row = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    return (row?.role as WorkspaceRole | undefined) ?? null;
  }

  async listMembers(workspaceId: string): Promise<MembershipRecord[]> {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: true },
      orderBy: [{ role: 'asc' }, { user: { displayName: 'asc' } }],
    });
    return rows.map((m) => ({
      memberId: m.id,
      role: m.role as WorkspaceRole,
      joinedAt: m.joinedAt,
      user: toUserRecord(m.user),
    }));
  }

  countAdmins(workspaceId: string): Promise<number> {
    return this.prisma.workspaceMember.count({ where: { workspaceId, role: 'admin' } });
  }

  async create(input: NewWorkspace): Promise<WorkspaceRecord> {
    const row = await this.prisma.workspace.create({
      data: { ...input, members: { create: { userId: input.creatorId, role: 'admin' } } },
      include: withCount,
    });
    return toRecord(row);
  }

  async update(id: string, changes: WorkspaceChanges): Promise<WorkspaceRecord> {
    const row = await this.prisma.workspace.update({ where: { id }, data: changes, include: withCount });
    return toRecord(row);
  }

  async addMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<void> {
    await this.prisma.workspaceMember.create({ data: { workspaceId, userId, role } });
  }

  async changeRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<void> {
    await this.prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId } },
      data: { role },
    });
  }

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.conversationParticipant.deleteMany({ where: { userId, conversation: { workspaceId } } }),
      this.prisma.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId, userId } } }),
    ]);
  }

  async delete(workspaceId: string): Promise<void> {
    await this.prisma.workspace.deleteMany({ where: { id: workspaceId } });
  }

  async listContactIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { workspace: { members: { some: { userId } } }, userId: { not: userId } },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((r) => r.userId);
  }
}
