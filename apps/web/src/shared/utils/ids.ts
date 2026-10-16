/** Id generado en el cliente para cada mensaje: hace idempotente el reenvío. */
export function newClientId(): string {
  return globalThis.crypto.randomUUID();
}

/** Clave del título descifrado de una tarea dentro de los textos descifrados. */
export const taskTextKey = (taskId: string) => `task:${taskId}`;
