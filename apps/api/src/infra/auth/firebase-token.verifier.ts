import { createVerify, X509Certificate, type KeyObject } from 'node:crypto';
import { UnauthorizedError } from '../../kernel/domain-error';

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
/** El inicio de sesión con Firebase debe ser reciente: el comprobante de registro se pide enseguida. */
const MAX_AUTH_AGE_SECONDS = 10 * 60;
const CLOCK_SKEW_SECONDS = 60;

/** El número que Firebase verificó por SMS (E.164) y la cuenta de Firebase que lo hizo. */
export interface FirebasePhoneIdentity {
  phone: string;
  uid: string;
}

/** La cuenta de Google con la que entró la persona (Google ya comprobó que el correo es suyo). */
export interface FirebaseGoogleIdentity {
  email: string;
  name: string;
  uid: string;
}

/** Entrega la clave pública con la que Google firmó el token (`kid` de su cabecera). */
export type FirebaseKeySource = (kid: string) => Promise<KeyObject | null>;

const b64 = (part: string) => Buffer.from(part, 'base64url');

/** Claves públicas de Google (certificados X.509), guardadas mientras dice su `Cache-Control`. */
export function googleKeySource(fetcher: typeof fetch = fetch): FirebaseKeySource {
  let keys = new Map<string, KeyObject>();
  let expiresAt = 0;
  return async (kid) => {
    if (Date.now() >= expiresAt || !keys.has(kid)) {
      const response = await fetcher(CERTS_URL, { signal: AbortSignal.timeout(6_000) });
      if (!response.ok) throw new Error(`Google respondió ${response.status} al pedir sus claves`);
      const certs = (await response.json()) as Record<string, string>;
      keys = new Map(Object.entries(certs).map(([id, pem]) => [id, new X509Certificate(pem).publicKey]));
      const maxAge = /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1];
      expiresAt = Date.now() + Number(maxAge ?? 3600) * 1000;
    }
    return keys.get(kid) ?? null;
  };
}

/**
 * Comprueba un «ID token» de Firebase Authentication (el que recibe la app después de confirmar el código
 * SMS) y devuelve el número verificado. Valida firma RS256 de Google, proyecto, vencimiento, que el ingreso
 * haya sido por teléfono y que sea reciente. Así el backend sabe que la persona recibió el SMS sin conocer el código.
 */
export class FirebaseTokenVerifier {
  constructor(
    private readonly projectId: string,
    private readonly keys: FirebaseKeySource = googleKeySource(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  async verifyPhoneToken(idToken: string): Promise<FirebasePhoneIdentity> {
    const { claims, provider } = await this.verifySigned(idToken, 'No pudimos verificar tu número. Vuelve a pedir el código.');
    if (provider !== 'phone' || typeof claims.phone_number !== 'string' || !claims.phone_number.startsWith('+')) {
      throw new UnauthorizedError('No pudimos verificar tu número. Vuelve a pedir el código.');
    }
    return { phone: claims.phone_number, uid: claims.sub as string };
  }

  /** Igual, para «Continuar con Google»: exige el proveedor google.com y un correo que Google ya verificó. */
  async verifyGoogleToken(idToken: string): Promise<FirebaseGoogleIdentity> {
    const message = 'No pudimos verificar tu cuenta de Google. Inténtalo de nuevo.';
    const { claims, provider } = await this.verifySigned(idToken, message);
    if (provider !== 'google.com' || claims.email_verified !== true || typeof claims.email !== 'string' || !claims.email.includes('@')) {
      throw new UnauthorizedError(message);
    }
    return { email: claims.email.toLowerCase(), name: typeof claims.name === 'string' ? claims.name : '', uid: claims.sub as string };
  }

  /** Firma RS256 de Google, proyecto, vencimiento y que el ingreso sea reciente. Devuelve los datos del token. */
  private async verifySigned(idToken: string, message: string): Promise<{ claims: Record<string, unknown>; provider: string | undefined }> {
    const invalid = () => new UnauthorizedError(message);
    const parts = idToken.split('.');
    if (parts.length !== 3) throw invalid();
    let header: { alg?: string; kid?: string };
    let claims: Record<string, unknown>;
    try {
      header = JSON.parse(b64(parts[0]).toString('utf8'));
      claims = JSON.parse(b64(parts[1]).toString('utf8'));
    } catch {
      throw invalid();
    }
    if (header.alg !== 'RS256' || !header.kid) throw invalid();

    const key = await this.keys(header.kid).catch(() => null);
    if (!key) throw invalid();
    const signed = createVerify('RSA-SHA256').update(`${parts[0]}.${parts[1]}`).verify(key, b64(parts[2]));
    if (!signed) throw invalid();

    const seconds = Math.floor(this.now() / 1000);
    const firebase = (claims.firebase ?? {}) as { sign_in_provider?: string };
    const authTime = Number(claims.auth_time);
    const valid =
      claims.aud === this.projectId &&
      claims.iss === `https://securetoken.google.com/${this.projectId}` &&
      typeof claims.sub === 'string' &&
      claims.sub.length > 0 &&
      Number(claims.exp) > seconds &&
      Number(claims.iat) <= seconds + CLOCK_SKEW_SECONDS &&
      Number.isFinite(authTime) &&
      authTime <= seconds + CLOCK_SKEW_SECONDS &&
      seconds - authTime <= MAX_AUTH_AGE_SECONDS;
    if (!valid) throw invalid();
    return { claims, provider: firebase.sign_in_provider };
  }
}
