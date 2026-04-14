import { useRef, useEffect, useState } from 'react';
import { useChat } from '../contexts/ChatContext';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import Avatar from './Avatar';
import { ArrowLeft } from 'lucide-react';
import { User } from '../types';

interface Props {
  onBack: () => void;
  onProfile: (u: User) => void;
}

export default function ChatView({ onBack, onProfile }: Props) {
  const { active, messages, loadingMsgs, typingUsers, onlineUsers } = useChat();
  const endRef = useRef<HTMLDivElement>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  if (!active) return null;

  const other = active.otherUser;
  const isOnline = other ? (onlineUsers.has(other.id) || other.is_online === 1) : false;
  const isTyping = (typingUsers.get(active.id)?.size ?? 0) > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 bg-dark-800 border-b border-dark-600 flex-shrink-0">
        <button onClick={onBack} className="md:hidden p-1.5 hover:bg-dark-700 rounded-lg text-slate-400"><ArrowLeft size={20} /></button>
        <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => other && onProfile(other)}>
          <Avatar src={active.avatar} name={active.name || ''} size={40} online={isOnline} />
          <div className="min-w-0">
            <h3 className="font-semibold text-white text-sm truncate">{active.name}</h3>
            <p className={`text-xs ${isTyping ? 'text-accent' : isOnline ? 'text-green-400' : 'text-slate-500'}`}>
              {isTyping ? 'печатает...' : isOnline ? 'в сети' : 'не в сети'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {loadingMsgs ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full"><p className="text-slate-500 text-sm">Нет сообщений. Напишите первым!</p></div>
        ) : messages.map((msg, i) => (
          <MessageBubble key={msg.id} message={msg} showAvatar={!i || messages[i - 1].sender_id !== msg.sender_id} onImageClick={setImgPreview} />
        ))}
        <div ref={endRef} />
      </div>

      <MessageInput />

      {imgPreview && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 cursor-pointer" onClick={() => setImgPreview(null)}>
          <img src={imgPreview} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}
