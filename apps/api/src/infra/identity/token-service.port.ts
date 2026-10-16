export interface TokenService {
  issue(userId: string): Promise<string>;
  /** Devuelve el id del usuario o null si el token no es válido o expiró. */
  verify(token: string): Promise<string | null>;
}

export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');
