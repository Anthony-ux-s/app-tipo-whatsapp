import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { UnauthorizedError } from '../../kernel/domain-error';
import { FirebaseTokenVerifier } from './firebase-token.verifier';

const PROJECT = 'parla-demo';
const NOW = Date.parse('2026-10-22T18:00:00Z');
const seconds = Math.floor(NOW / 1000);

const b64 = (value: object | Buffer) => (Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value))).toString('base64url');

describe('verificación del teléfono con Firebase', () => {
  let google: { publicKey: KeyObject; privateKey: KeyObject };
  let stranger: { publicKey: KeyObject; privateKey: KeyObject };
  let verifier: FirebaseTokenVerifier;

  /** Un ID token firmado como lo haría Google (con la clave elegida). */
  const token = (claims: Record<string, unknown> = {}, opts: { key?: KeyObject; kid?: string; alg?: string } = {}) => {
    const header = b64({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'kid-1', typ: 'JWT' });
    const payload = b64({
      iss: `https://securetoken.google.com/${PROJECT}`,
      aud: PROJECT,
      sub: 'uid-123',
      iat: seconds - 30,
      auth_time: seconds - 30,
      exp: seconds + 3600,
      phone_number: '+51930889106',
      firebase: { sign_in_provider: 'phone', identities: { phone: ['+51930889106'] } },
      ...claims,
    });
    const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(opts.key ?? google.privateKey);
    return `${header}.${payload}.${b64(signature)}`;
  };

  beforeAll(() => {
    google = generateKeyPairSync('rsa', { modulusLength: 2048 });
    stranger = generateKeyPairSync('rsa', { modulusLength: 2048 });
    verifier = new FirebaseTokenVerifier(PROJECT, async (kid) => (kid === 'kid-1' ? google.publicKey : null), () => NOW);
  });

  it('acepta un token de teléfono válido y devuelve el número verificado', async () => {
    expect(await verifier.verifyPhoneToken(token())).toEqual({ phone: '+51930889106', uid: 'uid-123' });
  });

  it('rechaza una firma que no es de Google', async () => {
    await expect(verifier.verifyPhoneToken(token({}, { key: stranger.privateKey }))).rejects.toThrow(UnauthorizedError);
  });

  it('rechaza si cambian el número después de firmar (el contenido manda)', async () => {
    const [h, , s] = token().split('.');
    const forged = b64({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: 'uid-123', iat: seconds, auth_time: seconds, exp: seconds + 3600, phone_number: '+51999999999', firebase: { sign_in_provider: 'phone' } });
    await expect(verifier.verifyPhoneToken(`${h}.${forged}.${s}`)).rejects.toThrow(UnauthorizedError);
  });

  it('rechaza un token de otro proyecto de Firebase', async () => {
    await expect(verifier.verifyPhoneToken(token({ aud: 'otro-proyecto', iss: 'https://securetoken.google.com/otro-proyecto' }))).rejects.toThrow(UnauthorizedError);
  });

  it('rechaza un token vencido o con un ingreso viejo', async () => {
    await expect(verifier.verifyPhoneToken(token({ exp: seconds - 10 }))).rejects.toThrow(UnauthorizedError);
    await expect(verifier.verifyPhoneToken(token({ auth_time: seconds - 3600 }))).rejects.toThrow(UnauthorizedError);
  });

  it('solo vale el ingreso por teléfono, con número', async () => {
    await expect(verifier.verifyPhoneToken(token({ firebase: { sign_in_provider: 'password' } }))).rejects.toThrow(UnauthorizedError);
    await expect(verifier.verifyPhoneToken(token({ phone_number: undefined }))).rejects.toThrow(UnauthorizedError);
  });

  it('rechaza algoritmos raros, claves desconocidas y basura', async () => {
    await expect(verifier.verifyPhoneToken(token({}, { alg: 'none' }))).rejects.toThrow(UnauthorizedError);
    await expect(verifier.verifyPhoneToken(token({}, { kid: 'kid-desconocido' }))).rejects.toThrow(UnauthorizedError);
    await expect(verifier.verifyPhoneToken('esto.no.es-un-token')).rejects.toThrow(UnauthorizedError);
    await expect(verifier.verifyPhoneToken('')).rejects.toThrow(UnauthorizedError);
  });
});
