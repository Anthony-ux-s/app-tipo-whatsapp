import { Link } from 'react-router';
import { NoResultsIllustration } from '@shared/ui/illustrations';
import { EmptyState } from '@shared/ui/States';

export function NotFoundView() {
  return (
    <div className="flex min-h-full items-center justify-center bg-canvas">
      <EmptyState
        illustration={<NoResultsIllustration />}
        title="Esta página no existe"
        description="Puede que el enlace esté mal escrito o que ya no esté disponible."
        action={
          <Link to="/app" className="inline-flex h-11 items-center rounded-[var(--radius-card)] bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong">
            Volver a mis chats
          </Link>
        }
      />
    </div>
  );
}
