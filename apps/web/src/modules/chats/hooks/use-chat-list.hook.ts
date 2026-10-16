import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { sortConversations, useChatStore } from '@shared/stores/chat.store';
import { useSessionStore } from '@shared/stores/session.store';
import { useWorkspaceStore } from '@shared/stores/workspace.store';
import { formatListTimestamp } from '@shared/utils/date';
import { errorMessage } from '@shared/utils/http';
import { matchesSearch } from '@shared/utils/text';
import { CHAT_FILTERS } from '../const/chats.const';
import type { ChatFilter, ChatListEntry, NewChatMode } from '../types/chats.types';
import { counterpart, previewFor, typingLabel } from '../utils/conversation-preview.utils';

export function useChatList() {
  const { workspaceId = '', conversationId } = useParams();
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user)!;
  const conversations = useChatStore((s) => s.conversations);
  const listStatus = useChatStore((s) => s.listStatus);
  const texts = useChatStore((s) => s.texts);
  const typing = useChatStore((s) => s.typing);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ChatFilter>('all');
  const [newChat, setNewChat] = useState<NewChatMode | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workspace = workspaces.find((w) => w.id === workspaceId) ?? null;

  const entries = useMemo<ChatListEntry[]>(() => {
    return sortConversations(conversations)
      .filter((c) => {
        if (filter === 'unread' && c.unreadCount === 0) return false;
        if (filter === 'groups' && c.kind !== 'group') return false;
        if (filter === 'direct' && c.kind !== 'direct') return false;
        const haystack = [c.title, ...c.participants.map((p) => p.user.displayName)].join(' ');
        return matchesSearch(haystack, search);
      })
      .map((conversation) => ({
        conversation,
        preview: previewFor(conversation, texts, user.id),
        time: formatListTimestamp(conversation.lastMessage?.createdAt ?? conversation.createdAt),
        typing: typingLabel(conversation, typing[conversation.id]),
        online: counterpart(conversation, user.id)?.presence === 'online',
        mine: conversation.lastMessage?.senderId === user.id && conversation.lastMessage.kind !== 'system',
      }));
  }, [conversations, texts, typing, filter, search, user.id]);

  const totalUnread = Object.values(conversations).reduce((sum, c) => sum + c.unreadCount, 0);

  return {
    user,
    workspace,
    workspaces,
    entries,
    activeId: conversationId ?? null,
    status: listStatus,
    error,
    search,
    filter,
    filters: CHAT_FILTERS,
    totalUnread,
    hasAnyConversation: Object.keys(conversations).length > 0,
    newChat,
    switcherOpen,
    onSearchChange: (value: string) => setSearch(value),
    clearSearch: () => setSearch(''),
    selectFilter: (value: ChatFilter) => setFilter(value),
    openNewChat: (mode: NewChatMode = 'direct') => setNewChat(mode),
    closeNewChat: () => setNewChat(null),
    toggleSwitcher: () => setSwitcherOpen((v) => !v),
    closeSwitcher: () => setSwitcherOpen(false),
    openConversation: (id: string) => navigate(`/app/w/${workspaceId}/c/${id}`),
    switchWorkspace: (id: string) => {
      setSwitcherOpen(false);
      navigate(`/app/w/${id}`);
    },
    retry: () => {
      setError(null);
      loadConversations(workspaceId).catch((err) => setError(errorMessage(err)));
    },
  };
}
