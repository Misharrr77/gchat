import { useState } from 'react';
import { useChat } from '../contexts/ChatContext';
import { api } from '../lib/api';
import Avatar from './Avatar';
import { X, Search, Loader } from 'lucide-react';
import { User } from '../types';

export default function SearchModal({ onClose }: { onClose: () => void }) {
  const { startConversation, setActive } = useChat();
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async (query: string) => {
    setQ(query);
    if (query.length < 2) { setUsers([]); return; }
    setLoading(true);
    try { const d = await api.users.search(query); setUsers(d.users); } catch {}
    setLoading(false);
  };

  const select = async (u: User) => {
    try { const c = await startConversation(u.id); setActive(c); onClose(); } catch {}
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-sm bg-dark-800 rounded-t-2xl sm:rounded-2xl border-t sm:border border-dark-600 shadow-2xl overflow-hidden max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-dark-600">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-white">Новый чат</h3>
            <button onClick={onClose} className="p-1.5 hover:bg-dark-700 rounded-lg text-slate-400"><X size={16} /></button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={q} onChange={e => search(e.target.value)} placeholder="Найти пользователя..." className="w-full pl-8 pr-3 py-2.5 bg-dark-700 border border-dark-600 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent" autoFocus />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {loading && <div className="flex justify-center py-4"><Loader size={16} className="animate-spin text-accent" /></div>}
          {!loading && users.length === 0 && q.length >= 2 && <p className="text-center text-slate-500 text-sm py-8">Не найдено</p>}
          {users.map(u => (
            <button key={u.id} onClick={() => select(u)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-dark-700 transition active:bg-dark-600">
              <Avatar src={u.avatar} videoSrc={u.video_avatar} name={u.display_name || u.username} size={44} online={u.is_online === 1} />
              <div className="text-left min-w-0">
                <p className="text-sm font-medium text-white truncate">{u.display_name || u.username}</p>
                <p className="text-xs text-slate-400">@{u.username}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
