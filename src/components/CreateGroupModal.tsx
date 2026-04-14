import { useState } from 'react';
import { api } from '../lib/api';
import { useChat } from '../contexts/ChatContext';
import Avatar from './Avatar';
import { X, Search, Check, Loader } from 'lucide-react';
import { User } from '../types';

interface Props {
  type: 'group' | 'channel';
  onClose: () => void;
}

export default function CreateGroupModal({ type, onClose }: Props) {
  const { setActive, refresh } = useChat();
  const [step, setStep] = useState<'info' | 'members'>('info');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [selected, setSelected] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const searchUsers = async (q: string) => {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try { const d = await api.users.search(q); setResults(d.users); } catch { /* ignore */ }
    setLoading(false);
  };

  const toggle = (u: User) => {
    setSelected(p => p.some(s => s.id === u.id) ? p.filter(s => s.id !== u.id) : [...p, u]);
  };

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const d = type === 'group'
        ? await api.conversations.createGroup({ name: name.trim(), memberIds: selected.map(s => s.id), description })
        : await api.conversations.createChannel({ name: name.trim(), description });
      await refresh();
      setActive(d.conversation);
      onClose();
    } catch { /* ignore */ }
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-16 px-4" onClick={onClose}>
      <div className="w-full max-w-md bg-dark-800 rounded-2xl border border-dark-600 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-dark-600">
          <h3 className="text-white font-semibold">{type === 'group' ? 'Новая группа' : 'Новый канал'}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-dark-700 rounded-lg text-slate-400"><X size={18} /></button>
        </div>

        {step === 'info' ? (
          <div className="p-4 space-y-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Название</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder={type === 'group' ? 'Название группы' : 'Название канала'}
                className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-accent transition text-sm" autoFocus />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Описание</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Необязательно" rows={3}
                className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-accent transition text-sm resize-none" />
            </div>
            <button onClick={() => type === 'group' ? setStep('members') : create()} disabled={!name.trim() || creating}
              className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl transition disabled:opacity-50">
              {creating ? <Loader size={18} className="animate-spin mx-auto" /> : type === 'group' ? 'Далее' : 'Создать канал'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col" style={{ maxHeight: 500 }}>
            {selected.length > 0 && (
              <div className="flex gap-2 px-4 pt-3 flex-wrap">
                {selected.map(u => (
                  <div key={u.id} className="flex items-center gap-1.5 px-2 py-1 bg-accent/20 rounded-lg text-xs text-accent cursor-pointer" onClick={() => toggle(u)}>
                    {u.display_name || u.username}
                    <X size={12} />
                  </div>
                ))}
              </div>
            )}
            <div className="p-4 pt-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={query} onChange={e => searchUsers(e.target.value)} placeholder="Найти пользователя..."
                  className="w-full pl-9 pr-4 py-2.5 bg-dark-700 border border-dark-600 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent/50 transition" autoFocus />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto max-h-60">
              {loading ? (
                <div className="flex justify-center py-4"><Loader size={20} className="animate-spin text-accent" /></div>
              ) : results.map(u => {
                const sel = selected.some(s => s.id === u.id);
                return (
                  <div key={u.id} onClick={() => toggle(u)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-dark-700 cursor-pointer transition">
                    <Avatar src={u.avatar} name={u.display_name || u.username} size={40} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{u.display_name || u.username}</p>
                      <p className="text-xs text-slate-400">@{u.username}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${sel ? 'bg-accent border-accent' : 'border-slate-500'}`}>
                      {sel && <Check size={12} className="text-white" />}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t border-dark-600">
              <button onClick={create} disabled={creating}
                className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl transition disabled:opacity-50">
                {creating ? <Loader size={18} className="animate-spin mx-auto" /> : `Создать (${selected.length} уч.)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
