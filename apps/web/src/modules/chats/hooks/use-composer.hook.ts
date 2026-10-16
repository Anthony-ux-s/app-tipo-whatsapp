import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useChatStore } from '@shared/stores/chat.store';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage } from '@shared/utils/http';
import { MAX_FILE_BYTES, MAX_MESSAGE_LENGTH, QUICK_EMOJIS } from '../const/chats.const';
import type { PendingAttachment } from '../types/chats.types';
import { useVoiceRecorder } from './use-voice-recorder.hook';

const TYPING_PING_MS = 2500;

/** Barra de escritura: texto, emojis, adjuntos (foto/video) y notas de voz, todo cifrado antes de salir. */
export function useComposer(conversationId: string) {
  const enterToSend = useSessionStore((s) => s.user?.preferences.enterToSend ?? true);
  const { sendText, sendMedia, emitTyping } = useChatStore.getState();
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [caption, setCaption] = useState('');
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const textArea = useRef<HTMLTextAreaElement | null>(null);
  const lastPing = useRef(0);
  const stopTimer = useRef<number | null>(null);

  const recorder = useVoiceRecorder(async (blob, mimeType, durationMs) => {
    await sendMedia(conversationId, { kind: 'audio', blob, mimeType, durationMs }).catch((err) =>
      toast(errorMessage(err), 'error'),
    );
  });

  useEffect(() => {
    setText('');
    setEmojiOpen(false);
    return () => {
      if (stopTimer.current) window.clearTimeout(stopTimer.current);
      emitTyping(conversationId, false);
    };
  }, [conversationId, emitTyping]);

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

  const send = () => {
    const value = text.trim();
    if (!value) return;
    if (value.length > MAX_MESSAGE_LENGTH) {
      toast(`El mensaje supera los ${MAX_MESSAGE_LENGTH} caracteres`, 'error');
      return;
    }
    setText('');
    setEmojiOpen(false);
    lastPing.current = 0;
    emitTyping(conversationId, false);
    sendText(conversationId, value).catch((err) => toast(errorMessage(err), 'error'));
    textArea.current?.focus();
  };

  const closeAttachment = () => {
    if (attachment) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
    setCaption('');
  };

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
    onTextChange: (event: ChangeEvent<HTMLTextAreaElement>) => {
      setText(event.target.value);
      if (event.target.value) pingTyping();
    },
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey && enterToSend && !event.nativeEvent.isComposing) {
        event.preventDefault();
        send();
      }
    },
    send,
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
      await sendMedia(conversationId, { kind, blob: file, mimeType: file.type, caption: pendingCaption }).catch((err) =>
        toast(errorMessage(err), 'error'),
      );
    },
  };
}
