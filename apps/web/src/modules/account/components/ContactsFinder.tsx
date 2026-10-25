import { BookUser, MessageCircle, Search, ShieldCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import { Avatar } from "@shared/ui/Avatar";
import { Button } from "@shared/ui/Button";
import { useContactsFinder } from "../hooks/use-contacts-finder.hook";

/** Busca en Parla a los contactos del teléfono (o a números escritos a mano) y abre un chat con ellos. */
export function ContactsFinder({
  onOpenChat,
  autoStart = false,
}: {
  onOpenChat?: () => void;
  autoStart?: boolean;
}) {
  const c = useContactsFinder(onOpenChat);
  // Al abrir «Contactos» se abre solo el selector del teléfono (el toque en la pestaña es el permiso del navegador).
  const started = useRef(false);
  useEffect(() => {
    if (autoStart && c.phoneBookSupported && !started.current) {
      started.current = true;
      void c.fromPhoneBook();
    }
  }, [autoStart, c]);
  return (
    <div className="flex flex-col gap-4">
      {c.phoneBookSupported ? (
        <Button
          size="lg"
          fullWidth
          loading={c.busy}
          icon={<BookUser className="size-5" />}
          onClick={() => void c.fromPhoneBook()}
        >
          Ver todos mis contactos
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-soft">
            Este navegador no deja leer la libreta del teléfono (solo Chrome en
            Android lo permite). Escribe o pega los números de tus contactos:
          </p>
          <textarea
            aria-label="Números de tus contactos"
            value={c.manual}
            onChange={(e) => c.onManualChange(e.target.value)}
            rows={3}
            placeholder={"+57 300 555 0101\n987 654 321"}
            className="w-full resize-none rounded-[var(--radius-card)] border border-line bg-surface p-3 text-[15px] text-ink outline-none placeholder:text-ink-faint/60 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
          />
          <Button
            variant="secondary"
            loading={c.busy}
            disabled={!c.manual.trim()}
            icon={<Search className="size-4" />}
            onClick={c.fromManual}
          >
            Buscar en Parla
          </Button>
        </div>
      )}

      <p className="flex items-start gap-2 text-xs text-ink-faint">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        Solo enviamos los números para ver quiénes ya usan Parla. No los
        guardamos.
      </p>

      {c.found && (
        <div className="flex flex-col gap-3" data-testid="contacts-found">
          <p className="text-sm font-semibold text-ink">
            {c.found.length === 0
              ? "Ninguno de esos contactos usa Parla todavía."
              : `${c.found.length} de ${c.checked} contactos ${c.found.length === 1 ? "está" : "están"} en Parla`}
          </p>
          {c.found.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {c.found.map(({ user, contactName }) => (
                <li
                  key={user.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <Avatar
                    name={user.displayName}
                    color={user.avatarColor}
                    photo={user.avatarUrl}
                    size="sm"
                    online={user.presence === "online"}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink">
                      {contactName ?? user.displayName}
                    </span>
                    <span className="block truncate text-xs text-ink-soft">
                      {contactName && contactName !== user.displayName
                        ? `En Parla: ${user.displayName}`
                        : user.about ||
                          (user.username ? `@${user.username}` : "")}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={c.opening === user.id}
                    icon={<MessageCircle className="size-4" />}
                    onClick={() => void c.openChat(user)}
                  >
                    Escribir
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
