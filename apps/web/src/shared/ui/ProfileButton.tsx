import { Menu } from 'lucide-react';
import { useMenuStore } from '@shared/stores/menu.store';

/** Las tres líneas del encabezado: abren el menú con las secciones, los pedidos y los ajustes. */
export function ProfileButton() {
  const openMenu = useMenuStore((s) => s.openMenu);
  return (
    <button
      type="button"
      onClick={openMenu}
      aria-label="Abrir menú"
      title="Menú"
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink transition-colors duration-200 hover:bg-surface-3"
    >
      <Menu className="size-5" />
    </button>
  );
}
