import { Image as ImageIcon, Mic2, Video } from 'lucide-react';
import type { Message } from '../types';

type Props = {
  type: Message['type'];
  content: string | null;
  media_url?: string | null;
  senderName: string;
  /** Рядом с полем ввода — чуть компактнее */
  compact?: boolean;
  /** Пузырь в ленте или полоска над полем ввода */
  variant?: 'bubble' | 'composer';
  onImageClick?: (url: string) => void;
};

function truncateText(t: string, max = 72) {
  const s = t.trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export default function ReplyQuotePreview({
  type,
  content,
  media_url,
  senderName,
  compact,
  variant = 'bubble',
  onImageClick,
}: Props) {
  const caption = (content || '').trim();
  const mediaTitle = type === 'image' ? 'Фото' : type === 'video' ? 'Видео' : type === 'audio' ? 'Аудио' : '';

  const thumbSize = compact ? 'h-10 w-10' : 'h-11 w-11';
  const vidW = compact ? 'w-14 h-10' : 'w-16 h-11';

  const thumb = (() => {
    if (type === 'image' && media_url) {
      if (onImageClick) {
        return (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onImageClick(media_url);
            }}
            className={`flex-shrink-0 rounded-lg overflow-hidden ring-1 ring-white/20 hover:ring-accent/45 transition ${thumbSize}`}
          >
            <img src={media_url} alt="" className={`${thumbSize} object-cover`} />
          </button>
        );
      }
      return (
        <div className={`flex-shrink-0 rounded-lg overflow-hidden ring-1 ring-white/20 ${thumbSize}`}>
          <img src={media_url} alt="" className={`${thumbSize} object-cover`} />
        </div>
      );
    }
    if (type === 'video' && media_url) {
      return (
        <div className={`flex-shrink-0 rounded-lg overflow-hidden ring-1 ring-white/15 bg-black ${vidW}`}>
          <video src={media_url} muted playsInline preload="metadata" className="h-full w-full object-cover pointer-events-none" />
        </div>
      );
    }
    if (type === 'audio') {
      return (
        <div
          className={`flex-shrink-0 rounded-lg bg-dark-800/90 flex items-center justify-center ring-1 ring-white/10 ${thumbSize}`}
          aria-hidden
        >
          <Mic2 size={compact ? 16 : 18} className="text-accent-light/95" />
        </div>
      );
    }
    if (type === 'image')
      return (
        <div className={`flex-shrink-0 rounded-lg bg-dark-800 flex items-center justify-center ring-1 ring-white/10 ${thumbSize}`}>
          <ImageIcon size={compact ? 16 : 18} className="text-slate-400" />
        </div>
      );
    if (type === 'video')
      return (
        <div className={`flex-shrink-0 rounded-lg bg-dark-800 flex items-center justify-center ring-1 ring-white/10 ${vidW}`}>
          <Video size={compact ? 16 : 18} className="text-slate-400" />
        </div>
      );
    return null;
  })();

  const nameCls =
    variant === 'composer'
      ? `font-semibold text-accent truncate ${compact ? 'text-[10px]' : 'text-[10px]'}`
      : `font-semibold text-white/90 truncate ${compact ? 'text-[10px]' : 'text-[10px]'}`;
  const bodyCls =
    variant === 'composer'
      ? `${compact ? 'text-[11px]' : 'text-xs'} text-slate-400`
      : `${compact ? 'text-[11px]' : 'text-[11px]'} text-white/85`;

  return (
    <div className="flex gap-2 items-start min-w-0">
      {thumb}
      <div className="min-w-0 flex-1">
        <p className={nameCls}>{senderName}</p>
        {type === 'text' ? (
          <p className={`${bodyCls} truncate leading-snug`}>{caption ? truncateText(caption) : 'Сообщение'}</p>
        ) : (
          <p className={`${bodyCls} leading-snug ${caption ? '' : variant === 'bubble' ? 'italic text-white/65' : 'italic text-slate-500'}`}>
            {caption ? (
              <span className="line-clamp-2 whitespace-pre-wrap break-words">{truncateText(caption, 120)}</span>
            ) : (
              mediaTitle
            )}
          </p>
        )}
      </div>
    </div>
  );
}
