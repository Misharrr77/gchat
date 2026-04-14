import { useState, useRef, FormEvent } from 'react';
import { useChat } from '../contexts/ChatContext';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { Send, Image, Music, Video, X, Loader } from 'lucide-react';

export default function MessageInput() {
  const { active, sendMessage } = useChat();
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ type: string; url: string; file: File } | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const audRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  const typingRef = useRef<ReturnType<typeof setTimeout>>();

  const emitTyping = () => {
    if (!active) return;
    const s = getSocket();
    if (!s) return;
    if (typingRef.current) clearTimeout(typingRef.current);
    s.emit('typing', { conversationId: active.id });
    typingRef.current = setTimeout(() => {}, 3000);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if ((!text.trim() && !preview) || !active) return;
    try {
      if (preview) {
        setUploading(true);
        const d = await api.upload(preview.file);
        const msgType = preview.type.startsWith('audio') ? 'audio' : preview.type.startsWith('video') ? 'video' : 'image';
        await sendMessage(text.trim() || '', msgType, d.url);
        setPreview(null);
      } else {
        await sendMessage(text.trim());
      }
      setText('');
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview({ type: f.type || type, url: URL.createObjectURL(f), file: f });
    e.target.value = '';
  };

  return (
    <div className="border-t border-dark-600 bg-dark-800">
      {preview && (
        <div className="px-4 pt-3 flex items-center gap-3">
          {preview.type.startsWith('image')
            ? <img src={preview.url} alt="" className="w-20 h-20 rounded-lg object-cover" />
            : preview.type.startsWith('video')
            ? <video src={preview.url} className="w-20 h-20 rounded-lg object-cover" />
            : <div className="flex items-center gap-2 px-3 py-2 bg-dark-700 rounded-lg"><Music size={16} className="text-accent" /><span className="text-sm text-slate-300 truncate max-w-[200px]">{preview.file.name}</span></div>
          }
          <button onClick={() => setPreview(null)} className="p-1 hover:bg-dark-700 rounded-lg text-slate-400"><X size={16} /></button>
        </div>
      )}

      <form onSubmit={submit} className="flex items-end gap-2 p-3">
        <div className="flex gap-1">
          <button type="button" onClick={() => imgRef.current?.click()} className="p-2.5 hover:bg-dark-700 rounded-xl text-slate-400 hover:text-accent transition" title="Фото">
            <Image size={20} />
          </button>
          <button type="button" onClick={() => vidRef.current?.click()} className="p-2.5 hover:bg-dark-700 rounded-xl text-slate-400 hover:text-accent transition" title="Видео">
            <Video size={20} />
          </button>
          <button type="button" onClick={() => audRef.current?.click()} className="p-2.5 hover:bg-dark-700 rounded-xl text-slate-400 hover:text-accent transition" title="Аудио">
            <Music size={20} />
          </button>
        </div>
        <input type="file" ref={imgRef} className="hidden" accept="image/*" onChange={e => pickFile(e, 'image')} />
        <input type="file" ref={vidRef} className="hidden" accept="video/*" onChange={e => pickFile(e, 'video')} />
        <input type="file" ref={audRef} className="hidden" accept="audio/*" onChange={e => pickFile(e, 'audio')} />

        <div className="flex-1">
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); emitTyping(); }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e); } }}
            onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }}
            placeholder="Написать сообщение..."
            rows={1}
            className="w-full px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent/50 resize-none transition"
            style={{ minHeight: 42 }}
          />
        </div>

        <button type="submit" disabled={(!text.trim() && !preview) || uploading} className="p-2.5 bg-accent hover:bg-accent-hover rounded-xl text-white transition disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0">
          {uploading ? <Loader size={20} className="animate-spin" /> : <Send size={20} />}
        </button>
      </form>
    </div>
  );
}
