import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { api } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';
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
  const activeRef = useRef<Conversation | null>(null);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { userIdRef.current = user?.id || null; }, [user?.id]);

  const refresh = useCallback(async () => {
    try { const d = await api.conversations.list(); setConversations(d.conversations); } catch {}
    setLoadingConvs(false);
  }, []);

  const refreshStories = useCallback(async () => {
    try { const d = await api.stories.list(); setStories(d.stories); } catch {}
  }, []);

  useEffect(() => {
    if (!user?.id) {
      disconnectSocket();
      setConversations([]); setMessages([]); setStories([]);
      setLoadingConvs(true);
      return;
    }
    const token = localStorage.getItem('gchat_token');
    if (!token) return;

    const socket = connectSocket(token);
    socket.removeAllListeners();

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
    });

    socket.on('message:new', (msg: Message) => {
      if (activeRef.current?.id === msg.conversation_id) {
        setMessages(p => p.some(m => m.id === msg.id) ? p : [...p, msg]);
      }
      setConversations(p => {
        const u = p.map(c => c.id === msg.conversation_id
          ? { ...c, last_message: msg.content, last_message_type: msg.type, last_message_at: msg.created_at, last_message_sender_id: msg.sender_id }
          : c);
        return u.sort((a, b) => new Date(b.last_message_at || b.created_at).getTime() - new Date(a.last_message_at || a.created_at).getTime());
      });
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
      // Don't disconnect socket on cleanup - only remove listeners
      // Socket persists for reconnection. Disconnect only on logout (user becomes null).
    };
  }, [user?.id]); // Only re-run when user ID changes (login/logout), not on profile updates

  useEffect(() => {
    if (!active) { setMessages([]); return; }
    setLoadingMsgs(true);
    api.messages.list(active.id).then(d => setMessages(d.messages)).catch(() => {}).finally(() => setLoadingMsgs(false));
  }, [active?.id]);

  const sendMessage = useCallback(async (content: string, type = 'text', mediaUrl?: string) => {
    if (!activeRef.current) return;
    const { message } = await api.messages.send({ conversationId: activeRef.current.id, content, type, mediaUrl });
    setMessages(p => p.some(m => m.id === message.id) ? p : [...p, message]);
  }, []);

  const startConversation = useCallback(async (userId: string) => {
    const d = await api.conversations.create(userId);
    setConversations(p => p.some(c => c.id === d.conversation.id) ? p : [d.conversation, ...p]);
    return d.conversation;
  }, []);

  return (
    <ChatContext.Provider value={{ conversations, active, messages, loadingConvs, loadingMsgs, typingUsers, onlineUsers, stories, setActive, sendMessage, startConversation, refresh, refreshStories }}>
      {children}
    </ChatContext.Provider>
  );
}
