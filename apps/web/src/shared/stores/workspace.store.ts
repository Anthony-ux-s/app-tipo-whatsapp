import type {
  CreateWorkspaceRequest,
  InvitePreview,
  PresencePayload,
  UpdateWorkspaceRequest,
  WorkspaceDetail,
  WorkspaceRole,
  WorkspaceSummary,
} from '@parla/types';
import { create } from 'zustand';
import { http } from '../utils/http';

interface WorkspaceState {
  workspaces: WorkspaceSummary[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  details: Record<string, WorkspaceDetail>;
  loadWorkspaces: () => Promise<void>;
  loadDetail: (workspaceId: string) => Promise<WorkspaceDetail>;
  createWorkspace: (input: CreateWorkspaceRequest) => Promise<WorkspaceSummary>;
  previewInvite: (code: string) => Promise<InvitePreview>;
  joinInvite: (code: string) => Promise<WorkspaceSummary>;
  updateWorkspace: (workspaceId: string, changes: UpdateWorkspaceRequest) => Promise<void>;
  changeRole: (workspaceId: string, userId: string, role: WorkspaceRole) => Promise<void>;
  removeMember: (workspaceId: string, userId: string) => Promise<void>;
  regenerateInvite: (workspaceId: string) => Promise<void>;
  applyPresence: (payload: PresencePayload) => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  const storeDetail = (detail: WorkspaceDetail) => {
    set({
      details: { ...get().details, [detail.id]: detail },
      workspaces: get().workspaces.map((w) =>
        w.id === detail.id ? { ...w, name: detail.name, description: detail.description, memberCount: detail.memberCount, role: detail.role } : w,
      ),
    });
    return detail;
  };

  return {
    workspaces: [],
    status: 'idle',
    details: {},

    loadWorkspaces: async () => {
      if (get().status === 'idle') set({ status: 'loading' });
      try {
        set({ workspaces: await http.get<WorkspaceSummary[]>('/workspaces'), status: 'ready' });
      } catch (error) {
        set({ status: 'error' });
        throw error;
      }
    },

    loadDetail: async (workspaceId) => storeDetail(await http.get<WorkspaceDetail>(`/workspaces/${workspaceId}`)),

    createWorkspace: async (input) => {
      const ws = await http.post<WorkspaceSummary>('/workspaces', input);
      set({ workspaces: [...get().workspaces, ws] });
      return ws;
    },

    previewInvite: (code) => http.get<InvitePreview>(`/invites/${encodeURIComponent(code)}`),

    joinInvite: async (code) => {
      const ws = await http.post<WorkspaceSummary>(`/invites/${encodeURIComponent(code)}/join`);
      set({ workspaces: [...get().workspaces.filter((w) => w.id !== ws.id), ws] });
      return ws;
    },

    updateWorkspace: async (workspaceId, changes) => {
      storeDetail(await http.patch<WorkspaceDetail>(`/admin/workspaces/${workspaceId}`, changes));
    },

    changeRole: async (workspaceId, userId, role) => {
      storeDetail(await http.patch<WorkspaceDetail>(`/admin/workspaces/${workspaceId}/members/${userId}`, { role }));
    },

    removeMember: async (workspaceId, userId) => {
      storeDetail(await http.delete<WorkspaceDetail>(`/admin/workspaces/${workspaceId}/members/${userId}`));
    },

    regenerateInvite: async (workspaceId) => {
      storeDetail(await http.post<WorkspaceDetail>(`/admin/workspaces/${workspaceId}/invite-code`));
    },

    applyPresence: ({ userId, presence, lastSeenAt }) => {
      const details = Object.fromEntries(
        Object.entries(get().details).map(([id, detail]) => [
          id,
          {
            ...detail,
            members: detail.members.map((m) =>
              m.user.id === userId ? { ...m, user: { ...m.user, presence, lastSeenAt: lastSeenAt ?? m.user.lastSeenAt } } : m,
            ),
          },
        ]),
      );
      set({ details });
    },

    reset: () => set({ workspaces: [], status: 'idle', details: {} }),
  };
});
