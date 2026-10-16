import { ArrowLeft, Scale } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@shared/ui/Button';
import { Logo } from '@shared/ui/Logo';
import { useLegalDocument } from '../hooks/use-legal-document.hook';
import type { LegalDocument } from '../types/legal.types';

/** Página pública de un documento legal (términos o privacidad). */
export function LegalView({ slug }: { slug: LegalDocument['slug'] }) {
  const legal = useLegalDocument(slug);
  return (
    <div className="min-h-full bg-canvas">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />} onClick={legal.back}>
            {legal.backLabel}
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <p className="flex items-center gap-2 text-sm font-semibold text-brand dark:text-teal-300">
          <Scale className="size-4" /> Legal · versión {legal.version}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold text-ink md:text-4xl">{legal.document.title}</h1>
        <p className="mt-2 text-sm text-ink-faint">Última actualización: {legal.updated}</p>
        <p className="mt-6 text-[17px] leading-relaxed text-ink">{legal.document.intro}</p>
        {legal.document.sections.map((section) => (
          <section key={section.heading} className="mt-8">
            <h2 className="text-xl font-bold text-ink">{section.heading}</h2>
            {section.paragraphs.map((p) => (
              <p key={p.slice(0, 40)} className="mt-3 leading-relaxed text-ink-soft">
                {p}
              </p>
            ))}
          </section>
        ))}
        <div className="mt-12 rounded-2xl bg-surface p-5 text-sm text-ink-soft shadow-float">
          Consulta también: {' '}
          <Link to={legal.other.to} className="font-semibold text-brand hover:underline dark:text-teal-300">
            {legal.other.label}
          </Link>
        </div>
      </main>
    </div>
  );
}
