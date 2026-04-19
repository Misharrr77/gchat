import { useState, useRef, useCallback, useEffect } from 'react';
import { useChat } from '../contexts/ChatContext';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { Send, Paperclip, Image, Music, Video, X, Radio, User } from 'lucide-react';
import ChatVideo from './media/ChatVideo';
import ChatAudio from './media/ChatAudio';

const HEARTBEAT_MS = 2200;

export default function MessageInput() {
  const { active, sendMessage, replyTo, setReplyTo } = useChat();
  const isChannel = active?.type === 'channel';
  const [postFromChannel, setPostFromChannel] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<{ file: File; type: string; url: string } | null>(null);
  const [showAttach, setShowAttach] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const throttleRef = useRef<number>(0);

  const stopTyping = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    const s = getSocket();
    if (s && active) s.emit('typing:stop', { conversationId: active.id });
  }, [active?.id]);

  const startTypingHeartbeat = useCallback(() => {
    const s = getSocket();
    if (!s || !active) return;
    const pulse = () => {
      s.emit('typing', { conversationId: active.id });
    };
    pulse();
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(pulse, HEARTBEAT_MS);
  }, [active?.id]);

  useEffect(() => {
    return () => {
      stopTyping();
    };
  }, [stopTyping]);

  useEffect(() => {
    stopTyping();
  }, [active?.id, stopTyping]);

  useEffect(() => {
    setPostFromChannel(true);
  }, [active?.id]);

  const handleChange = (v: string) => {
    setText(v);
    if (!active) return;
    const now = Date.now();
    if (now - throttleRef.current > 400) {
      throttleRef.current = now;
      const s = getSocket();
      if (s) s.emit('typing', { conversationId: active.id });
    }
    if (v.trim()) {
      if (!heartbeatRef.current) startTypingHeartbeat();
    } else {
      stopTyping();
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview({ file: f, type, url: URL.createObjectURL(f) });
    setShowAttach(false);
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!active || (!text.trim() && !preview) || sending) return;
    stopTyping();
    setSending(true);
    try {
      const rid = replyTo?.id ?? null;
      const channelMode = isChannel ? postFromChannel : undefined;
      if (preview) {
        const d = await api.upload(preview.file);
        await sendMessage(text.trim() || '', preview.type, d.url, rid, channelMode);
        URL.revokeObjectURL(preview.url);
        setPreview(null);
      } else {
        await sendMessage(text.trim(), 'text', undefined, rid, channelMode);
      }
      setText('');
    } catch (err) { console.error(err); }
    setSending(false);
  };

  return (
    <div className="border-t border-dark-600 bg-dark-800 flex-shrink-0">
      {isChannel && (
        <div className="px-4 pt-3 pb-2 flex gap-2 border-b border-dark-600/50">
          <button
            type="button"
            onClick={() => setPostFromChannel(true)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-medium transition border ${
              postFromChannel
                ? 'bg-accent/25 border-accent text-white shadow-inner'
                : 'bg-dark-700/80 border-dark-600 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio size={15} className={postFromChannel ? 'text-accent-light' : ''} />
            От имени канала
          </button>
          <button
            type="button"
            onClick={() => setPostFromChannel(false)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-medium transition border ${
              !postFromChannel
                ? 'bg-dark-700 border-accent/60 text-white ring-1 ring-accent/30'
                : 'bg-dark-700/80 border-dark-600 text-slate-400 hover:text-slate-200'
            }`}
          >
            <User size={15} />
            От себя
          </button>
        </div>
      )}
      {replyTo && (
        <div className="px-4 pt-3 flex items-start gap-2 border-b border-dark-600/60">
          <div className="flex-1 min-w-0 border-l-2 border-accent pl-2 py-0.5">
            <p className="text-[10px] text-accent font-medium truncate">
              {replyTo.sender_display_name || replyTo.sender_username}
            </p>
            <p className="text-xs text-slate-400 line-clamp-2">{(replyTo.content || '').trim() || (replyTo.type !== 'text' ? `[${replyTo.type}]` : '…')}</p>
          </div>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            className="p-1 text-slate-500 hover:text-white flex-shrink-0"
            aria-label="Отменить ответ"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {preview && (
        <div className="px-4 pt-3 pb-1 relative">
          <button
            type="button"
            onClick={() => {
              URL.revokeObjectURL(preview.url);
              setPreview(null);
            }}
            className="absolute top-3 right-3 z-10 p-1 bg-dark-600 rounded-full text-white hover:text-red-400"
            aria-label="Убрать вложение"
          >
            <X size={14} />
          </button>
          <div className="flex flex-col gap-2 pr-8 min-w-0">
            {preview.type === 'image' && (
              <img src={preview.url} className="w-24 h-24 object-cover rounded-xl ring-1 ring-white/10" alt="" />
            )}
            {preview.type === 'video' && <ChatVideo src={preview.url} className="max-w-xs" videoClassName="max-h-40 object-contain" />}
            {preview.type === 'audio' && <ChatAudio src={preview.url} compact className="max-w-md" />}
            <p className="text-xs text-slate-400 truncate">{preview.file.name}</p>
          </div>
        </div>
      )}
      <form onSubmit={submit} className="flex items-center gap-2 px-3 py-2.5">
        <div className="relative">
          <button type="button" onClick={() => setShowAttach(!showAttach)} className="p-2 hover:bg-dark-700 rounded-lg text-slate-400 hover:text-white transition"><Paperclip size={18} /></button>
          {showAttach && (
            <div className="absolute bottom-12 left-0 bg-dark-700 border border-dark-600 rounded-xl shadow-xl p-1.5 flex flex-col gap-0.5 min-w-[140px] z-10">
              <button type="button" onClick={() => imgRef.current?.click()} className="flex items-center gap-2 px-3 py-2 hover:bg-dark-600 rounded-lg text-sm text-white transition"><Image size={16} className="text-accent" />Фото</button>
              <button type="button" onClick={() => audioRef.current?.click()} className="flex items-center gap-2 px-3 py-2 hover:bg-dark-600 rounded-lg text-sm text-white transition"><Music size={16} className="text-accent" />Аудио</button>
              <button type="button" onClick={() => vidRef.current?.click()} className="flex items-center gap-2 px-3 py-2 hover:bg-dark-600 rounded-lg text-sm text-white transition"><Video size={16} className="text-accent" />Видео</button>
            </div>
          )}
        </div>
        <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e, 'image')} />
        <input ref={audioRef} type="file" accept="audio/*" className="hidden" onChange={e => handleFile(e, 'audio')} />
        <input ref={vidRef} type="file" accept="video/*" className="hidden" onChange={e => handleFile(e, 'video')} />
        <input
          value={text}
          onChange={e => handleChange(e.target.value)}
          onBlur={() => { stopTyping(); }}
          onFocus={() => { if (text.trim()) startTypingHeartbeat(); }}
          placeholder="Сообщение..."
          className="flex-1 px-4 py-2 bg-dark-700 border border-dark-600 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent transition"
        />
        <button type="submit" disabled={(!text.trim() && !preview) || sending} className="p-2 bg-accent hover:bg-accent-hover rounded-xl text-white transition disabled:opacity-30 disabled:cursor-not-allowed">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
