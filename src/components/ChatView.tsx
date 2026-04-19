import { useRef, useEffect, useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import GroupProfileModal from './GroupProfileModal';
import Avatar from './Avatar';
import { api } from '../lib/api';
import { QUICK_REACTIONS } from '../lib/reactions';
import { ArrowLeft, Users, Radio, Info, Star, X, Reply } from 'lucide-react';
import { User, Message } from '../types';

interface Props {
  onBack: () => void;
  onProfile: (u: User) => void;
  isMobile: boolean;
}

function reactionAgg(msg: Message, myId: string | undefined) {
  const r = msg.reactions || [];
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
  r.forEach(x => {
    const prev = map.get(x.emoji) || { emoji: x.emoji, count: 0, mine: false };
    prev.count++;
    if (x.user_id === myId) prev.mine = true;
    map.set(x.emoji, prev);
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export default function ChatView({ onBack, onProfile, isMobile }: Props) {
  const { user: me } = useAuth();
  const { active, messages, loadingMsgs, typingUsers, onlineUsers, setReplyTo, toggleReaction, patchMessage } = useChat();
  const endRef = useRef<HTMLDivElement>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [showGroupProfile, setShowGroupProfile] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  const selectedMsg = useMemo(() => messages.find(m => m.id === selectedId) || null, [messages, selectedId]);
  const selectedAgg = useMemo(
    () => (selectedMsg ? reactionAgg(selectedMsg, me?.id) : []),
    [selectedMsg, me?.id]
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

  const pickMessage = (msg: Message) => {
    setSelectedId(cur => (cur === msg.id ? null : msg.id));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-dark-800 border-b border-dark-600 flex-shrink-0">
        <button onClick={onBack} className={`p-2 hover:bg-dark-700 rounded-xl text-slate-400 flex-shrink-0 ${isMobile ? '' : 'hidden'}`}>
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={onHeaderClick}>
          <Avatar src={active.avatar} name={active.name || ''} size={40} online={isDirect ? isOnline : undefined} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {isChannel && <Radio size={13} className="text-accent flex-shrink-0" />}
              {isGroup && <Users size={13} className="text-accent flex-shrink-0" />}
              <h3 className="font-semibold text-white text-sm truncate">{active.name}</h3>
            </div>
            <p className="text-xs leading-tight">{subtitle()}</p>
          </div>
        </div>
        {(isGroup || isChannel) && (
          <button onClick={() => setShowGroupProfile(true)} className="p-2 hover:bg-dark-700 rounded-xl text-slate-400 flex-shrink-0">
            <Info size={18} />
          </button>
        )}
      </div>

      <div
        className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5 min-h-0"
        onClick={() => setSelectedId(null)}
        role="presentation"
      >
        {loadingMsgs ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full"><p className="text-slate-500 text-sm">{isChannel ? 'Нет публикаций' : 'Нет сообщений'}</p></div>
        ) : (
          messages.map((msg, i) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              showAvatar={
                !i ||
                messages[i - 1].sender_id !== msg.sender_id ||
                !!(messages[i - 1].as_channel ?? false) !== !!(msg.as_channel ?? false)
              }
              onImageClick={setImgPreview}
              showSenderNames={isGroup || isChannel}
              isSelected={selectedId === msg.id}
              onSelect={() => pickMessage(msg)}
            />
          ))
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
            title="Снять выделение"
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
          <div className="flex flex-wrap items-center gap-1 pl-1 border-l border-dark-600 ml-0.5">
            {selectedAgg.map(a => (
              <button
                key={a.emoji}
                type="button"
                onClick={() => toggleReaction(selectedMsg.id, a.emoji)}
                className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-full text-xs border transition ${
                  a.mine ? 'border-accent bg-accent/25 text-white' : 'border-dark-500 bg-dark-700 text-slate-300 hover:bg-dark-600'
                }`}
              >
                <span>{a.emoji}</span>
                <span className="text-[10px] opacity-80">{a.count}</span>
              </button>
            ))}
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
        <div className="border-t border-dark-600 bg-dark-800 px-4 py-3 text-center text-sm text-slate-500">Только админы могут писать</div>
      )}

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
