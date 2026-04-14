import { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Avatar from './Avatar';
import { Message } from '../types';
import { format } from 'date-fns';
import { Play, Pause } from 'lucide-react';

interface Props {
  message: Message;
  showAvatar: boolean;
  onImageClick: (url: string) => void;
}

export default function MessageBubble({ message: m, showAvatar, onImageClick }: Props) {
  const { user } = useAuth();
  const mine = m.sender_id === user?.id;
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const time = (() => { try { return format(new Date(m.created_at + 'Z'), 'HH:mm'); } catch { return ''; } })();

  const toggleAudio = () => {
    if (!audioRef.current) return;
    playing ? audioRef.current.pause() : audioRef.current.play();
    setPlaying(!playing);
  };

  const content = () => {
    if (m.type === 'image') return (
      <img src={m.media_url || ''} alt="" className="max-w-[280px] rounded-lg cursor-pointer hover:opacity-90 transition" onClick={() => onImageClick(m.media_url || '')} />
    );
    if (m.type === 'audio') return (
      <div className="flex items-center gap-3 min-w-[200px]">
        <button onClick={toggleAudio} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0 hover:bg-white/20 transition">
          {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>
        <div className="flex-1">
          <div className="h-1 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white/60 rounded-full transition-all" style={{ width: '0%' }} />
          </div>
          <audio
            ref={audioRef} src={m.media_url || ''} onEnded={() => setPlaying(false)}
            onTimeUpdate={e => {
              const a = e.currentTarget;
              const bar = a.parentElement?.querySelector('.bg-white\\/60') as HTMLElement;
              if (bar && a.duration) bar.style.width = `${(a.currentTime / a.duration) * 100}%`;
            }}
          />
        </div>
      </div>
    );
    return <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>;
  };

  return (
    <div className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''} ${showAvatar ? 'mt-3' : 'mt-0.5'}`}>
      {!mine && (
        <div className="w-8 flex-shrink-0">
          {showAvatar && <Avatar src={m.sender_avatar} name={m.sender_display_name || m.sender_username} size={32} />}
        </div>
      )}
      <div className={`max-w-[70%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {showAvatar && !mine && <span className="text-xs text-accent-light mb-1 ml-1">{m.sender_display_name || m.sender_username}</span>}
        <div className={`px-3 py-2 rounded-2xl ${m.type === 'image' ? 'p-1' : ''} ${mine ? 'bg-accent text-white rounded-br-md' : 'bg-dark-700 text-slate-100 rounded-bl-md'}`}>
          {content()}
          <div className={`flex justify-end mt-1 ${m.type === 'image' ? 'px-2 pb-1' : ''}`}>
            <span className={`text-[10px] ${mine ? 'text-blue-200' : 'text-slate-500'}`}>{time}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
