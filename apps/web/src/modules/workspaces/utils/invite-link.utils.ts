/** Enlace público de invitación a partir del código. */
export function inviteLink(code: string, origin: string = window.location.origin): string {
  return `${origin}/invitacion/${code}`;
}

/** Acepta el código suelto o el enlace completo pegado por el usuario. */
export function parseInviteCode(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const match = value.match(/invitacion\/([A-Za-z0-9]+)/);
  const code = match ? match[1] : value;
  return /^[A-Za-z0-9]{6,32}$/.test(code) ? code : null;
}
