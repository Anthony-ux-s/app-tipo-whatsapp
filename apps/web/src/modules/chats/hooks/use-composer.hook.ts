import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type SyntheticEvent } from 'react';
import { useChatStore } from '@shared/stores/chat.store';
import { useEffectsStore } from '@shared/stores/effects.store';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { detectEffect } from '@shared/utils/chat-effects';
import { errorMessage } from '@shared/utils/http';
import { stickerEffect, type StickerRef } from '@shared/utils/sticker-codec';
import { MAX_FILE_BYTES, MAX_MESSAGE_LENGTH, QUICK_EMOJIS } from '../const/chats.const';
import type { PendingAttachment } from '../types/chats.types';
import {
  collectMentions,
  filterCandidates,
  findMentionQuery,
  insertMention,
  type MentionCandidate,
  type MentionQuery,
} from '../utils/mentions.utils';
import { useVoiceRecorder } from './use-voice-recorder.hook';

const TYPING_PING_MS = 2500;

/**
 * Barra de escritura: texto con @menciones, emojis, adjuntos (foto/video) y notas de voz, todo cifrado
 * antes de salir. En el panel de un hilo (`threadRootId`) cada envío es una respuesta a esa raíz.
 */
export function useComposer(conversationId: string, threadRootId: string | null = null) {
  const myId = useSessionStore((s) => s.user!.id);
  const enterToSend = useSessionStore((s) => s.user?.preferences.enterToSend ?? true);
  const participants = useChatStore((s) => s.conversations[conversationId]?.participants);
  const replyDraft = useChatStore((s) => (threadRootId ? null : (s.replyDraft[conversationId] ?? null)));
  const texts = useChatStore((s) => s.texts);
  const { sendText, sendSticker, sendMedia, emitTyping, setReplyDraft } = useChatStore.getState();
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [caption, setCaption] = useState('');
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const textArea = useRef<HTMLTextAreaElement | null>(null);
  const lastPing = useRef(0);
  const pendingCaret = useRef<number | null>(null);
  const stopTimer = useRef<number | null>(null);

  const replyToId = threadRootId ?? replyDraft?.id ?? null;

  const candidates = useMemo<MentionCandidate[]>(
    () => (participants ?? []).filter((p) => p.user.id !== myId).map((p) => ({ id: p.user.id, displayName: p.user.displayName })),
    [participants, myId],
  );
  const suggestions = useMemo(() => (mention ? filterCandidates(candidates, mention.query) : []), [mention, candidates]);

  const recorder = useVoiceRecorder(async (blob, mimeType, durationMs) => {
    await sendMedia(conversationId, { kind: 'audio', blob, mimeType, durationMs, replyToId }).catch((err) =>
      toast(errorMessage(err), 'error'),
    );
    if (!threadRootId) setReplyDraft(conversationId, null);
  });

  useEffect(() => {
    setText('');
    setEmojiOpen(false);
    setMention(null);
    return () => {
      if (stopTimer.current) window.clearTimeout(stopTimer.current);
      emitTyping(conversationId, false);
    };
  }, [conversationId, emitTyping]);

  // Al elegir "Responder", el foco va a la barra de escritura.
  useEffect(() => {
    if (replyDraft) textArea.current?.focus();
  }, [replyDraft]);

  const { error: recorderError, clearError } = recorder;
  useEffect(() => {
    if (recorderError) {
      toast(recorderError, 'error');
      clearError();
    }
  }, [recorderError, clearError]);

  // Ajusta la altura del área de texto al contenido (hasta 6 líneas).
  useEffect(() => {
    const el = textArea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [text]);

  // Tras insertar una mención, el cursor queda detrás de ella antes de que llegue la siguiente tecla.
  useLayoutEffect(() => {
    const el = textArea.current;
    if (pendingCaret.current === null || !el) return;
    el.focus();
    el.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [text]);

  const pingTyping = () => {
    const now = Date.now();
    if (now - lastPing.current > TYPING_PING_MS) {
      lastPing.current = now;
      emitTyping(conversationId, true);
    }
    if (stopTimer.current) window.clearTimeout(stopTimer.current);
    stopTimer.current = window.setTimeout(() => {
      lastPing.current = 0;
      emitTyping(conversationId, false);
    }, TYPING_PING_MS + 500);
  };

  const refreshMention = (value: string, caret: number) => {
    const found = findMentionQuery(value, caret);
    setMention(found);
    if (!found) setMentionIndex(0);
  };

  const pickMention = (candidate: MentionCandidate) => {
    const el = textArea.current;
    if (!mention || !el) return;
    const next = insertMention(text, mention, el.selectionStart ?? text.length, candidate.displayName);
    pendingCaret.current = next.caret;
    setText(next.text);
    setMention(null);
    setMentionIndex(0);
  };

  const send = () => {
    const value = text.trim();
    if (!value) return;
    if (value.length > MAX_MESSAGE_LENGTH) {
      toast(`El mensaje supera los ${MAX_MESSAGE_LENGTH} caracteres`, 'error');
      return;
    }
    setText('');
    setEmojiOpen(false);
    setMention(null);
    lastPing.current = 0;
    emitTyping(conversationId, false);
    const mentions = collectMentions(value, candidates);
    sendText(conversationId, value, { replyToId, mentions }).catch((err) => toast(errorMessage(err), 'error'));
    useEffectsStore.getState().play(detectEffect(value));
    if (!threadRootId) setReplyDraft(conversationId, null);
    textArea.current?.focus();
  };

  /** Los stickers se envían al tocarlos, como en WhatsApp; el panel queda abierto para mandar otro. */
  const sendStickerNow = (sticker: StickerRef) => {
    sendSticker(conversationId, sticker, { replyToId }).catch((err) => toast(errorMessage(err), 'error'));
    useEffectsStore.getState().play(stickerEffect(sticker));
    if (!threadRootId) setReplyDraft(conversationId, null);
  };

  const closeAttachment = () => {
    if (attachment) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
    setCaption('');
  };

  const replyText = replyDraft ? texts[replyDraft.clientId] : undefined;
  const replyAuthor = replyDraft ? participants?.find((p) => p.user.id === replyDraft.senderId)?.user : undefined;

  return {
    text,
    emojiOpen,
    emojis: QUICK_EMOJIS,
    attachment,
    caption,
    sendingAttachment,
    recorder,
    fileInput,
    textArea,
    canSend: text.trim().length > 0,
    suggestions,
    mentionIndex,
    reply: replyDraft
      ? {
          author: replyAuthor ? (replyAuthor.id === myId ? 'Tú' : replyAuthor.displayName) : 'Mensaje',
          preview: replyText?.ok && replyText.text ? replyText.text : 'Archivo',
        }
      : null,
    cancelReply: () => setReplyDraft(conversationId, null),
    pickMention,
    onTextChange: (event: ChangeEvent<HTMLTextAreaElement>) => {
      setText(event.target.value);
      refreshMention(event.target.value, event.target.selectionStart ?? event.target.value.length);
      if (event.target.value) pingTyping();
    },
    onCaretMove: (event: SyntheticEvent<HTMLTextAreaElement>) => {
      const el = event.currentTarget;
      refreshMention(el.value, el.selectionStart ?? el.value.length);
    },
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (suggestions.length > 0) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const step = event.key === 'ArrowDown' ? 1 : -1;
          setMentionIndex((i) => (i + step + suggestions.length) % suggestions.length);
          return;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          pickMention(suggestions[Math.min(mentionIndex, suggestions.length - 1)]);
          return;
        }
        if (event.key === 'Escape') {
          setMention(null);
          return;
        }
      }
      if (event.key === 'Escape' && replyDraft) {
        setReplyDraft(conversationId, null);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey && enterToSend && !event.nativeEvent.isComposing) {
        event.preventDefault();
        send();
      }
    },
    send,
    sendSticker: sendStickerNow,
    closeEmoji: () => setEmojiOpen(false),
    toggleEmoji: () => setEmojiOpen((v) => !v),
    addEmoji: (emoji: string) => {
      setText((v) => v + emoji);
      textArea.current?.focus();
    },
    pickFile: () => fileInput.current?.click(),
    onFileChange: (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : null;
      if (!kind) {
        toast('Por ahora puedes enviar fotos y videos', 'error');
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast('El archivo supera los 25 MB', 'error');
        return;
      }
      setAttachment({ file, kind, previewUrl: URL.createObjectURL(file) });
      setCaption('');
    },
    onCaptionChange: (value: string) => setCaption(value),
    closeAttachment,
    sendAttachment: async () => {
      if (!attachment) return;
      setSendingAttachment(true);
      const { file, kind } = attachment;
      const pendingCaption = caption;
      closeAttachment();
      setSendingAttachment(false);
      await sendMedia(conversationId, { kind, blob: file, mimeType: file.type, caption: pendingCaption, replyToId }).catch((err) =>
        toast(errorMessage(err), 'error'),
      );
      if (!threadRootId) setReplyDraft(conversationId, null);
    },
  };
}
