import type { MentionCandidate } from '../utils/mentions.utils';
import { segmentMentions } from '../utils/mentions.utils';

interface MessageTextProps {
  text: string;
  mentioned: MentionCandidate[];
  myId: string;
  className?: string;
}

/** Texto del mensaje con las @menciones resaltadas (la mía, más fuerte). */
export function MessageText({ text, mentioned, myId, className = '' }: MessageTextProps) {
  return (
    <p className={`chat-text leading-snug break-words whitespace-pre-wrap text-ink ${className}`}>
      {segmentMentions(text, mentioned, myId).map((segment, i) =>
        segment.mention ? (
          <span
            key={i}
            data-testid="mention"
            className={`rounded px-0.5 font-semibold ${segment.mention.self ? 'bg-cyan-100 text-ink dark:bg-cyan-900/70 dark:text-ink' : 'text-teal-700 dark:text-teal-300'}`}
          >
            {segment.text}
          </span>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </p>
  );
}
