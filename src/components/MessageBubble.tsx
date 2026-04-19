import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Avatar from './Avatar';
import { Message } from '../types';
import { format, parseISO } from 'date-fns';
import { Reply, Radio, User } from 'lucide-react';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥'];

interface Props {
  message: Message;
  showAvatar: boolean;
  onImageClick: (url: string) => void;
  showSenderNames?: boolean;
  onReply?: () => void;
  onToggleReaction?: (emoji: string) => void;
}

export default function MessageBubble({
  message,
  showAvatar,
  onImageClick,
  showSenderNames,
  onReply,
  onToggleReaction,
}: Props) {
  const { user } = useAuth();
  const isMine = message.sender_id === user?.id;
  const asOfficial = !!(message.as_channel && message.channel_name);

  const time = (() => {
    try {
      return format(parseISO(message.created_at), 'HH:mm');
    } catch {
      return '';
    }
  })();

  const realName = message.sender_display_name || message.sender_username;
  const displayName = asOfficial ? message.channel_name || 'Канал' : realName;

  const agg = useMemo(() => {
    const r = message.reactions || [];
    const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
    r.forEach(x => {
      const prev = map.get(x.emoji) || { emoji: x.emoji, count: 0, mine: false };
      prev.count++;
      if (x.user_id === user?.id) prev.mine = true;
      map.set(x.emoji, prev);
    });
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [message.reactions, user?.id]);

  const previewSnippet = (rp: NonNullable<Message['reply_preview']>) => {
    if (rp.type !== 'text' && rp.content) return `[${rp.type}]`;
    const t = (rp.content || '').trim();
    return t.length > 72 ? `${t.slice(0, 72)}…` : t || '…';
  };

  const bubbleClass = asOfficial
    ? isMine
      ? 'bg-gradient-to-br from-accent via-accent to-indigo-600 text-white rounded-br-md ring-1 ring-white/20 shadow-lg shadow-black/25'
      : 'bg-dark-700 text-slate-100 rounded-bl-md border border-dark-500/80 ring-1 ring-accent/25'
    : isMine
      ? 'bg-accent text-white rounded-br-md'
      : 'bg-dark-700 text-slate-100 rounded-bl-md';

  return (
    <div className={`flex gap-2 group/msg ${isMine ? 'justify-end' : ''} ${showAvatar ? 'mt-3' : 'mt-0.5'}`}>
      {!isMine && (
        <div className="w-9 flex-shrink-0">
          {showAvatar && (
            <Avatar
              src={asOfficial ? message.channel_avatar : message.sender_avatar}
              videoSrc={asOfficial ? null : message.sender_video_avatar}
              name={displayName}
              size={34}
            />
          )}
        </div>
      )}
      <div className={`max-w-[80%] sm:max-w-[75%] min-w-[80px] ${isMine ? 'order-1' : ''}`}>
        {showAvatar && showSenderNames && (
          <div className={`flex items-center gap-1 mb-1 ${isMine ? 'justify-end text-right pr-0.5' : 'pl-0.5'}`}>
            {asOfficial && <Radio size={12} className="text-accent flex-shrink-0 opacity-90" />}
            <span className="text-xs font-semibold text-accent truncate">{displayName}</span>
            {asOfficial && (
              <span className="text-[9px] uppercase tracking-wide font-medium px-1.5 py-px rounded bg-accent/25 text-accent/95 border border-accent/30 flex-shrink-0">
                канал
              </span>
            )}
          </div>
        )}
        {asOfficial && showSenderNames && (
          <p className={`text-[10px] text-slate-500 mb-1 ${isMine ? 'text-right pr-0.5' : 'pl-0.5'}`}>
            <User size={10} className="inline mr-0.5 opacity-70 relative -top-px" />
            <span className="opacity-90">{realName}</span>
          </p>
        )}
        <div className={`rounded-2xl px-3.5 py-2.5 ${bubbleClass}`}>
          {message.reply_preview && (
            <div
              className={`mb-2 rounded-lg px-2.5 py-2 border-l-2 border-accent/90 bg-black/20 ${
                isMine && !asOfficial ? 'bg-white/10' : ''
              }`}
            >
              <p className="text-[10px] font-semibold text-white/90 truncate">
                {message.reply_preview.sender_display_name || message.reply_preview.sender_username}
              </p>
              <p className="text-[11px] opacity-90 truncate">{previewSnippet(message.reply_preview)}</p>
            </div>
          )}
          {message.type === 'image' && message.media_url && (
            <img
              src={message.media_url}
              alt=""
              className="rounded-lg max-w-full max-h-64 object-cover mb-1 cursor-pointer"
              onClick={() => onImageClick(message.media_url!)}
            />
          )}
          {message.type === 'audio' && message.media_url && <audio src={message.media_url} controls className="max-w-full mb-1" />}
          {message.type === 'video' && message.media_url && (
            <video src={message.media_url} controls className="rounded-lg max-w-full max-h-64 mb-1" />
          )}
          {message.content && <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>}
          <div className={`flex items-center justify-between gap-2 mt-1.5 ${isMine ? 'text-white/50' : 'text-slate-500'}`}>
            <p className="text-[10px]">{time}</p>
            <div className="flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
              {onReply && (
                <button
                  type="button"
                  onClick={onReply}
                  className="p-0.5 rounded hover:bg-white/10 text-current"
                  title="Ответить"
                >
                  <Reply size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
        {(onToggleReaction || agg.length > 0) && (
          <div className={`flex flex-wrap gap-1 mt-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
            {agg.map(a => (
              <button
                key={a.emoji}
                type="button"
                onClick={() => onToggleReaction?.(a.emoji)}
                className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs border transition ${
                  a.mine ? 'border-accent bg-accent/20 text-white' : 'border-dark-600 bg-dark-800 text-slate-300 hover:bg-dark-700'
                }`}
              >
                <span>{a.emoji}</span>
                <span className="text-[10px] opacity-80">{a.count}</span>
              </button>
            ))}
            {onToggleReaction &&
              QUICK_REACTIONS.map(e => (
                <button
                  key={e}
                  type="button"
                  onClick={() => onToggleReaction(e)}
                  className="px-1.5 py-0.5 rounded-full text-xs border border-dark-600 bg-dark-800/80 text-slate-400 hover:bg-dark-700 hover:text-white transition"
                  title={e}
                >
                  {e}
                </button>
              ))}
          </div>
        )}
      </div>
      {isMine && showAvatar && showSenderNames && (
        <div className="w-9 flex-shrink-0 self-end">
          <Avatar
            src={asOfficial ? message.channel_avatar : message.sender_avatar}
            videoSrc={asOfficial ? null : message.sender_video_avatar}
            name={asOfficial ? displayName : realName}
            size={34}
          />
        </div>
      )}
    </div>
  );
}
