import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, UnauthorizedError, ValidationError } from '../../../../../kernel/domain-error';
import { fakeHasher, fakeTokens, InMemoryAuthRepository } from '../../../../../testing/in-memory.fakes';
import { LoginUseCase } from './login.use-case';
import { RegisterUserUseCase } from './register-user.use-case';

const keys = { publicKey: '{"kty":"EC"}', keyBackup: { ciphertext: 'c', iv: 'i', salt: 's', iterations: 1000 } };

describe('registro e inicio de sesión', () => {
  let users: InMemoryAuthRepository;
  let register: RegisterUserUseCase;
  let login: LoginUseCase;

  beforeEach(() => {
    users = new InMemoryAuthRepository();
    register = new RegisterUserUseCase(users, fakeHasher, fakeTokens);
    login = new LoginUseCase(users, fakeHasher, fakeTokens);
  });

  it('registra con nombre de usuario, guarda solo el hash y devuelve una sesión', async () => {
    const res = await register.execute({ username: '@Maria.Lopez', displayName: ' María López ', password: 'Clave2026', ...keys });
    expect(res.user.username).toBe('maria.lopez');
    expect(res.user.displayName).toBe('María López');
    expect(res.token).toBe(`token-${res.user.id}`);
    expect(users.users[0].passwordHash).not.toBe('Clave2026');
    expect(res.user).not.toHaveProperty('passwordHash');
  });

  it('registra con teléfono normalizado', async () => {
    const res = await register.execute({ phone: '+57 310 555 1234', displayName: 'Pedro', password: 'Clave2026', ...keys });
    expect(res.user.phone).toBe('+573105551234');
  });

  it('pide teléfono o usuario, y valida contraseña y formato', async () => {
    await expect(register.execute({ displayName: 'Ana', password: 'Clave2026', ...keys })).rejects.toThrow(ValidationError);
    await expect(register.execute({ username: 'ana', displayName: 'Ana', password: 'corta', ...keys })).rejects.toThrow(ValidationError);
    await expect(register.execute({ phone: '3001234', displayName: 'Ana', password: 'Clave2026', ...keys })).rejects.toThrow(ValidationError);
  });

  it('no permite usuarios ni teléfonos repetidos', async () => {
    await register.execute({ username: 'ana', phone: '+573001112233', displayName: 'Ana', password: 'Clave2026', ...keys });
    await expect(register.execute({ username: 'ana', displayName: 'Otra', password: 'Clave2026', ...keys })).rejects.toThrow(ConflictError);
    await expect(register.execute({ phone: '+57 300 111 2233', displayName: 'Otra', password: 'Clave2026', ...keys })).rejects.toThrow(ConflictError);
  });

  it('inicia sesión con usuario o con teléfono', async () => {
    const { user } = await register.execute({ username: 'ana', phone: '+573001112233', displayName: 'Ana', password: 'Clave2026', ...keys });
    await expect(login.execute({ identifier: 'ANA', password: 'Clave2026' })).resolves.toMatchObject({ user: { id: user.id } });
    await expect(login.execute({ identifier: '+57 300 111 2233', password: 'Clave2026' })).resolves.toMatchObject({ user: { id: user.id } });
  });

  it('rechaza contraseña incorrecta o cuenta inexistente con el mismo mensaje', async () => {
    await register.execute({ username: 'ana', displayName: 'Ana', password: 'Clave2026', ...keys });
    const wrong = login.execute({ identifier: 'ana', password: 'Otra2026' });
    const missing = login.execute({ identifier: 'nadie', password: 'Clave2026' });
    await expect(wrong).rejects.toThrow(UnauthorizedError);
    await expect(missing).rejects.toThrow('Usuario, teléfono o contraseña incorrectos');
  });
});
