import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import type { ReactNode } from 'react';
import { Logo } from '@shared/ui/Logo';
import { WelcomeIllustration } from '@shared/ui/illustrations';
import { AUTH_HIGHLIGHTS } from '../const/auth.const';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-teal-700 via-teal-800 to-cyan-900 p-10 text-white lg:flex lg:w-[46%] lg:flex-col xl:p-14">
        <div className="absolute -top-24 -right-24 size-80 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 size-96 rounded-full bg-cyan-400/20 blur-3xl" />
        <Logo tone="light" className="relative" />
        <div className="relative mx-auto my-auto w-full max-w-md py-10">
          <WelcomeIllustration />
          <h2 className="mt-8 text-3xl leading-tight font-extrabold xl:text-4xl">Tu gente y tus compras, en una sola app.</h2>
          <ul className="mt-6 flex flex-col gap-4">
            {AUTH_HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-300" />
                <span>
                  <span className="block font-semibold">{item.title}</span>
                  <span className="text-sm text-teal-100/80">{item.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-teal-100/60">
          © 2026 Parla · Hecho en Latinoamérica ·{' '}
          <Link to="/legal/terminos" className="underline hover:text-white">Términos</Link> ·{' '}
          <Link to="/legal/privacidad" className="underline hover:text-white">Privacidad</Link>
        </p>
      </aside>

      <main className="flex flex-1 flex-col items-center justify-center bg-canvas px-4 py-8 sm:px-8 md:py-12">
        <div className="w-full max-w-[420px] animate-rise">
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo />
          </div>
          <div className="rounded-2xl bg-surface p-6 shadow-float ring-1 ring-line sm:p-8">
            <h1 className="text-2xl font-extrabold text-ink md:text-[28px]">{title}</h1>
            <p className="mt-1.5 text-sm text-ink-soft md:text-[15px]">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </div>
          <p className="mt-4 text-center text-xs text-ink-faint">
            <Link to="/legal/terminos" className="hover:underline">Términos</Link> ·{' '}
            <Link to="/legal/privacidad" className="hover:underline">Privacidad</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
