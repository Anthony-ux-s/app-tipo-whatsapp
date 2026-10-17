import { Download, KeyRound, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@shared/ui/Button';
import { Field, FieldError } from '@shared/ui/Field';
import { Modal } from '@shared/ui/Modal';
import { useAccountData } from '../../hooks/use-account-data.hook';
import { SettingsBlock, SettingsGroup } from '../SettingsUi';

/** Derechos sobre los datos: descargar una copia y eliminar la cuenta (Ley 1581 / LGPD). */
export function AccountDataSection() {
  const data = useAccountData();
  return (
    <>
      <SettingsGroup title="Copia de tus datos">
        <SettingsBlock>
          <p className="text-sm text-ink-soft">
            Un archivo JSON con tu perfil, tus preferencias, los chats en los que participas y un resumen de tu actividad (mensajes y pedidos).
          </p>
          <Button className="mt-4" variant="secondary" size="sm" icon={<Download className="size-4" />} loading={data.exporting} onClick={data.exportData}>
            Descargar mis datos
          </Button>
        </SettingsBlock>
      </SettingsGroup>

      <SettingsGroup
        title="Eliminar la cuenta"
        footer={
          <>
            Más detalles en la{' '}
            <Link to="/legal/privacidad" className="font-semibold text-brand hover:underline dark:text-teal-300">política de privacidad</Link>.
          </>
        }
      >
        <SettingsBlock>
          <p className="text-sm text-ink-soft">Borra tu nombre, usuario, teléfono, contraseña y claves, y te saca de tus chats. No se puede deshacer.</p>
          <Button className="mt-4" variant="danger" size="sm" icon={<Trash2 className="size-4" />} onClick={data.openDelete}>
            Eliminar mi cuenta
          </Button>
        </SettingsBlock>
      </SettingsGroup>

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
            <li>Sales de todos tus chats y grupos.</li>
            <li>Tus mensajes enviados siguen en los chats de los demás, como «Cuenta eliminada».</li>
            <li>Tu historial de pedidos se borra junto con la cuenta.</li>
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
    </>
  );
}
