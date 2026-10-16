import type { AccountExport } from '@parla/types';
import { useState, type FormEvent } from 'react';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage, http } from '@shared/utils/http';

/** Derechos sobre los datos: descargar una copia y eliminar la cuenta. */
export function useAccountData() {
  const deleteAccount = useSessionStore((s) => s.deleteAccount);
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return {
    exporting,
    deleteOpen,
    password,
    deleting,
    error,
    exportData: async () => {
      setExporting(true);
      try {
        const data = await http.get<AccountExport>('/auth/me/export');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `parla-mis-datos-${data.exportedAt.slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        toast('Descargamos una copia de tus datos', 'success');
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setExporting(false);
      }
    },
    openDelete: () => {
      setPassword('');
      setError(null);
      setDeleteOpen(true);
    },
    closeDelete: () => setDeleteOpen(false),
    onPasswordChange: (value: string) => setPassword(value),
    confirmDelete: async (event?: FormEvent) => {
      event?.preventDefault();
      if (!password) {
        setError('Escribe tu contraseña para confirmar');
        return;
      }
      setDeleting(true);
      setError(null);
      try {
        await deleteAccount(password);
        toast('Tu cuenta fue eliminada', 'info');
      } catch (err) {
        setError(errorMessage(err));
        setDeleting(false);
      }
    },
  };
}
