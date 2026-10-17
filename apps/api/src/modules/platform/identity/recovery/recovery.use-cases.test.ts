import type { ConversationSummary } from '@parla/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError, UnauthorizedError, ValidationError } from '../../../../kernel/domain-error';
import { PresenceRegistry } from '../../../../infra/realtime/presence.registry';
import {
  fakeHasher,
  fakeTokens,
  InMemoryAuthRepository,
  InMemoryConversationsRepository,
  InMemoryPushSubscriptions,
  InMemoryVerificationCodes,
  makeUser,
  RecordingPushSender,
  RecordingRealtime,
  RecordingVerificationSender,
  testEnv,
} from '../../../../testing/in-memory.fakes';
import { ConversationEvents } from '../../messaging/conversations/conversation-events';
import { GetConversationUseCase } from '../../messaging/conversations/use-cases/get-conversation.use-case';
import { ReshareKeysUseCase } from '../../messaging/conversations/use-cases/reshare-keys.use-case';
import { SendMessageUseCase } from '../../messaging/conversations/use-cases/send-message.use-case';
import { NotificationDispatcher } from '../../messaging/push/use-cases/notification-dispatcher';
import { CodeVerifier } from '../verification/code-verifier';
import { ForgotPasswordUseCase, ResetPasswordUseCase, VerifyResetCodeUseCase } from './recovery.use-cases';

const newKeys = { publicKey: '{"kty":"EC","nueva":true}', keyBackup: { ciphertext: 'n', iv: 'n', salt: 'n', iterations: 1000 } };

describe('recuperar la cuenta con el correo', () => {
  const laura = makeUser({ displayName: 'Laura', email: 'laura@example.com', emailVerifiedAt: new Date() });
  const andres = makeUser({ displayName: 'Andrés' });
  let users: InMemoryAuthRepository;
  let repo: InMemoryConversationsRepository;
  let sender: RecordingVerificationSender;
  let realtime: RecordingRealtime;
  let forgot: ForgotPasswordUseCase;
  let verifyCode: VerifyResetCodeUseCase;
  let reset: ResetPasswordUseCase;
  let reshare: ReshareKeysUseCase;

  const resetWithCode = async () => {
    await forgot.execute('laura@example.com');
    const { verificationToken } = await verifyCode.execute('laura@example.com', sender.lastEmailCode());
    return reset.execute({ verificationToken, password: 'Nueva2026', ...newKeys });
  };

  beforeEach(() => {
    users = new InMemoryAuthRepository();
    users.users.push({ ...laura }, { ...andres });
    repo = new InMemoryConversationsRepository();
    repo.addConversation('c1', [andres, laura], 'direct');
    sender = new RecordingVerificationSender();
    realtime = new RecordingRealtime();
    const presence = new PresenceRegistry();
    const verifier = new CodeVerifier(new InMemoryVerificationCodes(), sender, testEnv);
    const get = new GetConversationUseCase(repo, presence);
    const events = new ConversationEvents(repo, realtime, presence);
    const send = new SendMessageUseCase(repo, realtime, get, new NotificationDispatcher(new InMemoryPushSubscriptions(), new RecordingPushSender(), presence));
    forgot = new ForgotPasswordUseCase(users, verifier);
    verifyCode = new VerifyResetCodeUseCase(verifier);
    reset = new ResetPasswordUseCase(users, fakeHasher, fakeTokens, repo, verifier, send, events);
    reshare = new ReshareKeysUseCase(repo, get, events);
  });

  it('responde igual exista o no el correo (no revela quién usa Parla), pero solo envía si existe', async () => {
    const known = await forgot.execute('laura@example.com');
    const unknown = await forgot.execute('nadie@example.com');
    expect(Object.keys(known).sort()).toEqual(Object.keys(unknown).sort());
    expect(sender.emails.map((e) => e.to)).toEqual(['laura@example.com']);
    expect(sender.emails[0].html).toContain(sender.lastEmailCode());
  });

  it('con el código: contraseña nueva, claves nuevas, sesión iniciada y aviso en cada chat', async () => {
    const session = await resetWithCode();
    expect(session.token).toBe(`token-${laura.id}`);
    expect(users.users[0]).toMatchObject({ passwordHash: 'hash:Nueva2026', publicKey: newKeys.publicKey });
    expect(repo.messages.at(-1)?.systemText).toBe('Laura restableció su cuenta y cambió su clave de seguridad');
    const view = realtime.events('conversation:upsert').find((e) => e.userIds[0] === andres.id)!.payload as ConversationSummary;
    expect(view.participants.find((p) => p.user.id === laura.id)?.keyPending).toBe(true);
    // El comprobante es de un solo uso
    await expect(reset.execute({ verificationToken: 'otro', password: 'Nueva2026', ...newKeys })).rejects.toThrow(UnauthorizedError);
  });

  it('Andrés le vuelve a compartir la clave del chat; solo a quien la tiene pendiente y envuelta por él', async () => {
    await resetWithCode();
    const key = { userId: laura.id, wrappedKey: 'clave-para-la-nueva', iv: 'iv', wrappedById: andres.id };
    await expect(reshare.execute(andres.id, 'c1', { keys: [{ ...key, userId: andres.id }] })).rejects.toThrow(ValidationError);
    await expect(reshare.execute(andres.id, 'c1', { keys: [{ ...key, wrappedById: laura.id }] })).rejects.toThrow(ValidationError);
    await expect(reshare.execute(laura.id, 'c1', { keys: [key] })).rejects.toThrow(ForbiddenError);

    const view = await reshare.execute(andres.id, 'c1', { keys: [key] });
    expect(view.participants.every((p) => !p.keyPending)).toBe(true);
    expect((await repo.findForUser('c1', laura.id))!.participants.find((p) => p.user.id === laura.id)?.wrappedKey).toBe('clave-para-la-nueva');
  });
});
