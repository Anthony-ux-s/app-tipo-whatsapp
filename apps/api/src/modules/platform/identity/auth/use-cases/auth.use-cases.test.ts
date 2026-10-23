import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, UnauthorizedError, ValidationError } from '../../../../../kernel/domain-error';
import { PresenceRegistry } from '../../../../../infra/realtime/presence.registry';
import {
  fakeHasher,
  fakeTokens,
  InMemoryAuthRepository,
  InMemoryVerificationCodes,
  makeUser,
  RecordingRealtime,
  RecordingVerificationSender,
  testEnv,
} from '../../../../../testing/in-memory.fakes';
import { CodeVerifier } from '../../verification/code-verifier';
import { StartEmailVerificationUseCase, VerifyEmailUseCase } from './email.use-case';
import { LoginUseCase } from './login.use-case';
import { MatchContactsUseCase } from './match-contacts.use-case';
import type { FirebaseTokenVerifier } from '../../../../../infra/auth/firebase-token.verifier';
import { StartEmailRegistrationUseCase, StartPhoneVerificationUseCase, VerifyEmailRegistrationUseCase, VerifyFirebasePhoneUseCase, VerifyPhoneUseCase } from './phone-verification.use-case';
import { RegisterUserUseCase } from './register-user.use-case';
import { ProfileEvents, UpdateProfileUseCase } from './update-profile.use-case';
import { UploadAvatarUseCase } from './avatar.use-case';

describe('registro con el correo verificado (Brevo)', () => {
  let users: InMemoryAuthRepository;
  let sender: RecordingVerificationSender;
  let verifier: CodeVerifier;
  let start: StartEmailRegistrationUseCase;
  let verify: VerifyEmailRegistrationUseCase;
  let register: RegisterUserUseCase;
  let login: LoginUseCase;

  const verifiedEmail = async (email: string) => {
    await start.execute(email);
    return (await verify.execute(email, sender.lastEmailCode())).verificationToken;
  };

  beforeEach(() => {
    users = new InMemoryAuthRepository();
    sender = new RecordingVerificationSender('brevo');
    verifier = new CodeVerifier(new InMemoryVerificationCodes(), sender, testEnv);
    start = new StartEmailRegistrationUseCase(users, verifier);
    verify = new VerifyEmailRegistrationUseCase(verifier);
    register = new RegisterUserUseCase(users, fakeHasher, fakeTokens, verifier);
    login = new LoginUseCase(users, fakeHasher, fakeTokens);
  });

  it('el código llega al correo con la plantilla, y con él se crea la cuenta (usuario sugerido)', async () => {
    const started = await start.execute(' Rosa.Perez@Correo.com ');
    expect(started.sentTo).toBe('r***z@correo.com');
    expect(sender.emails.at(-1)).toMatchObject({ to: 'rosa.perez@correo.com' });
    expect(sender.emails.at(-1)!.html).toContain('Estás creando tu cuenta');
    const token = (await verify.execute('rosa.perez@correo.com', sender.lastEmailCode())).verificationToken;
    const session = await register.execute({ verificationToken: token, displayName: 'Rosa Pérez', password: 'Clave2026x', ...keys });
    expect(session.user).toMatchObject({ username: 'rosa.perez', phone: null });
    // La bienvenida sale después del registro.
    expect(sender.emails.at(-1)!.subject).toBe('¡Bienvenido a Parla, Rosa!');
  });

  it('después se entra con el correo (o con el usuario) y la contraseña', async () => {
    const token = await verifiedEmail('rosa@correo.com');
    await register.execute({ verificationToken: token, displayName: 'Rosa', password: 'Clave2026x', ...keys });
    expect((await login.execute({ identifier: 'ROSA@correo.com', password: 'Clave2026x' })).user.displayName).toBe('Rosa');
    expect((await login.execute({ identifier: 'rosa', password: 'Clave2026x' })).user.displayName).toBe('Rosa');
    await expect(login.execute({ identifier: 'rosa@correo.com', password: 'Otra2026x' })).rejects.toThrow(UnauthorizedError);
  });

  it('si el usuario sugerido ya existe, recibe otro; y un correo no se registra dos veces', async () => {
    await register.execute({ verificationToken: await verifiedEmail('rosa@correo.com'), displayName: 'Rosa', password: 'Clave2026x', ...keys });
    const second = await register.execute({ verificationToken: await verifiedEmail('rosa@otro.com'), displayName: 'Rosa 2', password: 'Clave2026x', ...keys });
    expect(second.user.username).toMatch(/^rosa\d{4}$/);
    await expect(start.execute('rosa@correo.com')).rejects.toThrow(ConflictError);
  });

  it('rechaza correos mal escritos, códigos equivocados y comprobantes repetidos', async () => {
    await expect(start.execute('esto-no-es-un-correo')).rejects.toThrow(ValidationError);
    await start.execute('rosa@correo.com');
    await expect(verify.execute('rosa@correo.com', '000000')).rejects.toThrow();
    const token = await verifiedEmail('luis@correo.com');
    await register.execute({ verificationToken: token, displayName: 'Luis', password: 'Clave2026x', ...keys });
    await expect(register.execute({ verificationToken: token, displayName: 'Otro', password: 'Clave2026x', ...keys })).rejects.toThrow(UnauthorizedError);
  });
});

describe('registro con el teléfono verificado por Firebase', () => {
  const users = new InMemoryAuthRepository();
  const codes = new InMemoryVerificationCodes();
  const verifier = new CodeVerifier(codes, new RecordingVerificationSender(), testEnv);
  const firebase = { verifyPhoneToken: async (t: string) => (t === 'bueno' ? { phone: '+51 930 889 106', uid: 'u1' } : Promise.reject(new UnauthorizedError('No pudimos verificar tu número.'))) } as unknown as FirebaseTokenVerifier;
  const register = new RegisterUserUseCase(users, fakeHasher, fakeTokens, verifier);

  it('el token de Firebase entrega un comprobante y con él se crea la cuenta (una sola vez)', async () => {
    const { verificationToken } = await new VerifyFirebasePhoneUseCase(users, verifier, firebase).execute('bueno');
    const session = await register.execute({ verificationToken, displayName: 'Rosa', password: 'Clave2026x', ...keys });
    expect(session.user.phone).toBe('+51930889106');
    await expect(register.execute({ verificationToken, displayName: 'Otra', password: 'Clave2026x', ...keys })).rejects.toThrow(UnauthorizedError);
  });

  it('un token inválido no entrega comprobante, y sin Firebase configurado se rechaza', async () => {
    await expect(new VerifyFirebasePhoneUseCase(users, verifier, firebase).execute('malo')).rejects.toThrow(UnauthorizedError);
    await expect(new VerifyFirebasePhoneUseCase(users, verifier, null).execute('bueno')).rejects.toThrow(/Firebase/);
  });

  it('si el número ya tiene cuenta, pide iniciar sesión', async () => {
    await expect(new VerifyFirebasePhoneUseCase(users, verifier, firebase).execute('bueno')).rejects.toThrow(ConflictError);
  });
});

const keys = { publicKey: '{"kty":"EC"}', keyBackup: { ciphertext: 'c', iv: 'i', salt: 's', iterations: 1000 }, acceptTerms: true };

describe('registro con el teléfono verificado por SMS', () => {
  let users: InMemoryAuthRepository;
  let codes: InMemoryVerificationCodes;
  let sender: RecordingVerificationSender;
  let verifier: CodeVerifier;
  let start: StartPhoneVerificationUseCase;
  let verify: VerifyPhoneUseCase;
  let register: RegisterUserUseCase;
  let login: LoginUseCase;

  /** Pide el código, lo lee del SMS «enviado» y devuelve el comprobante. */
  const verifiedPhone = async (phone: string) => {
    await start.execute(phone);
    return (await verify.execute(phone, sender.lastSmsCode())).verificationToken;
  };

  beforeEach(() => {
    users = new InMemoryAuthRepository();
    codes = new InMemoryVerificationCodes();
    sender = new RecordingVerificationSender();
    verifier = new CodeVerifier(codes, sender, testEnv);
    start = new StartPhoneVerificationUseCase(users, verifier);
    verify = new VerifyPhoneUseCase(verifier);
    register = new RegisterUserUseCase(users, fakeHasher, fakeTokens, verifier);
    login = new LoginUseCase(users, fakeHasher, fakeTokens);
  });

  it('envía un código de 6 cifras por SMS (con la línea para que Android lo lea solo) y no guarda el código en claro', async () => {
    const started = await start.execute('+57 310 555 1234');
    expect(started).toMatchObject({ sentTo: '+57 *** *** 1234', expiresInSeconds: 600, resendInSeconds: 60 });
    expect(started).not.toHaveProperty('devCode'); // con OneSignal nunca vuelve el código
    const code = sender.lastSmsCode();
    expect(sender.sms[0]).toMatchObject({ phone: '+573105551234' });
    expect(sender.sms[0].text).toContain(`@localhost:3100 #${code}`);
    expect(codes.rows[0].codeHash).not.toContain(code);
  });

  it('en modo de prueba (sin OneSignal) devuelve el código para poder probar', async () => {
    const dev = new StartPhoneVerificationUseCase(users, new CodeVerifier(codes, new RecordingVerificationSender('dev'), testEnv));
    expect((await dev.execute('+573105551234')).devCode).toMatch(/^\d{6}$/);
    const prod = new StartPhoneVerificationUseCase(users, new CodeVerifier(codes, new RecordingVerificationSender('dev'), { ...testEnv, production: true }));
    codes.age(120_000);
    expect(await prod.execute('+573105551234')).not.toHaveProperty('devCode');
  });

  it('frena los reenvíos: uno por minuto y cinco por hora', async () => {
    await start.execute('+573105551234');
    await expect(start.execute('+573105551234')).rejects.toThrow(/Espera \d+ s/);
    for (let i = 0; i < 4; i++) {
      codes.age(61_000);
      await start.execute('+573105551234');
    }
    codes.age(61_000);
    await expect(start.execute('+573105551234')).rejects.toThrow('Pediste demasiados códigos');
  });

  it('código equivocado: cuenta los intentos y a los 5 hay que pedir otro; también vence', async () => {
    await start.execute('+573105551234');
    await expect(verify.execute('+573105551234', '000000')).rejects.toThrow('Te quedan 4 intentos');
    for (let i = 0; i < 4; i++) await verify.execute('+573105551234', '000000').catch(() => undefined);
    await expect(verify.execute('+573105551234', sender.lastSmsCode())).rejects.toThrow('Demasiados intentos');
    codes.age(61_000);
    await start.execute('+573105551234');
    codes.age(11 * 60_000);
    await expect(verify.execute('+573105551234', sender.lastSmsCode())).rejects.toThrow('El código venció');
  });

  it('crea la cuenta con el teléfono verificado; el usuario es opcional y el comprobante sirve una sola vez', async () => {
    const proof = await verifiedPhone('+57 310 555 1234');
    const res = await register.execute({ verificationToken: proof, displayName: ' María López ', password: 'Clave2026', ...keys });
    expect(res.user).toMatchObject({ phone: '+573105551234', username: null, displayName: 'María López', email: null, avatarUrl: null });
    expect(users.users[0].phoneVerifiedAt).toBeInstanceOf(Date);
    expect(res.user).not.toHaveProperty('passwordHash');
    await expect(register.execute({ verificationToken: proof, displayName: 'Otra', password: 'Clave2026', ...keys })).rejects.toThrow(UnauthorizedError);
    await expect(register.execute({ verificationToken: 'inventado', displayName: 'Otra', password: 'Clave2026', ...keys })).rejects.toThrow('La verificación venció');
  });

  it('un número con cuenta no recibe código de registro; los usuarios no se repiten', async () => {
    const proof = await verifiedPhone('+573001112233');
    await register.execute({ verificationToken: proof, username: '@Ana', displayName: 'Ana', password: 'Clave2026', ...keys });
    await expect(start.execute('+57 300 111 2233')).rejects.toThrow('Ese número ya tiene una cuenta');
    const other = await verifiedPhone('+573009998877');
    await expect(register.execute({ verificationToken: other, username: 'ana', displayName: 'Otra', password: 'Clave2026', ...keys })).rejects.toThrow(ConflictError);
    await expect(register.execute({ verificationToken: other, username: 'A', displayName: 'Otra', password: 'Clave2026', ...keys })).rejects.toThrow(ValidationError);
    await expect(register.execute({ verificationToken: other, displayName: 'Otra', password: 'corta', ...keys })).rejects.toThrow(ValidationError);
  });

  it('inicia sesión con teléfono o usuario; contraseña equivocada y cuenta inexistente dan el mismo mensaje', async () => {
    const { user } = await register.execute({ verificationToken: await verifiedPhone('+573001112233'), username: 'ana', displayName: 'Ana', password: 'Clave2026', ...keys });
    await expect(login.execute({ identifier: 'ANA', password: 'Clave2026' })).resolves.toMatchObject({ user: { id: user.id } });
    await expect(login.execute({ identifier: '+57 300 111 2233', password: 'Clave2026' })).resolves.toMatchObject({ user: { id: user.id } });
    await expect(login.execute({ identifier: 'ana', password: 'Otra2026' })).rejects.toThrow('Usuario, correo, teléfono o contraseña incorrectos');
    await expect(login.execute({ identifier: 'nadie', password: 'Clave2026' })).rejects.toThrow('Usuario, correo, teléfono o contraseña incorrectos');
  });
});

describe('perfil: usuario, correo de recuperación, foto y contactos', () => {
  let users: InMemoryAuthRepository;
  let sender: RecordingVerificationSender;
  let verifier: CodeVerifier;
  let realtime: RecordingRealtime;
  let events: ProfileEvents;
  const ana = makeUser({ phone: '+573001112233', displayName: 'Ana' });
  const beto = makeUser({ phone: '+573005550101', displayName: 'Beto', username: 'beto' });
  const carla = makeUser({ phone: '+51987654321', displayName: 'Carla' });

  beforeEach(() => {
    users = new InMemoryAuthRepository();
    users.users.push({ ...ana }, { ...beto }, { ...carla });
    sender = new RecordingVerificationSender();
    verifier = new CodeVerifier(new InMemoryVerificationCodes(), sender, testEnv);
    realtime = new RecordingRealtime();
    events = new ProfileEvents(users, realtime, new PresenceRegistry());
  });

  it('el usuario se elige o cambia después: único, válido, y vacío lo quita; los contactos se enteran', async () => {
    users.contacts.set(ana.id, [beto.id]);
    const update = new UpdateProfileUseCase(users, events);
    expect((await update.execute(ana.id, { username: '@Ana.R' })).username).toBe('ana.r');
    expect(realtime.events('profile:updated')[0]).toMatchObject({ userIds: [beto.id, ana.id], payload: { username: 'ana.r' } });
    await expect(update.execute(ana.id, { username: 'beto' })).rejects.toThrow('Ese nombre de usuario ya está en uso');
    await expect(update.execute(ana.id, { username: 'x' })).rejects.toThrow(ValidationError);
    expect((await update.execute(ana.id, { username: '' })).username).toBeNull();
  });

  it('el correo queda en la cuenta solo después de escribir el código que llegó a ese correo', async () => {
    const start = new StartEmailVerificationUseCase(users, verifier);
    const verify = new VerifyEmailUseCase(users, verifier);
    expect((await start.execute(ana.id, ' Ana@Example.com ')).sentTo).toBe('a***a@example.com');
    expect(sender.emails[0].to).toBe('ana@example.com');
    await expect(verify.execute(ana.id, '000000')).rejects.toThrow(UnauthorizedError);
    const session = await verify.execute(ana.id, sender.lastEmailCode());
    expect(session.email).toBe('ana@example.com');
    await expect(start.execute(beto.id, 'ana@example.com')).rejects.toThrow('Ese correo ya está en otra cuenta');
    await expect(start.execute(beto.id, 'no-es-correo')).rejects.toThrow(ValidationError);
  });

  it('la foto de perfil solo acepta JPEG de verdad y de tamaño razonable', async () => {
    const saved: string[] = [];
    const storage = { save: async (id: string) => void saved.push(id), read: async () => null as never, exists: async () => true };
    const upload = new UploadAvatarUseCase(users, storage, events);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
    const session = await upload.execute(ana.id, jpeg);
    expect(session.avatarUrl).toMatch(/^\/api\/avatars\/av[a-f0-9]{32}$/);
    expect(saved).toHaveLength(1);
    await expect(upload.execute(ana.id, Buffer.from('<svg onload=alert(1)>'))).rejects.toThrow('JPEG');
    await expect(upload.execute(ana.id, Buffer.alloc(400 * 1024, 0xff))).rejects.toThrow('muy pesada');
  });

  it('cruza la libreta: completa el indicativo propio a los números locales y no se incluye a sí misma', async () => {
    const match = new MatchContactsUseCase(users, new PresenceRegistry());
    const found = await match.execute(ana.id, ['300 555 0101', '+51 987 654 321', '+57 300 111 2233', '123', 'texto']);
    expect(found.map((m) => [m.phone, m.user.displayName])).toEqual([
      ['300 555 0101', 'Beto'],
      ['+51 987 654 321', 'Carla'],
    ]);
    expect(found[0].user).not.toHaveProperty('phone');
  });
});
