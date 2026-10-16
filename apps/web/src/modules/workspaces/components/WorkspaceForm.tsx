import { Building2, Link2 } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { Field, FieldError } from '@shared/ui/Field';
import { WorkspaceBadge } from '@shared/ui/WorkspaceBadge';
import { WORKSPACE_COLORS } from '../const/workspaces.const';
import { useWorkspaceForm } from '../hooks/use-workspace-form.hook';

/** Formulario compartido por la bienvenida y el modal: crear o unirse a un espacio. */
export function WorkspaceForm({ onDone }: { onDone?: () => void }) {
  const form = useWorkspaceForm(onDone);
  return (
    <form onSubmit={form.submit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-card)] bg-surface-3 p-1">
        {(['create', 'join'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => form.selectTab(tab)}
            className={`flex h-9 items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition-all duration-200 ${form.tab === tab ? 'bg-surface text-ink shadow-float' : 'text-ink-soft'}`}
          >
            {tab === 'create' ? <Building2 className="size-4" /> : <Link2 className="size-4" />}
            {tab === 'create' ? 'Crear espacio' : 'Tengo una invitación'}
          </button>
        ))}
      </div>

      {form.tab === 'create' ? (
        <>
          <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
            <WorkspaceBadge name={form.name || 'Mi equipo'} color={form.color} />
            <div className="min-w-0">
              <p className="truncate font-display font-bold text-ink">{form.name || 'Mi equipo'}</p>
              <p className="text-xs text-ink-soft">Serás el administrador</p>
            </div>
          </div>
          <Field label="Nombre del espacio" placeholder="ej. Panadería La Espiga" maxLength={60} value={form.name} onChange={(e) => form.onNameChange(e.target.value)} />
          <Field
            label="Descripción (opcional)"
            placeholder="¿A qué se dedica el equipo?"
            maxLength={200}
            value={form.description}
            onChange={(e) => form.onDescriptionChange(e.target.value)}
          />
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Color</p>
            <div className="flex gap-2">
              {WORKSPACE_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => form.selectColor(c.id)}
                  aria-label={c.label}
                  aria-pressed={form.color === c.id}
                  className={`size-9 rounded-full bg-gradient-to-br transition-transform duration-200 ${c.swatch} ${form.color === c.id ? 'scale-110 ring-2 ring-teal-500 ring-offset-2 ring-offset-surface' : ''}`}
                />
              ))}
            </div>
          </div>
        </>
      ) : (
        <Field
          label="Enlace o código de invitación"
          placeholder="https://…/invitacion/andino2026"
          autoCapitalize="none"
          icon={<Link2 className="size-5" />}
          value={form.invite}
          hint="Pídeselo al administrador de tu equipo."
          onChange={(e) => form.onInviteChange(e.target.value)}
        />
      )}

      {form.error && <FieldError message={form.error} />}
      <Button type="submit" size="lg" fullWidth loading={form.loading}>
        {form.tab === 'create' ? 'Crear espacio' : 'Ver invitación'}
      </Button>
    </form>
  );
}
