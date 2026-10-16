import type { ConversationSummary } from '@parla/types';
import { MessagesSquare, X } from 'lucide-react';
import { IconButton } from '@shared/ui/Button';
import { Spinner } from '@shared/ui/Spinner';
import { ErrorState } from '@shared/ui/States';
import { useThreadPanel } from '../hooks/use-thread-panel.hook';
import type { MessageActions } from '../types/message-actions.types';
import { Composer } from './Composer';
import { MessageBubble } from './MessageBubble';

interface ThreadPanelProps {
  conversation: ConversationSummary;
  rootId: string;
  myId: string;
  actions: MessageActions;
  onClose: () => void;
}

/** Hilo de un mensaje: la raíz arriba, sus respuestas debajo y una barra para responder en el hilo. */
export function ThreadPanel({ conversation, rootId, myId, actions, onClose }: ThreadPanelProps) {
  const thread = useThreadPanel(conversation, rootId);
  return (
    <aside aria-label="Hilo" className="absolute inset-0 z-20 flex animate-slide-in flex-col bg-canvas lg:static lg:w-[400px] lg:shrink-0 lg:border-l lg:border-line">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line bg-surface px-2">
        <IconButton label="Cerrar hilo" onClick={onClose}>
          <X className="size-5" />
        </IconButton>
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 font-display text-base font-bold text-ink">
            <MessagesSquare className="size-4 text-teal-600 dark:text-teal-300" /> Hilo
          </h2>
          <p className="truncate text-xs text-ink-soft">{conversation.title}</p>
        </div>
      </header>

      <div ref={thread.scrollRef} className="chat-wallpaper flex-1 overflow-y-auto py-3" data-testid="thread-panel">
        {thread.status === 'error' ? (
          <ErrorState message="No pudimos abrir el hilo." onRetry={thread.retry} />
        ) : !thread.root ? (
          <div className="flex justify-center py-10">
            <Spinner className="size-6 text-brand" />
          </div>
        ) : (
          <>
            <MessageBubble
              conversation={conversation}
              message={thread.root}
              texts={thread.texts}
              myId={myId}
              outgoing={thread.root.senderId === myId}
              firstOfRun
              lastOfRun
              showSender
              actions={actions}
              inThread
            />
            <div className="my-3 flex items-center gap-3 px-4">
              <span className="h-px flex-1 bg-line" />
              <span className="text-xs font-semibold text-ink-soft">{thread.countLabel}</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            {thread.replies.map((reply) => (
              <MessageBubble
                key={reply.clientId}
                conversation={conversation}
                message={reply}
                texts={thread.texts}
                myId={myId}
                outgoing={reply.senderId === myId}
                firstOfRun
                lastOfRun
                showSender
                actions={actions}
                inThread
              />
            ))}
          </>
        )}
      </div>
      <Composer conversationId={conversation.id} threadRootId={rootId} />
    </aside>
  );
}
