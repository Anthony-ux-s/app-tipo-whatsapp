import type { TaskScopeTab } from '../types/tasks.types';

export const TASK_SCOPES: TaskScopeTab[] = [
  { id: 'assigned', label: 'Asignadas a mí', empty: 'No tienes tareas pendientes. ¡Buen trabajo!' },
  { id: 'created', label: 'Creadas por mí', empty: 'Aún no has creado tareas abiertas.' },
  { id: 'done', label: 'Hechas', empty: 'Cuando completes tareas, aparecerán aquí.' },
];

export const MAX_TASK_TITLE = 200;
