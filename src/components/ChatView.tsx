import { useRef, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import GroupProfileModal from './GroupProfileModal';
import Avatar from './Avatar';
import { ArrowLeft, Users, Radio, Info } from 'lucide-react';
import { User } from '../types';

interface Props { onBack: () => void; onProfile: (u: User) => void; isMobile: boolean; }

export default function ChatView({ onBack, onProfile, isMobile }: Props) {
  const { user: me } = useAuth();
  const { active, messages, loadingMsgs, typingUsers, onlineUsers } = useChat();
  const endRef = useRef<HTMLDivElement>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [showGroupProfile, setShowGroupProfile] = useState(false);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  if (!active) return null;

  const other = active.otherUser;
  const isOnline = other ? (onlineUsers.has(other.id) || other.is_online === 1) : false;
  const isTyping = (typingUsers.get(active.id)?.size ?? 0) > 0;
  const isChannel = active.type === 'channel';
  const isGroup = active.type === 'group';
  const isDirect = active.type === 'direct';
  const myRole = active.members?.find(m => m.id === me?.id)?.role;
  const canWrite = !isChannel || myRole === 'admin';

  const subtitle = () => {
    if (isTyping) return <span className="text-accent">печатает...</span>;
    if (isDirect) return <span className={isOnline ? 'text-green-400' : 'text-slate-500'}>{isOnline ? 'в сети' : 'не в сети'}</span>;
    return <span className="text-slate-400">{active.member_count} участник(ов)</span>;
  };

  const onHeaderClick = () => {
    if (isDirect && other) onProfile(other);
    else if (isGroup || isChannel) setShowGroupProfile(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {loadingMsgs ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full"><p className="text-slate-500 text-sm">{isChannel ? 'Нет публикаций' : 'Нет сообщений'}</p></div>
        ) : messages.map((msg, i) => (
          <MessageBubble key={msg.id} message={msg} showAvatar={!i || messages[i - 1].sender_id !== msg.sender_id} onImageClick={setImgPreview} isGroup={isGroup || isChannel} />
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      {canWrite ? <MessageInput /> : (
        <div className="border-t border-dark-600 bg-dark-800 px-4 py-3 text-center text-sm text-slate-500">Только админы могут писать</div>
      )}

      {/* Image preview overlay */}
      {imgPreview && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 cursor-pointer" onClick={() => setImgPreview(null)}>
          <img src={imgPreview} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}

      {showGroupProfile && <GroupProfileModal conversation={active} onClose={() => setShowGroupProfile(false)} />}
    </div>
  );
}
