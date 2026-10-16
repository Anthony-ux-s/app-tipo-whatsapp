import type { ConversationSummary, MediaAttachment } from '@parla/types';
import { useEffect, useRef, useState } from 'react';
import { decryptedMediaUrl } from '@shared/utils/media-cache';

type MediaState = { status: 'loading' | 'error'; url: null } | { status: 'ready'; url: string };

/** URL local del archivo descifrado (o la vista previa local mientras se sube). */
export function useDecryptedMedia(
  conversation: Pick<ConversationSummary, 'id' | 'myKey'>,
  media: MediaAttachment | null,
  localPreviewUrl?: string,
) {
  const [state, setState] = useState<MediaState>(
    localPreviewUrl ? { status: 'ready', url: localPreviewUrl } : { status: 'loading', url: null },
  );
  const [attempt, setAttempt] = useState(0);
  const latest = useRef({ conversation, media });
  latest.current = { conversation, media };
  const fileId = media?.fileId;

  useEffect(() => {
    if (localPreviewUrl) {
      setState({ status: 'ready', url: localPreviewUrl });
      return;
    }
    const current = latest.current;
    if (!fileId || !current.media) return;
    let alive = true;
    decryptedMediaUrl(current.conversation, current.media)
      .then((url) => alive && setState({ status: 'ready', url }))
      .catch(() => alive && setState({ status: 'error', url: null }));
    return () => {
      alive = false;
    };
  }, [fileId, localPreviewUrl, attempt]);

  return {
    ...state,
    retry: () => {
      setState({ status: 'loading', url: null });
      setAttempt((n) => n + 1);
    },
  };
}
