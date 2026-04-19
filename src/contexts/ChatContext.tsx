import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { api } from '../lib/api';
import { connectSocket, disconnectSocket, isSocketConnected } from '../lib/socket';
import { useAuth } from './AuthContext';
import { Conversation, Message, StoryGroup, User } from '../types';
import { playNotificationSound } from '../lib/sounds';

function mergeUserIntoConversations(prev: Conversation[], u: User): Conversation[] {
  return prev.map(c => ({
    ...c,
    otherUser: c.otherUser?.id === u.id ? { ...c.otherUser, ...u } : c.otherUser,
    members: c.members?.map(m => (m.id === u.id ? { ...m, ...u } : m)),
  }));
}

function mergeUserIntoMessages(prev: Message[], u: User): Message[] {
  return prev.map(m =>
    m.sender_id === u.id
      ? {
          ...m,
          sender_display_name: u.display_name,
          sender_username: u.username,
          sender_avatar: u.avatar,
          sender_video_avatar: u.video_avatar,
        }
      : m
  );
}

interface Ctx {
  conversations: Conversation[];
  active: Conversation | null;
  messages: Message[];
  loadingConvs: boolean;
  loadingMsgs: boolean;
  typingUsers: Map<string, Set<string>>;
  onlineUsers: Set<string>;
  stories: StoryGroup[];
  socketOk: boolean;
  replyTo: Message | null;
  setReplyTo: (m: Message | null) => void;
  setActive: (c: Conversation | null) => void;
  sendMessage: (content: string, type?: string, mediaUrl?: string, replyToId?: string | null, postAsChannel?: boolean) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  startConversation: (userId: string) => Promise<Conversation>;
  refresh: () => Promise<void>;
  refreshStories: () => Promise<void>;
}

const ChatContext = createContext<Ctx | null>(null);
export function useChat() {
  const c = useContext(ChatContext);
  if (!c) throw new Error('useChat requires ChatProvider');
  return c;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user, updateUser } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<string, Set<string>>>(new Map());
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [socketOk, setSocketOk] = useState(false);
  const activeRef = useRef<Conversation | null>(null);
  const userIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const typingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  useEffect(() => {
    userIdRef.current = user?.id || null;
  }, [user?.id]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    setReplyTo(null);
  }, [active?.id]);

  const refresh = useCallback(async () => {
    try {
      const d = await api.conversations.list();
      setConversations(d.conversations);
    } catch {}
    setLoadingConvs(false);
  }, []);

  const refreshStories = useCallback(async () => {
    try {
      const d = await api.stories.list();
      setStories(d.stories);
    } catch {}
  }, []);

  // Main socket effect - connect and subscribe
  useEffect(() => {
    if (!user?.id) {
      disconnectSocket();
      setConversations([]);
      setMessages([]);
      setStories([]);
      setLoadingConvs(true);
      setSocketOk(false);
      return;
    }
    const token = localStorage.getItem('gchat_token');
    if (!token) return;

    const socket = connectSocket(token);

    socket.off('connect');
    socket.off('disconnect');
    socket.off('message:new');
    socket.off('message:reaction');
    socket.off('user:updated');
    socket.off('conversation:new');
    socket.off('conversation:removed');
    socket.off('user:online');
    socket.off('user:typing');
    socket.off('user:typing:stop');
    socket.off('story:new');

    socket.on('connect', () => {
      console.log('[GChat] Socket connected, id:', socket.id, 'transport:', socket.io.engine.transport.name);
      setSocketOk(true);
    });

    socket.on('disconnect', (reason) => {
      console.log('[GChat] Socket disconnected:', reason);
      setSocketOk(false);
    });

    socket.on('message:new', (msg: Message) => {
      const viewing = activeRef.current?.id === msg.conversation_id;
      const fromOther = msg.sender_id !== userIdRef.current;
      setConversations(p => {
        const u = p.map(c => {
          if (c.id !== msg.conversation_id) return c;
          const unread = viewing ? 0 : (c.unread_count || 0) + (fromOther ? 1 : 0);
          return {
            ...c,
            last_message: msg.content,
            last_message_type: msg.type,
            last_message_at: msg.created_at,
            last_message_sender_id: msg.sender_id,
            unread_count: unread,
          };
        });
        return u.sort(
          (a, b) =>
            new Date(b.last_message_at || b.created_at).getTime() - new Date(a.last_message_at || a.created_at).getTime()
        );
      });

      if (activeRef.current?.id === msg.conversation_id) {
        setMessages(p => {
          if (p.some(m => m.id === msg.id)) return p;
          return [...p, msg];
        });
        api.conversations.markRead(msg.conversation_id).catch(() => {});
      }

      if (msg.sender_id !== userIdRef.current) {
        playNotificationSound();
      }
    });

    socket.on('message:reaction', ({ conversationId, messageId, reactions }: { conversationId: string; messageId: string; reactions: Message['reactions'] }) => {
      if (activeRef.current?.id !== conversationId) return;
      setMessages(p => p.map(m => (m.id === messageId ? { ...m, reactions: reactions || [] } : m)));
    });

    socket.on('user:updated', ({ user: u }: { user: User }) => {
      setConversations(p => mergeUserIntoConversations(p, u));
      setActive(a => {
        if (!a) return a;
        if (a.otherUser?.id === u.id) return { ...a, otherUser: { ...a.otherUser, ...u } };
        if (a.members?.some(m => m.id === u.id)) {
          return { ...a, members: a.members.map(m => (m.id === u.id ? { ...m, ...u } : m)) };
        }
        return a;
      });
      setMessages(p => mergeUserIntoMessages(p, u));
      if (u.id === userIdRef.current) updateUser(u);
      refreshStories();
    });

    socket.on('conversation:new', (conv: Conversation) => {
      setConversations(p => (p.some(c => c.id === conv.id) ? p : [conv, ...p]));
    });

    socket.on('conversation:removed', ({ conversationId }: { conversationId: string }) => {
      setConversations(p => p.filter(c => c.id !== conversationId));
      if (activeRef.current?.id === conversationId) setActive(null);
    });

    socket.on('user:online', ({ userId, online }: { userId: string; online: boolean }) => {
      setOnlineUsers(p => {
        const n = new Set(p);
        online ? n.add(userId) : n.delete(userId);
        return n;
      });
      setConversations(p =>
        p.map(c =>
          c.otherUser?.id === userId ? { ...c, otherUser: { ...c.otherUser!, is_online: online ? 1 : 0 } } : c
        )
      );
    });

    socket.on('user:typing', ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      const key = `${conversationId}:${userId}`;
      const prev = typingTimeoutsRef.current.get(key);
      if (prev) clearTimeout(prev);
      setTypingUsers(p => {
        const n = new Map(p);
        if (!n.has(conversationId)) n.set(conversationId, new Set());
        n.get(conversationId)!.add(userId);
        return n;
      });
      const t = setTimeout(() => {
        typingTimeoutsRef.current.delete(key);
        setTypingUsers(pp => {
          const nn = new Map(pp);
          nn.get(conversationId)?.delete(userId);
          return nn;
        });
      }, 7000);
      typingTimeoutsRef.current.set(key, t);
    });

    socket.on('user:typing:stop', ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      const key = `${conversationId}:${userId}`;
      const prev = typingTimeoutsRef.current.get(key);
      if (prev) clearTimeout(prev);
      typingTimeoutsRef.current.delete(key);
      setTypingUsers(pp => {
        const nn = new Map(pp);
        nn.get(conversationId)?.delete(userId);
        return nn;
      });
    });

    socket.on('story:new', () => refreshStories());

    refresh();
    refreshStories();

    return () => {
      typingTimeoutsRef.current.forEach(t => clearTimeout(t));
      typingTimeoutsRef.current.clear();
      socket.off('connect');
      socket.off('disconnect');
      socket.off('message:new');
      socket.off('message:reaction');
      socket.off('user:updated');
      socket.off('conversation:new');
      socket.off('conversation:removed');
      socket.off('user:online');
      socket.off('user:typing');
      socket.off('user:typing:stop');
      socket.off('story:new');
    };
  }, [user?.id, refresh, refreshStories, updateUser]);

  useEffect(() => {
    if (!active?.id || !user?.id) return;
    let cancelled = false;
    api.conversations
      .markRead(active.id)
      .then(() => {
        if (cancelled) return;
        setConversations(p => p.map(c => (c.id === active.id ? { ...c, unread_count: 0 } : c)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [active?.id, user?.id]);

  useEffect(() => {
    if (!active?.id || !user?.id) return;
    const interval = setInterval(() => {
      if (!isSocketConnected()) {
        const cid = activeRef.current?.id;
        if (!cid) return;
        api.messages
          .list(cid)
          .then(d => {
            if (activeRef.current?.id !== cid) return;
            const current = messagesRef.current;
            const hasNew = d.messages.some((m: Message) => !current.some(c => c.id === m.id));
            if (hasNew) setMessages(d.messages);
          })
          .catch(() => {});
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [active?.id, user?.id]);

  useEffect(() => {
    if (!active) {
      setMessages([]);
      return;
    }
    const cid = active.id;
    setLoadingMsgs(true);
    let cancelled = false;
    api.messages
      .list(cid)
      .then(d => {
        if (cancelled || activeRef.current?.id !== cid) return;
        setMessages(d.messages);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled && activeRef.current?.id === cid) setLoadingMsgs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active?.id]);

  const sendMessage = useCallback(async (content: string, type = 'text', mediaUrl?: string, replyToId?: string | null, postAsChannel?: boolean) => {
    if (!activeRef.current) return;
    const convId = activeRef.current.id;
    try {
      const { message } = await api.messages.send({
        conversationId: convId,
        content,
        type,
        mediaUrl,
        ...(replyToId ? { replyToId } : {}),
        ...(postAsChannel !== undefined ? { postAsChannel } : {}),
      });
      setReplyTo(null);
      setMessages(p => {
        if (p.some(m => m.id === message.id)) return p;
        return [...p, message];
      });
    } catch (err) {
      console.error('[GChat] Send message failed:', err);
      throw err;
    }
  }, []);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    try {
      const { reactions } = await api.messages.toggleReaction(messageId, emoji);
      setMessages(p => p.map(m => (m.id === messageId ? { ...m, reactions } : m)));
    } catch (err) {
      console.error('[GChat] toggleReaction:', err);
    }
  }, []);

  const startConversation = useCallback(async (userId: string) => {
    const d = await api.conversations.create(userId);
    setConversations(p => (p.some(c => c.id === d.conversation.id) ? p : [d.conversation, ...p]));
    return d.conversation;
  }, []);

  return (
    <ChatContext.Provider
      value={{
        conversations,
        active,
        messages,
        loadingConvs,
        loadingMsgs,
        typingUsers,
        onlineUsers,
        stories,
        socketOk,
        replyTo,
        setReplyTo,
        setActive,
        sendMessage,
        toggleReaction,
        startConversation,
        refresh,
        refreshStories,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
