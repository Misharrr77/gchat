import { useState, useRef, useCallback, useEffect } from 'react';
import { useChat } from '../contexts/ChatContext';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { Send, Paperclip, Image, Music, Video, X } from 'lucide-react';

const HEARTBEAT_MS = 2200;

export default function MessageInput() {
  const { active, sendMessage } = useChat();
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
      if (preview) {
        const d = await api.upload(preview.file);
        await sendMessage(text.trim() || '', preview.type, d.url);
        URL.revokeObjectURL(preview.url);
        setPreview(null);
      } else {
        await sendMessage(text.trim());
      }
      setText('');
    } catch (err) { console.error(err); }
    setSending(false);
  };

  return (
    <div className="border-t border-dark-600 bg-dark-800 flex-shrink-0">
      {preview && (
        <div className="px-4 pt-3 flex items-center gap-3">
          <div className="relative">
            {preview.type === 'image' && <img src={preview.url} className="w-16 h-16 object-cover rounded-lg" />}
            {preview.type === 'audio' && <div className="w-16 h-16 bg-dark-700 rounded-lg flex items-center justify-center"><Music size={20} className="text-accent" /></div>}
            {preview.type === 'video' && <video src={preview.url} className="w-16 h-16 object-cover rounded-lg" />}
            <button type="button" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }} className="absolute -top-1.5 -right-1.5 p-0.5 bg-dark-600 rounded-full text-white hover:text-red-400"><X size={12} /></button>
          </div>
          <p className="text-xs text-slate-400 truncate">{preview.file.name}</p>
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
