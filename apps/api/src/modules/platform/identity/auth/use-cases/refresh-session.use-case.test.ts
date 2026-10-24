import { describe, expect, it } from 'vitest';
import { ForbiddenError, UnauthorizedError } from '../../../../../kernel/domain-error';
import { fakeTokens, InMemoryAuthRepository, makeUser } from '../../../../../testing/in-memory.fakes';
import { RefreshSessionUseCase } from './refresh-session.use-case';

describe('renovar la sesión', () => {
  it('da un token nuevo a quien sigue usando la app', async () => {
    const users = new InMemoryAuthRepository();
    const user = makeUser();
    users.users.push(user);
    expect(await new RefreshSessionUseCase(users, fakeTokens).execute(user.id)).toEqual({ token: `token-${user.id}` });
  });

  it('no renueva una cuenta que ya no existe o está suspendida', async () => {
    const users = new InMemoryAuthRepository();
    const gone = makeUser({ deletedAt: new Date() });
    const blocked = makeUser({ blockedAt: new Date() });
    users.users.push(gone, blocked);
    const refresh = new RefreshSessionUseCase(users, fakeTokens);
    await expect(refresh.execute('no-existe')).rejects.toThrow(UnauthorizedError);
    await expect(refresh.execute(gone.id)).rejects.toThrow(UnauthorizedError);
    await expect(refresh.execute(blocked.id)).rejects.toThrow(ForbiddenError);
  });
});
