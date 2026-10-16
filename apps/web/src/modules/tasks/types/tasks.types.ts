import type { TaskScope } from '@parla/types';

/** Datos con los que se abre el formulario de tarea (p. ej. desde un mensaje). */
export interface TaskPrefill {
  title: string;
  sourceMessageId: string | null;
}

export interface TaskScopeTab {
  id: TaskScope;
  label: string;
  empty: string;
}
