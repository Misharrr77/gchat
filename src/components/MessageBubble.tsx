import { useAuth } from '../contexts/AuthContext';
import Avatar from './Avatar';
import { Message } from '../types';
import { format, parseISO } from 'date-fns';

interface Props {
  message: Message;
  showAvatar: boolean;
  onImageClick: (url: string) => void;
  isGroup?: boolean;
}

export default function MessageBubble({ message, showAvatar, onImageClick, isGroup }: Props) {
  const { user } = useAuth();
  const isMine = message.sender_id === user?.id;
  const time = (() => { try { return format(parseISO(message.created_at), 'HH:mm'); } catch { return ''; } })();

  return (
    <div className={`flex gap-2 ${isMine ? 'justify-end' : ''} ${showAvatar ? 'mt-3' : 'mt-0.5'}`}>
      {!isMine && (
        <div className="w-8 flex-shrink-0">
          {showAvatar && <Avatar src={message.sender_avatar} name={message.sender_display_name || message.sender_username} size={32} />}
        </div>
      )}
      <div className={`max-w-[75%] min-w-[80px] ${isMine ? 'order-1' : ''}`}>
        {showAvatar && !isMine && isGroup && <p className="text-xs text-accent mb-0.5 pl-1">{message.sender_display_name || message.sender_username}</p>}
        <div className={`rounded-2xl px-3 py-2 ${isMine ? 'bg-accent text-white rounded-br-md' : 'bg-dark-700 text-slate-100 rounded-bl-md'}`}>
          {message.type === 'image' && message.media_url && (
            <img src={message.media_url} alt="" className="rounded-lg max-w-full max-h-64 object-cover mb-1 cursor-pointer" onClick={() => onImageClick(message.media_url!)} />
          )}
          {message.type === 'audio' && message.media_url && (
            <audio src={message.media_url} controls className="max-w-full mb-1" />
          )}
          {message.type === 'video' && message.media_url && (
            <video src={message.media_url} controls className="rounded-lg max-w-full max-h-64 mb-1" />
          )}
          {message.content && <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>}
          <p className={`text-[10px] mt-0.5 text-right ${isMine ? 'text-white/50' : 'text-slate-500'}`}>{time}</p>
        </div>
      </div>
    </div>
  );
}
