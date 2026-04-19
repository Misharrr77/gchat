import { useRef, useEffect, useLayoutEffect, useState, useMemo } from 'react';
import { formatChatDaySeparatorLabel, getKaliningradDateKey } from '../lib/datetime';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import GroupProfileModal from './GroupProfileModal';
import GroupTopicsGate from './GroupTopicsGate';
import Avatar from './Avatar';
import { api } from '../lib/api';
import { QUICK_REACTIONS } from '../lib/reactions';
import { ArrowLeft, Users, Radio, Info, Star, X, Reply, Pin } from 'lucide-react';
import { User, Message } from '../types';

interface Props {
  onBack: () => void;
  onProfile: (u: User) => void;
  isMobile: boolean;
}

export default function ChatView({ onBack, onProfile, isMobile }: Props) {
  const { user: me } = useAuth();
  const {
    active,
    messages,
    loadingMsgs,
    typingUsers,
    onlineUsers,
    setReplyTo,
    toggleReaction,
    patchMessage,
    pins,
    refreshPins,
    pendingScrollMessageId,
    clearPendingScroll,
    scrollToMessageInChat,
    activeTopicId,
    selectGroupTopic,
    loadOlderMessages,
    loadingOlder,
  } = useChat();
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevFirstMsgIdRef = useRef<string | undefined>(undefined);
  const suppressAutoScrollUntil = useRef(0);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [showGroupProfile, setShowGroupProfile] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    prevFirstMsgIdRef.current = undefined;
  }, [active?.id, activeTopicId]);

  /** Сразу вниз без анимации; при подгрузке старых сверху — не дёргать вниз */
  useLayoutEffect(() => {
    if (pendingScrollMessageId) return;
    if (Date.now() < suppressAutoScrollUntil.current) return;
    const el = scrollRef.current;
    if (!el || messages.length === 0) return;

    const firstId = messages[0]?.id;
    const prevFirst = prevFirstMsgIdRef.current;
    prevFirstMsgIdRef.current = firstId;

    const prependedOlder = prevFirst !== undefined && firstId !== undefined && firstId !== prevFirst;
    if (prependedOlder) return;

    el.scrollTop = el.scrollHeight;
  }, [messages, pendingScrollMessageId, active?.id]);

  useEffect(() => {
    if (!pendingScrollMessageId || loadingMsgs) return;
    const id = pendingScrollMessageId;
    const t = window.setTimeout(() => {
      const el = document.getElementById(`msg-${id}`);
      if (el) {
        suppressAutoScrollUntil.current = Date.now() + 1200;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        clearPendingScroll();
      }
    }, 50);
    return () => clearTimeout(t);
  }, [pendingScrollMessageId, loadingMsgs, messages, clearPendingScroll]);

  useEffect(() => {
    setSelectedId(null);
  }, [active?.id]);

  if (!active) return null;

  const other = active.otherUser;
  const isOnline = other ? (onlineUsers.has(other.id) || other.is_online === 1) : false;
  const typingIds = Array.from(typingUsers.get(active.id) || []);
  const isTyping = typingIds.length > 0;
  const isChannel = active.type === 'channel';
  const isGroup = active.type === 'group';
  const isDirect = active.type === 'direct';
  const myRole = active.members?.find(m => m.id === me?.id)?.role;
  const canWrite = !isChannel || myRole === 'admin';
  const canPin = isDirect || myRole === 'admin';

  const selectedMsg = useMemo(() => messages.find(m => m.id === selectedId) || null, [messages, selectedId]);
  const selectedIsPinned = useMemo(
    () => !!selectedMsg && pins.some(p => p.message_id === selectedMsg.id),
    [pins, selectedMsg]
  );

  const nameForTypingId = (id: string) => {
    if (other && id === other.id) return other.display_name || other.username;
    const m = active.members?.find(x => x.id === id);
    return m?.display_name || m?.username || '…';
  };
  const typingNames = typingIds.map(nameForTypingId).filter(Boolean);

  const subtitle = () => {
    if (isTyping) {
      const t =
        typingNames.length === 1
          ? `${typingNames[0]} печатает…`
          : typingNames.length > 1
            ? `${typingNames.slice(0, 3).join(', ')}${typingNames.length > 3 ? '…' : ''} печатают…`
            : 'печатает…';
      return <span className="text-accent truncate block max-w-[200px] sm:max-w-md">{t}</span>;
    }
    if (isDirect) return <span className={isOnline ? 'text-green-400' : 'text-slate-500'}>{isOnline ? 'в сети' : 'не в сети'}</span>;
    return <span className="text-slate-400">{active.member_count} участник(ов)</span>;
  };

  const onHeaderClick = () => {
    if (isDirect && other) onProfile(other);
    else if (isGroup || isChannel) setShowGroupProfile(true);
  };

  const toggleSaved = async () => {
    if (!selectedMsg) return;
    try {
      if (selectedMsg.is_saved) {
        await api.saved.remove(selectedMsg.id);
        patchMessage(selectedMsg.id, { is_saved: false });
      } else {
        await api.saved.add(selectedMsg.id);
        patchMessage(selectedMsg.id, { is_saved: true });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const togglePin = async () => {
    if (!selectedMsg || !canPin) return;
    try {
      if (selectedIsPinned) {
        await api.conversations.unpin(active.id, selectedMsg.id);
      } else {
        await api.conversations.pin(active.id, selectedMsg.id);
      }
      await refreshPins();
    } catch (e) {
      console.error(e);
    }
  };

  const pickMessage = (msg: Message) => {
    setSelectedId(cur => (cur === msg.id ? null : msg.id));
  };

  const pinLabel = (m: Message) => {
    if (m.type === 'image') return '📷 Фото';
    if (m.type === 'video') return '🎬 Видео';
    if (m.type === 'audio') return '🎵 Аудио';
    return (m.content || 'Сообщение').trim().slice(0, 80) + ((m.content || '').length > 80 ? '…' : '');
  };

  type ChatRow =
    | { kind: 'day'; dk: string; label: string }
    | { kind: 'msg'; msg: Message; prev?: Message };

  const rowsWithDays = useMemo(() => {
    const out: ChatRow[] = [];
    let prevDayKey = '';
    let prevMsg: Message | undefined;
    for (const msg of messages) {
      const dk = getKaliningradDateKey(msg.created_at);
      if (dk !== prevDayKey) {
        prevDayKey = dk;
        out.push({ kind: 'day', dk, label: formatChatDaySeparatorLabel(msg.created_at) });
      }
      out.push({ kind: 'msg', msg, prev: prevMsg });
      prevMsg = msg;
    }
    return out;
  }, [messages]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-dark-800 border-b border-dark-600 flex-shrink-0">
        <button onClick={onBack} className={`p-2 hover:bg-dark-700 rounded-xl text-slate-400 flex-shrink-0 ${isMobile ? '' : 'hidden'}`}>
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={onHeaderClick}>
          <Avatar
            src={active.avatar}
            videoSrc={isDirect && other ? other.video_avatar : undefined}
            name={active.name || ''}
            size={40}
            online={isDirect ? isOnline : undefined}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {isChannel && <Radio size={13} className="text-accent flex-shrink-0" />}
              {isGroup && <Users size={13} className="text-accent flex-shrink-0" />}
              <h3 className="font-semibold text-white text-sm truncate">{active.name}</h3>
            </div>
            <p className="text-xs leading-tight">{subtitle()}</p>
          </div>
        </div>
        {isGroup && !!active.topics_enabled && activeTopicId ? (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              selectGroupTopic(null);
            }}
            className="text-xs font-medium text-accent hover:underline px-2 py-1 flex-shrink-0"
          >
            Темы
          </button>
        ) : null}
        {(isGroup || isChannel) && (
          <button onClick={() => setShowGroupProfile(true)} className="p-2 hover:bg-dark-700 rounded-xl text-slate-400 flex-shrink-0">
            <Info size={18} />
          </button>
        )}
      </div>

      {pins.length > 0 && (
        <div className="flex-shrink-0 border-b border-dark-600 bg-dark-800/95 px-2 py-2 overflow-x-auto">
          <div className="flex gap-2 min-w-min">
            {pins.map(p => (
              <button
                key={p.message_id}
                type="button"
                onClick={() => scrollToMessageInChat(p.message_id)}
                className="flex-shrink-0 max-w-[220px] text-left px-3 py-2 rounded-xl bg-dark-700/90 hover:bg-dark-600 border border-dark-500/80 transition group"
              >
                <div className="flex items-center gap-1.5 text-accent mb-0.5">
                  <Pin size={12} className="flex-shrink-0" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide">Закреп</span>
                </div>
                <p className="text-xs text-slate-200 line-clamp-2">{pinLabel(p.message)}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative flex-1 flex flex-col min-h-0">
        <GroupTopicsGate />
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5 min-h-0"
          onClick={() => setSelectedId(null)}
          onScroll={e => {
            if (e.currentTarget.scrollTop < 100) loadOlderMessages();
          }}
          role="presentation"
        >
          {loadingOlder && (
            <div className="flex justify-center py-2 mb-1">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin opacity-70" />
            </div>
          )}
          {loadingMsgs ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[120px]">
              <p className="text-slate-500 text-sm">{isChannel ? 'Нет публикаций' : 'Нет сообщений'}</p>
            </div>
          ) : (
            rowsWithDays.map(row =>
              row.kind === 'day' ? (
                <div key={`day-${row.dk}`} className="flex justify-center py-2.5 pointer-events-none select-none">
                  <span className="inline-flex items-center px-4 py-1 min-h-[28px] rounded-full bg-dark-700/95 border border-dark-600/90 text-[11px] font-semibold tracking-wide text-slate-400 shadow-md max-w-[90%] text-center">
                    {row.label}
                  </span>
                </div>
              ) : (
                <MessageBubble
                  key={row.msg.id}
                  message={row.msg}
                  showAvatar={
                    !row.prev ||
                    row.prev.sender_id !== row.msg.sender_id ||
                    !!(row.prev.as_channel ?? false) !== !!(row.msg.as_channel ?? false)
                  }
                  onImageClick={setImgPreview}
                  showSenderNames={isGroup || isChannel}
                  isSelected={selectedId === row.msg.id}
                  onSelect={() => pickMessage(row.msg)}
                  onToggleReaction={emoji => toggleReaction(row.msg.id, emoji)}
                />
              )
            )
          )}
          <div ref={endRef} />
        </div>

      {selectedMsg && (
        <div
          className="flex-shrink-0 border-t border-dark-600 bg-dark-800/98 px-3 py-2.5 flex flex-wrap items-center gap-2 shadow-[0_-8px_24px_rgba(0,0,0,0.35)]"
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-dark-700 transition"
            title="Сними выделение"
          >
            <X size={18} />
          </button>
          {canWrite && (
            <button
              type="button"
              onClick={() => {
                setReplyTo(selectedMsg);
                setSelectedId(null);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-dark-700 text-sm text-white hover:bg-dark-600 transition"
            >
              <Reply size={16} />
              Ответить
            </button>
          )}
          <button
            type="button"
            onClick={() => toggleSaved()}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition ${
              selectedMsg.is_saved ? 'bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/40' : 'bg-dark-700 text-slate-200 hover:bg-dark-600'
            }`}
          >
            <Star size={16} className={selectedMsg.is_saved ? 'fill-amber-300 text-amber-300' : ''} />
            {selectedMsg.is_saved ? 'В избранном' : 'В избранное'}
          </button>
          {canPin && (
            <button
              type="button"
              onClick={() => togglePin()}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition ${
                selectedIsPinned ? 'bg-accent/25 text-accent ring-1 ring-accent/40' : 'bg-dark-700 text-slate-200 hover:bg-dark-600'
              }`}
            >
              <Pin size={16} className={selectedIsPinned ? 'fill-accent' : ''} />
              {selectedIsPinned ? 'Открепить' : 'Закрепить'}
            </button>
          )}
          <div className="flex flex-wrap items-center gap-1 pl-1 border-l border-dark-600 ml-0.5">
            <span className="text-[10px] text-slate-500 uppercase mr-1">эмодзи</span>
            {QUICK_REACTIONS.map(e => (
              <button
                key={e}
                type="button"
                onClick={() => toggleReaction(selectedMsg.id, e)}
                className="w-9 h-9 rounded-full text-base border border-dark-600 bg-dark-700 hover:bg-dark-600 hover:border-accent/50 transition flex items-center justify-center"
                title={e}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

        {canWrite ? <MessageInput /> : (
          <div className="border-t border-dark-600 bg-dark-800 px-4 py-3 text-center text-sm text-slate-500 flex-shrink-0">
            Только админы могут писать
          </div>
        )}
      </div>

      {imgPreview && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 cursor-pointer" onClick={() => setImgPreview(null)}>
          <img src={imgPreview} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}

      {showGroupProfile && (
        <GroupProfileModal
          conversation={active}
          onClose={() => setShowGroupProfile(false)}
          onOpenMemberProfile={u => {
            setShowGroupProfile(false);
            onProfile(u);
          }}
        />
      )}
    </div>
  );
}
