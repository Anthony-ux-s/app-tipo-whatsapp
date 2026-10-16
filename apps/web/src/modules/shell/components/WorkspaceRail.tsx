import type { SessionUser, WorkspaceSummary } from '@parla/types';
import { Plus, Settings } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { Avatar } from '@shared/ui/Avatar';
import { LogoMark } from '@shared/ui/Logo';
import { WorkspaceBadge } from '@shared/ui/WorkspaceBadge';

interface WorkspaceRailProps {
  user: SessionUser;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  onCreate: () => void;
}

/** Barra de espacios de trabajo (solo escritorio), al estilo de las apps de equipos. */
export function WorkspaceRail({ user, workspaces, activeWorkspaceId, onCreate }: WorkspaceRailProps) {
  return (
    <nav aria-label="Espacios de trabajo" className="hidden w-[72px] shrink-0 flex-col items-center gap-2 bg-teal-950 py-4 md:flex dark:bg-[#071015]">
      <Link to="/app" aria-label="Inicio" className="mb-3">
        <LogoMark className="size-10" />
      </Link>
      <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto px-2">
        {workspaces.map((ws) => {
          const active = ws.id === activeWorkspaceId;
          return (
            <NavLink key={ws.id} to={`/app/w/${ws.id}`} title={ws.name} aria-label={ws.name} className="group relative flex items-center">
              <span
                className={`absolute -left-3 w-1 rounded-r-full bg-emerald-300 transition-all duration-200 ease-in-out ${active ? 'h-8' : 'h-0 group-hover:h-4'}`}
              />
              <span className={active ? 'ring-2 ring-emerald-300/70 ring-offset-2 ring-offset-teal-950 rounded-xl' : ''}>
                <WorkspaceBadge name={ws.name} color={ws.color} active={active} />
              </span>
            </NavLink>
          );
        })}
        <button
          type="button"
          onClick={onCreate}
          title="Crear o unirse a un espacio"
          aria-label="Crear o unirse a un espacio"
          className="flex size-11 items-center justify-center rounded-2xl border border-dashed border-teal-600 text-teal-300 transition-all duration-200 hover:rounded-xl hover:border-emerald-300 hover:bg-teal-900 hover:text-emerald-200"
        >
          <Plus className="size-5" />
        </button>
      </div>
      {activeWorkspaceId && (
        <NavLink
          to={`/app/w/${activeWorkspaceId}/ajustes`}
          title="Ajustes"
          aria-label="Ajustes"
          className={({ isActive }) =>
            `flex size-11 items-center justify-center rounded-xl transition-colors duration-200 ${isActive ? 'bg-teal-800 text-white' : 'text-teal-300 hover:bg-teal-900 hover:text-white'}`
          }
        >
          <Settings className="size-5" />
        </NavLink>
      )}
      <Link to={activeWorkspaceId ? `/app/w/${activeWorkspaceId}/ajustes` : '/app'} title={user.displayName} className="mt-1">
        <Avatar name={user.displayName} color={user.avatarColor} size="sm" online />
      </Link>
    </nav>
  );
}
