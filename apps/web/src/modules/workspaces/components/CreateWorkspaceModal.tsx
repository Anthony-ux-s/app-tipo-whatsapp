import { Modal } from '@shared/ui/Modal';
import { WorkspaceForm } from './WorkspaceForm';

export function CreateWorkspaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Nuevo espacio de trabajo" description="Separa cada equipo o proyecto en su propio espacio." size="sm">
      <WorkspaceForm onDone={onClose} />
    </Modal>
  );
}
