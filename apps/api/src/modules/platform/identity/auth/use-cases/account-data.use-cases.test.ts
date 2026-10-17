import { beforeEach, describe, expect, it } from 'vitest';
import { UnauthorizedError, ValidationError } from '../../../../../kernel/domain-error';
import { TERMS_VERSION } from '../../../../../kernel/legal';
import {
  fakeHasher,
  fakeTokens,
  InMemoryAuthRepository,
  makeUser,
  RecordingRealtime,
} from '../../../../../testing/in-memory.fakes';
import { DeleteAccountUseCase, ExportAccountUseCase } from './account-data.use-case';
import { RegisterUserUseCase } from './register-user.use-case';

const keys = { publicKey: '{"kty":"EC"}', keyBackup: { ciphertext: 'c', iv: 'i', salt: 's', iterations: 1000 } };

describe('aspectos legales de la cuenta', () => {
  let users: InMemoryAuthRepository;
  let realtime: RecordingRealtime;
  let remove: DeleteAccountUseCase;

  beforeEach(() => {
    users = new InMemoryAuthRepository();
    realtime = new RecordingRealtime();
    remove = new DeleteAccountUseCase(users, fakeHasher, realtime);
  });

  it('el registro exige aceptar los términos y guarda versión y fecha', async () => {
    const register = new RegisterUserUseCase(users, fakeHasher, fakeTokens);
    await expect(register.execute({ username: 'ana', displayName: 'Ana', password: 'Clave2026', acceptTerms: false, ...keys })).rejects.toThrow(ValidationError);
    await register.execute({ username: 'ana', displayName: 'Ana', password: 'Clave2026', acceptTerms: true, ...keys });
    expect(users.users[0].termsVersion).toBe(TERMS_VERSION);
    expect(users.users[0].termsAcceptedAt).toBeInstanceOf(Date);
  });

  it('eliminar la cuenta pide la contraseña', async () => {
    const ana = makeUser();
    users.users.push(ana);
    await expect(remove.execute(ana.id, 'mala')).rejects.toThrow(UnauthorizedError);
  });

  it('anonimiza la cuenta y sus contactos dejan de verla en línea', async () => {
    const ana = makeUser({ username: 'ana', phone: '+573001112233', displayName: 'Ana Ruiz' });
    const beto = makeUser();
    users.users.push(ana, beto);
    users.contacts.set(ana.id, [beto.id]);

    await remove.execute(ana.id, 'Parla2026!');
    expect(users.users[0]).toMatchObject({ username: null, phone: null, displayName: 'Cuenta eliminada' });
    expect(users.users[0].deletedAt).toBeInstanceOf(Date);
    expect(realtime.events('presence')[0]).toMatchObject({ userIds: [beto.id], payload: { userId: ana.id, presence: 'offline' } });
    expect(await users.searchDirectory(beto.id, '', 10)).toEqual([]);
    await expect(new ExportAccountUseCase(users).execute(ana.id)).rejects.toThrow(UnauthorizedError);
  });

  it('la exportación incluye el perfil y aclara que los mensajes van cifrados', async () => {
    const ana = makeUser({ username: 'ana', termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() });
    users.users.push(ana);
    const data = await new ExportAccountUseCase(users).execute(ana.id);
    expect(data.profile.username).toBe('ana');
    expect(data.termsVersion).toBe(TERMS_VERSION);
    expect(data.note).toContain('cifrado de extremo a extremo');
    expect(data).not.toHaveProperty('profile.passwordHash');
  });
});
