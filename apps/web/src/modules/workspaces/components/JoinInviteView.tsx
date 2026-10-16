import { ArrowRight, Users } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { InviteIllustration } from '@shared/ui/illustrations';
import { Logo } from '@shared/ui/Logo';
import { ErrorState, FullScreenLoader } from '@shared/ui/States';
import { WorkspaceBadge } from '@shared/ui/WorkspaceBadge';
import { pluralize } from '@shared/utils/text';
import { useJoinInvite } from '../hooks/use-join-invite.hook';

export function JoinInviteView() {
  const invite = useJoinInvite();
  if (!invite.preview && !invite.error) return <FullScreenLoader label="Abriendo la invitación…" />;

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-gradient-to-br from-teal-50 via-canvas to-cyan-50 px-4 py-10 dark:from-teal-950 dark:via-canvas dark:to-cyan-950">
      <Logo className="mb-8" />
      <div className="w-full max-w-md animate-rise rounded-2xl bg-surface p-6 text-center shadow-pop ring-1 ring-line sm:p-8">
        {invite.error || !invite.preview ? (
          <>
            <ErrorState message={invite.error ?? 'Invitación no disponible'} />
            <Button variant="secondary" onClick={invite.goHome}>Ir a mis chats</Button>
          </>
        ) : (
          <>
            <div className="mx-auto w-48">
              <InviteIllustration />
            </div>
            <p className="mt-4 text-sm font-medium text-ink-soft">Te invitaron a unirte a</p>
            <div className="mt-3 flex items-center justify-center gap-3">
              <WorkspaceBadge name={invite.preview.name} color={invite.preview.color} />
              <h1 className="text-left text-2xl font-extrabold text-ink">{invite.preview.name}</h1>
            </div>
            {invite.preview.description && <p className="mt-2 text-sm text-ink-soft">{invite.preview.description}</p>}
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-1 text-xs font-semibold text-ink-soft">
              <Users className="size-3.5" /> {pluralize(invite.preview.memberCount, 'miembro', 'miembros')}
            </p>
            <Button size="lg" fullWidth className="mt-6" loading={invite.joining} onClick={invite.join} icon={<ArrowRight className="size-5" />}>
              {invite.preview.alreadyMember ? 'Ya eres miembro · Abrir' : 'Unirme al espacio'}
            </Button>
            <Button variant="ghost" fullWidth className="mt-2" onClick={invite.goHome}>
              Ahora no
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
