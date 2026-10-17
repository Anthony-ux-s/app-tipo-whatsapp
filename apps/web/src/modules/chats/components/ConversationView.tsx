import { ChevronDown, Lock, X } from 'lucide-react';
import { Spinner } from '@shared/ui/Spinner';
import { ErrorState } from '@shared/ui/States';
import { TasksPanel } from '../../tasks/components/TasksPanel';
import { useConversation } from '../hooks/use-conversation.hook';
import { Composer } from './Composer';
import { ConversationHeader } from './ConversationHeader';
import { KeyReshareBanner } from './KeyReshareBanner';
import { ConversationInfoPanel } from './ConversationInfoPanel';
import { MessageBubble } from './MessageBubble';
import { ThreadPanel } from './ThreadPanel';

/** Panel principal: cabecera, mensajes cronológicos, barra de escritura y paneles de info, hilo y tareas. */
export function ConversationView() {
  const chat = useConversation();
  const { conversation, thread, panel } = chat;

  if (!conversation) {
    return (
      <div className="chat-wallpaper flex flex-1 items-center justify-center">
        <Spinner className="size-7 text-brand" />
      </div>
    );
  }

  return (
    <div className="relative flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <ConversationHeader
          conversation={conversation}
          subtitle={chat.subtitle}
          typing={chat.typing}
          online={chat.online}
          tasksOpen={panel?.type === 'tasks'}
          callBusy={chat.callBusy}
          onCall={chat.startCall}
          onBack={chat.back}
          onOpenInfo={chat.openInfo}
          onOpenTasks={chat.openTasks}
        />
        <KeyReshareBanner conversation={conversation} />

        <div
          ref={chat.scrollRef}
          onScroll={chat.onScroll}
          onClick={chat.actions.menuFor ? chat.closeMenu : undefined}
          className="chat-wallpaper relative flex-1 overflow-y-auto py-3"
          data-testid="message-list"
        >
          <div className="mx-auto mb-3 flex max-w-md justify-center px-4">
            <p className="flex items-start gap-2 rounded-lg bg-cyan-50/95 px-3 py-2 text-center text-xs text-cyan-900 shadow-float dark:bg-cyan-950/70 dark:text-cyan-100">
              <Lock className="mt-px size-3.5 shrink-0" />
              Los mensajes y las tareas están cifrados de extremo a extremo. Nadie fuera de este chat, ni siquiera Parla, puede leerlos.
            </p>
          </div>

          {thread?.loadingOlder && (
            <div className="flex justify-center py-2">
              <Spinner className="size-5 text-brand" />
            </div>
          )}

          {!thread || (thread.status === 'loading' && thread.items.length === 0) ? (
            <div className="flex flex-col gap-3 px-4 md:px-[6%]" aria-busy="true" aria-label="Cargando mensajes">
              {[48, 64, 36, 56, 44].map((w, i) => (
                <div key={i} className={`flex ${i % 2 ? 'justify-end' : ''}`}>
                  <div className="skeleton h-10 rounded-2xl" style={{ width: `${w}%` }} />
                </div>
              ))}
            </div>
          ) : thread.status === 'error' && thread.items.length === 0 ? (
            <ErrorState message="No pudimos traer los mensajes de este chat." onRetry={chat.reload} />
          ) : (
            chat.timeline.map((item) =>
              item.type === 'day' ? (
                <div key={item.id} className="my-3 flex justify-center">
                  <span className="rounded-lg bg-surface/95 px-3 py-1 text-xs font-medium text-ink-soft shadow-float">{item.label}</span>
                </div>
              ) : (
                <MessageBubble
                  key={item.id}
                  conversation={conversation}
                  message={item.message}
                  texts={chat.texts}
                  myId={chat.user.id}
                  outgoing={item.message.senderId === chat.user.id}
                  firstOfRun={item.firstOfRun}
                  lastOfRun={item.lastOfRun}
                  showSender={conversation.kind === 'group'}
                  actions={chat.actions}
                />
              ),
            )
          )}

          {chat.typing && (
            <div className="mt-2 flex px-3 md:px-[6%]">
              <div className="flex animate-rise items-center gap-1 rounded-2xl rounded-tl-[4px] bg-bubble-in px-4 py-3 shadow-float" aria-label={chat.typing}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-2 animate-typing rounded-full bg-ink-faint" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          )}
        </div>

        {chat.showJump && (
          <button
            type="button"
            onClick={chat.jumpToBottom}
            aria-label="Ir al último mensaje"
            className="absolute right-4 bottom-24 z-10 flex size-11 animate-pop items-center justify-center rounded-full bg-surface text-ink-soft shadow-pop hover:text-ink"
          >
            <ChevronDown className="size-5" />
          </button>
        )}

        <Composer conversationId={conversation.id} />
      </div>

      {panel?.type === 'info' && <ConversationInfoPanel conversation={conversation} open onClose={chat.closePanel} />}
      {panel?.type === 'thread' && (
        <ThreadPanel conversation={conversation} rootId={panel.rootId} myId={chat.user.id} actions={chat.actions} onClose={chat.closePanel} />
      )}
      {panel?.type === 'tasks' && <TasksPanel conversation={conversation} prefill={panel.prefill} onClose={chat.closePanel} />}

      {chat.lightbox && (
        <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-teal-950/90 p-4" role="dialog" aria-label="Imagen" onClick={chat.closeImage}>
          <button type="button" onClick={chat.closeImage} aria-label="Cerrar imagen" className="absolute top-4 right-4 flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <X className="size-6" />
          </button>
          <img src={chat.lightbox} alt="Imagen ampliada" className="max-h-full max-w-full animate-pop rounded-lg object-contain shadow-pop" />
        </div>
      )}
    </div>
  );
}
