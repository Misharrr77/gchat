import { useState } from 'react';
import { api } from '../lib/api';
import { useChat } from '../contexts/ChatContext';
import Avatar from './Avatar';
import { X, Search, Users, Radio, Loader, Check, Globe, Lock } from 'lucide-react';
import { User } from '../types';

export default function CreateGroupModal({ type, onClose }: { type: 'group' | 'channel'; onClose: () => void }) {
  const { setActive, refresh } = useChat();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [selected, setSelected] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const isChannel = type === 'channel';

  const searchUsers = async (q: string) => {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try { const d = await api.users.search(q); setResults(d.users); } catch {}
    setLoading(false);
  };

  const toggle = (u: User) => {
    setSelected(p => p.some(s => s.id === u.id) ? p.filter(s => s.id !== u.id) : [...p, u]);
  };

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const d = isChannel
        ? await api.conversations.createChannel({ name: name.trim(), description: desc, isPublic })
        : await api.conversations.createGroup({ name: name.trim(), memberIds: selected.map(s => s.id), description: desc, isPublic });
      await refresh();
      setActive(d.conversation);
      onClose();
    } catch {}
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-dark-800 rounded-2xl border border-dark-600 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600">
          <h3 className="font-bold text-white">{isChannel ? 'Новый канал' : 'Новая группа'}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-dark-700 rounded-lg text-slate-400"><X size={16} /></button>
        </div>

        {step === 1 && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-center gap-3 py-2">
              {isChannel ? <Radio size={32} className="text-accent" /> : <Users size={32} className="text-accent" />}
            </div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Название" className="w-full px-3 py-2.5 bg-dark-700 border border-dark-600 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent transition" autoFocus />
            <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Описание (необязательно)" rows={2} className="w-full px-3 py-2.5 bg-dark-700 border border-dark-600 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent transition resize-none" />

            <div className="flex gap-2">
              <button onClick={() => setIsPublic(false)} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition ${!isPublic ? 'bg-accent text-white' : 'bg-dark-700 text-slate-400 hover:text-white'}`}>
                <Lock size={14} />Приватный
              </button>
              <button onClick={() => setIsPublic(true)} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition ${isPublic ? 'bg-accent text-white' : 'bg-dark-700 text-slate-400 hover:text-white'}`}>
                <Globe size={14} />Публичный
              </button>
            </div>

            <button onClick={() => isChannel ? create() : setStep(2)} disabled={!name.trim() || creating} className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-xl transition disabled:opacity-50">
              {creating ? 'Создание...' : isChannel ? 'Создать канал' : 'Далее'}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="p-4">
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input value={query} onChange={e => searchUsers(e.target.value)} placeholder="Добавить участников" className="w-full pl-8 pr-3 py-2.5 bg-dark-700 border border-dark-600 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent transition" autoFocus />
            </div>

            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {selected.map(u => (
                  <span key={u.id} onClick={() => toggle(u)} className="flex items-center gap-1 px-2 py-1 bg-accent/20 text-accent text-xs rounded-full cursor-pointer hover:bg-accent/30 transition">
                    {u.display_name || u.username}<X size={10} />
                  </span>
                ))}
              </div>
            )}

            <div className="max-h-48 overflow-y-auto space-y-1 mb-3">
              {loading && <div className="flex justify-center py-3"><Loader size={16} className="animate-spin text-accent" /></div>}
              {results.map(u => (
                <button key={u.id} onClick={() => toggle(u)} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-dark-700 transition">
                  <Avatar src={u.avatar} name={u.display_name || u.username} size={36} />
                  <span className="text-sm text-white flex-1 text-left truncate">{u.display_name || u.username}</span>
                  {selected.some(s => s.id === u.id) && <Check size={16} className="text-accent" />}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="flex-1 py-2.5 bg-dark-700 text-white text-sm rounded-xl hover:bg-dark-600 transition">Назад</button>
              <button onClick={create} disabled={creating} className="flex-1 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-xl transition disabled:opacity-50">
                {creating ? '...' : `Создать (${selected.length})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
