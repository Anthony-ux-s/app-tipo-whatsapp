import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, UnauthorizedError, ValidationError } from '../../../../../kernel/domain-error';
import { TERMS_VERSION } from '../../../../../kernel/legal';
import {
  fakeHasher,
  fakeTokens,
  InMemoryAuthRepository,
  InMemoryWorkspacesRepository,
  makeUser,
  RecordingRealtime,
} from '../../../../../testing/in-memory.fakes';
import { DeleteAccountUseCase, ExportAccountUseCase } from './account-data.use-case';
import { RegisterUserUseCase } from './register-user.use-case';

const keys = { publicKey: '{"kty":"EC"}', keyBackup: { ciphertext: 'c', iv: 'i', salt: 's', iterations: 1000 } };

const workspace = (id: string, name: string) => ({
  id, name, description: '', color: 'teal', inviteCode: `${id}code`, allowMemberGroups: true,
  creatorId: 'x', createdAt: new Date(), memberCount: 0, plan: 'free' as const, planExpiresAt: null,
});

describe('aspectos legales de la cuenta', () => {
  let users: InMemoryAuthRepository;
  let workspaces: InMemoryWorkspacesRepository;
  let realtime: RecordingRealtime;
  let remove: DeleteAccountUseCase;

  beforeEach(() => {
    users = new InMemoryAuthRepository();
    workspaces = new InMemoryWorkspacesRepository();
    realtime = new RecordingRealtime();
    remove = new DeleteAccountUseCase(users, workspaces, fakeHasher, realtime);
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

  it('no deja un espacio con más gente sin administrador', async () => {
    const ana = makeUser();
    users.users.push(ana);
    workspaces.workspaces.push(workspace('w1', 'Café Andino'));
    workspaces.add(ana, 'w1', 'admin');
    workspaces.add(makeUser(), 'w1', 'member');
    await expect(remove.execute(ana.id, 'Parla2026!')).rejects.toThrow(ConflictError);
    await expect(remove.execute(ana.id, 'Parla2026!')).rejects.toThrow('Nombra a otro administrador en «Café Andino»');
  });

  it('anonimiza la cuenta, borra los espacios donde estaba sola y avisa a los demás', async () => {
    const ana = makeUser({ username: 'ana', phone: '+573001112233', displayName: 'Ana Ruiz' });
    const beto = makeUser();
    users.users.push(ana);
    workspaces.workspaces.push(workspace('solo', 'Mi espacio'), workspace('w2', 'Equipo'));
    workspaces.add(ana, 'solo', 'admin');
    workspaces.add(ana, 'w2', 'member');
    workspaces.add(beto, 'w2', 'admin');

    await remove.execute(ana.id, 'Parla2026!');
    expect(users.users[0]).toMatchObject({ username: null, phone: null, displayName: 'Cuenta eliminada' });
    expect(users.users[0].deletedAt).toBeInstanceOf(Date);
    expect(workspaces.workspaces.map((w) => w.id)).toEqual(['w2']);
    expect(realtime.events('workspace:changed')[0]).toMatchObject({ userIds: [beto.id], payload: { workspaceId: 'w2' } });
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
