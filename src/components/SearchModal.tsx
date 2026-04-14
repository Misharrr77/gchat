import { useState } from 'react';
import { api } from '../lib/api';
import { useChat } from '../contexts/ChatContext';
import Avatar from './Avatar';
import { Search, X, Loader } from 'lucide-react';
import { User } from '../types';

export default function SearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const { startConversation, setActive } = useChat();

  const search = async (q: string) => {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try { const d = await api.users.search(q); setResults(d.users); } catch { /* ignore */ }
    setLoading(false);
  };

  const start = async (uid: string) => {
    setStarting(uid);
    try {
      const conv = await startConversation(uid);
      setActive(conv);
      onClose();
    } catch { /* ignore */ }
    setStarting(null);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-20 px-4" onClick={onClose}>
      <div className="w-full max-w-md bg-dark-800 rounded-2xl border border-dark-600 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-dark-600 flex items-center gap-3">
          <Search size={18} className="text-slate-400" />
          <input
            autoFocus value={query} onChange={e => search(e.target.value)}
            placeholder="Найти пользователя..."
            className="flex-1 bg-transparent text-white placeholder-slate-500 focus:outline-none text-sm"
          />
          <button onClick={onClose} className="p-1.5 hover:bg-dark-700 rounded-lg text-slate-400"><X size={18} /></button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-6"><Loader size={20} className="animate-spin text-accent" /></div>
          ) : results.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-sm">
              {query.length >= 2 ? 'Никого не найдено' : 'Введите имя для поиска'}
            </div>
          ) : results.map(u => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3 hover:bg-dark-700 transition">
              <Avatar src={u.avatar} name={u.display_name || u.username} size={44} online={u.is_online === 1} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{u.display_name || u.username}</p>
                <p className="text-xs text-slate-400">@{u.username}</p>
              </div>
              <button
                onClick={() => start(u.id)} disabled={starting === u.id}
                className="px-3 py-1.5 bg-accent hover:bg-accent-hover rounded-lg text-white text-xs font-medium transition disabled:opacity-50"
              >{starting === u.id ? <Loader size={14} className="animate-spin" /> : 'Написать'}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
