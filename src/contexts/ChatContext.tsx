import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { api } from '../lib/api';
import { connectSocket, disconnectSocket, isSocketConnected } from '../lib/socket';
import { useAuth } from './AuthContext';
import { Conversation, Message, StoryGroup } from '../types';
import { playNotificationSound } from '../lib/sounds';

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
  setActive: (c: Conversation | null) => void;
  sendMessage: (content: string, type?: string, mediaUrl?: string) => Promise<void>;
  startConversation: (userId: string) => Promise<Conversation>;
  refresh: () => Promise<void>;
  refreshStories: () => Promise<void>;
}

const ChatContext = createContext<Ctx | null>(null);
export function useChat() { const c = useContext(ChatContext); if (!c) throw new Error('useChat requires ChatProvider'); return c; }

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<string, Set<string>>>(new Map());
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [socketOk, setSocketOk] = useState(false);
  const activeRef = useRef<Conversation | null>(null);
  const userIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { userIdRef.current = user?.id || null; }, [user?.id]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const refresh = useCallback(async () => {
    try { const d = await api.conversations.list(); setConversations(d.conversations); } catch {}
    setLoadingConvs(false);
  }, []);

  const refreshStories = useCallback(async () => {
    try { const d = await api.stories.list(); setStories(d.stories); } catch {}
  }, []);

  // Main socket effect - connect and subscribe
  useEffect(() => {
    if (!user?.id) {
      disconnectSocket();
      setConversations([]); setMessages([]); setStories([]);
      setLoadingConvs(true);
      setSocketOk(false);
      return;
    }
    const token = localStorage.getItem('gchat_token');
    if (!token) return;

    const socket = connectSocket(token);

    // Remove only our custom event handlers, not internal ones
    socket.off('connect');
    socket.off('disconnect');
    socket.off('message:new');
    socket.off('conversation:new');
    socket.off('conversation:removed');
    socket.off('user:online');
    socket.off('user:typing');
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
      console.log('[GChat] message:new received:', msg.id, 'for conv:', msg.conversation_id);

      // Always update conversation list
      setConversations(p => {
        const u = p.map(c => c.id === msg.conversation_id
          ? { ...c, last_message: msg.content, last_message_type: msg.type, last_message_at: msg.created_at, last_message_sender_id: msg.sender_id }
          : c);
        return u.sort((a, b) => new Date(b.last_message_at || b.created_at).getTime() - new Date(a.last_message_at || a.created_at).getTime());
      });

      // Add to messages if this conversation is active
      if (activeRef.current?.id === msg.conversation_id) {
        setMessages(p => {
          if (p.some(m => m.id === msg.id)) return p;
          return [...p, msg];
        });
      }

      // Sound for messages from others
      if (msg.sender_id !== userIdRef.current) {
        playNotificationSound();
      }
    });

    socket.on('conversation:new', (conv: Conversation) => {
      setConversations(p => p.some(c => c.id === conv.id) ? p : [conv, ...p]);
    });

    socket.on('conversation:removed', ({ conversationId }: { conversationId: string }) => {
      setConversations(p => p.filter(c => c.id !== conversationId));
      if (activeRef.current?.id === conversationId) setActive(null);
    });

    socket.on('user:online', ({ userId, online }: { userId: string; online: boolean }) => {
      setOnlineUsers(p => { const n = new Set(p); online ? n.add(userId) : n.delete(userId); return n; });
      setConversations(p => p.map(c => c.otherUser?.id === userId ? { ...c, otherUser: { ...c.otherUser!, is_online: online ? 1 : 0 } } : c));
    });

    socket.on('user:typing', ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      setTypingUsers(p => {
        const n = new Map(p);
        if (!n.has(conversationId)) n.set(conversationId, new Set());
        n.get(conversationId)!.add(userId);
        setTimeout(() => setTypingUsers(pp => { const nn = new Map(pp); nn.get(conversationId)?.delete(userId); return nn; }), 3000);
        return n;
      });
    });

    socket.on('story:new', () => refreshStories());

    refresh();
    refreshStories();

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('message:new');
      socket.off('conversation:new');
      socket.off('conversation:removed');
      socket.off('user:online');
      socket.off('user:typing');
      socket.off('story:new');
    };
  }, [user?.id]);

  // Fallback polling: if socket is down, poll for messages every 4s
  useEffect(() => {
    if (!active?.id || !user?.id) return;
    const interval = setInterval(() => {
      if (!isSocketConnected()) {
        console.log('[GChat] Socket down, polling messages...');
        api.messages.list(active.id).then(d => {
          const current = messagesRef.current;
          const hasNew = d.messages.some((m: Message) => !current.some(c => c.id === m.id));
          if (hasNew) setMessages(d.messages);
        }).catch(() => {});
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [active?.id, user?.id]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!active) { setMessages([]); return; }
    setLoadingMsgs(true);
    api.messages.list(active.id).then(d => setMessages(d.messages)).catch(() => {}).finally(() => setLoadingMsgs(false));
  }, [active?.id]);

  const sendMessage = useCallback(async (content: string, type = 'text', mediaUrl?: string) => {
    if (!activeRef.current) return;
    const convId = activeRef.current.id;
    try {
      const { message } = await api.messages.send({ conversationId: convId, content, type, mediaUrl });
      console.log('[GChat] Message sent via API:', message.id);
      setMessages(p => {
        if (p.some(m => m.id === message.id)) return p;
        return [...p, message];
      });
    } catch (err) {
      console.error('[GChat] Send message failed:', err);
      throw err;
    }
  }, []);

  const startConversation = useCallback(async (userId: string) => {
    const d = await api.conversations.create(userId);
    setConversations(p => p.some(c => c.id === d.conversation.id) ? p : [d.conversation, ...p]);
    return d.conversation;
  }, []);

  return (
    <ChatContext.Provider value={{ conversations, active, messages, loadingConvs, loadingMsgs, typingUsers, onlineUsers, stories, socketOk, setActive, sendMessage, startConversation, refresh, refreshStories }}>
      {children}
    </ChatContext.Provider>
  );
}
