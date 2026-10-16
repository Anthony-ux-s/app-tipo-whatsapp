import { Logo } from '@shared/ui/Logo';
import { TeamIllustration } from '@shared/ui/illustrations';
import { useSessionStore } from '@shared/stores/session.store';
import { firstName } from '@shared/utils/text';
import { WorkspaceForm } from './WorkspaceForm';

/** Primera vez: aún no perteneces a ningún espacio. */
export function OnboardingView() {
  const name = useSessionStore((s) => (s.user ? firstName(s.user.displayName) : ''));
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto bg-canvas px-4 py-8 sm:px-6">
      <div className="grid w-full max-w-4xl animate-rise items-center gap-8 md:grid-cols-2 md:gap-12">
        <div className="text-center md:text-left">
          <div className="mb-6 flex justify-center md:hidden">
            <Logo />
          </div>
          <div className="mx-auto w-64 md:mx-0 md:w-80">
            <TeamIllustration />
          </div>
          <h1 className="mt-6 text-2xl font-extrabold text-ink md:text-3xl">¡Bienvenido a Parla, {name}!</h1>
          <p className="mt-2 text-[15px] text-ink-soft">
            Crea el espacio de tu equipo e invita a tus compañeros con un enlace, o únete al espacio al que te invitaron.
          </p>
        </div>
        <div className="rounded-2xl bg-surface p-5 shadow-float ring-1 ring-line sm:p-7">
          <WorkspaceForm />
        </div>
      </div>
    </div>
  );
}
