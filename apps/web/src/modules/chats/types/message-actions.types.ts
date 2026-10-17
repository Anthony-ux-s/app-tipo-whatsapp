import type { Task } from '@parla/types';
import type { ChatMessage } from '@shared/types/chat.types';
import type { TaskView } from '../../tasks/utils/task-view.utils';

/** Acciones que la conversación ofrece sobre cada mensaje (las implementa el hook). */
export interface MessageActions {
  menuFor: string | null;
  toggleMenu: (clientId: string) => void;
  reply: (message: ChatMessage) => void;
  openThread: (rootId: string) => void;
  createTaskFrom: (message: ChatMessage) => void;
  copyText: (message: ChatMessage) => void;
  openImage: (url: string, message: ChatMessage) => void;
  /** Guarda en el dispositivo la foto, el video o el audio ya descifrado. */
  download: (message: ChatMessage) => void;
  retry: (clientId: string) => void;
  toggleTask: (task: Task) => void;
  openTasks: () => void;
  /** Vista lista para pintar la tarea de una tarjeta. */
  taskView: (task: Task) => TaskView;
  /** Nombre y color de un participante (o "Ex miembro"). */
  person: (userId: string) => { name: string; color: string };
}
