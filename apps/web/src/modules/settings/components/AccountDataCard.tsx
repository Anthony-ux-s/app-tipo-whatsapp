import { Download, FileLock2, KeyRound, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@shared/ui/Button';
import { Field, FieldError } from '@shared/ui/Field';
import { Modal } from '@shared/ui/Modal';
import { useAccountData } from '../hooks/use-account-data.hook';

/** "Tus datos": descargar una copia y eliminar la cuenta (Ley 1581 / LGPD). */
export function AccountDataCard() {
  const data = useAccountData();
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-float md:p-6">
      <h2 className="mb-2 flex items-center gap-2 text-base font-bold text-ink">
        <FileLock2 className="size-5 text-brand dark:text-teal-300" /> Tus datos
      </h2>
      <p className="text-sm text-ink-soft">
        Puedes descargar una copia de tus datos o eliminar tu cuenta cuando quieras. Lee la{' '}
        <Link to="/legal/privacidad" className="font-semibold text-brand hover:underline dark:text-teal-300">política de privacidad</Link> y los{' '}
        <Link to="/legal/terminos" className="font-semibold text-brand hover:underline dark:text-teal-300">términos</Link>.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon={<Download className="size-4" />} loading={data.exporting} onClick={data.exportData}>
          Descargar mis datos
        </Button>
        <Button variant="danger" size="sm" icon={<Trash2 className="size-4" />} onClick={data.openDelete}>
          Eliminar mi cuenta
        </Button>
      </div>

      <Modal
        open={data.deleteOpen}
        onClose={data.closeDelete}
        size="sm"
        title="Eliminar tu cuenta"
        description="Esta acción no se puede deshacer."
        footer={
          <>
            <Button variant="ghost" onClick={data.closeDelete}>Cancelar</Button>
            <Button variant="danger" icon={<Trash2 className="size-4" />} loading={data.deleting} onClick={() => data.confirmDelete()}>
              Eliminar definitivamente
            </Button>
          </>
        }
      >
        <form onSubmit={data.confirmDelete} className="flex flex-col gap-4">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
            <li>Se borran tu nombre, usuario, teléfono, contraseña y tus claves de cifrado.</li>
            <li>Sales de todos tus espacios; los espacios donde estabas solo se eliminan.</li>
            <li>Tus mensajes enviados siguen en los chats de los demás, como «Cuenta eliminada».</li>
            <li>Si eres el único administrador de un espacio con más personas, primero nombra a otro.</li>
          </ul>
          <Field
            label="Tu contraseña"
            type="password"
            autoComplete="current-password"
            icon={<KeyRound className="size-5" />}
            value={data.password}
            onChange={(e) => data.onPasswordChange(e.target.value)}
          />
          {data.error && <FieldError message={data.error} />}
        </form>
      </Modal>
    </section>
  );
}
