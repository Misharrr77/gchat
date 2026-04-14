import { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import { api } from '../lib/api';
import Avatar from './Avatar';
import StoriesBar from './StoriesBar';
import SearchModal from './SearchModal';
import CreateGroupModal from './CreateGroupModal';
import { MessageSquare, Users, Radio, Plus, Search, Settings, Compass } from 'lucide-react';
import { Conversation, User } from '../types';
import { format, isToday, isYesterday, parseISO } from 'date-fns';

type Tab = 'direct' | 'group' | 'channel';

function fmtTime(d?: string | null) {
  if (!d) return '';
  try {
    const p = parseISO(d);
    if (isToday(p)) return format(p, 'HH:mm');
    if (isYesterday(p)) return 'вчера';
    return format(p, 'dd.MM');
  } catch { return ''; }
}

export default function Sidebar({ onSelect, onProfile }: { onSelect: (c: Conversation) => void; onProfile: (u: User) => void }) {
  const { user } = useAuth();
  const { conversations, active, setActive, stories } = useChat();
  const [tab, setTab] = useState<Tab>('direct');
  const [showSearch, setShowSearch] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);

  const filtered = useMemo(() => conversations.filter(c => c.type === tab), [conversations, tab]);

  const handleSelect = (c: Conversation) => { setActive(c); onSelect(c); };

  const tabStyle = (t: Tab) => tab === t
    ? 'flex-1 py-2 text-xs font-semibold text-accent border-b-2 border-accent transition'
    : 'flex-1 py-2 text-xs font-medium text-slate-400 hover:text-white border-b-2 border-transparent transition';

  return (
    <div className="flex flex-col h-full bg-dark-800">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-dark-600 flex-shrink-0">
        <button onClick={() => user && onProfile(user as unknown as User)} className="flex-shrink-0">
          <Avatar src={user?.avatar} videoSrc={user?.video_avatar} name={user?.display_name || ''} size={36} />
        </button>
        <h1 className="text-lg font-bold text-white flex-1">gchat</h1>
        <button onClick={() => setShowDiscover(true)} className="p-2 hover:bg-dark-700 rounded-lg text-slate-400 hover:text-white transition"><Compass size={18} /></button>
        <button onClick={() => tab === 'direct' ? setShowSearch(true) : setShowCreate(true)} className="p-2 hover:bg-dark-700 rounded-lg text-slate-400 hover:text-white transition"><Plus size={18} /></button>
      </div>

      {tab === 'direct' && stories.length > 0 && <StoriesBar />}

      <div className="flex border-b border-dark-600 flex-shrink-0">
        <button onClick={() => setTab('direct')} className={tabStyle('direct')}><MessageSquare size={14} className="inline mr-1" />Чаты</button>
        <button onClick={() => setTab('group')} className={tabStyle('group')}><Users size={14} className="inline mr-1" />Группы</button>
        <button onClick={() => setTab('channel')} className={tabStyle('channel')}><Radio size={14} className="inline mr-1" />Каналы</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500">
            <p className="text-sm">{tab === 'direct' ? 'Нет чатов' : tab === 'group' ? 'Нет групп' : 'Нет каналов'}</p>
            <button onClick={() => tab === 'direct' ? setShowSearch(true) : setShowCreate(true)} className="mt-2 text-xs text-accent hover:underline">
              {tab === 'direct' ? 'Начать чат' : 'Создать'}
            </button>
          </div>
        ) : filtered.map(c => (
          <button key={c.id} onClick={() => handleSelect(c)} className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-dark-700 transition ${active?.id === c.id ? 'bg-dark-700' : ''}`}>
            <div className="flex-shrink-0">
              <Avatar src={c.avatar} videoSrc={c.type === 'direct' ? c.otherUser?.video_avatar : undefined} name={c.name || '?'} size={44} online={c.type === 'direct' ? c.otherUser?.is_online === 1 : undefined} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 justify-between">
                <div className="flex items-center gap-1 min-w-0">
                  {c.type === 'channel' && <Radio size={12} className="text-accent flex-shrink-0" />}
                  {c.type === 'group' && <Users size={12} className="text-accent flex-shrink-0" />}
                  <span className="text-sm font-medium text-white truncate">{c.name}</span>
                </div>
                <span className="text-[10px] text-slate-500 flex-shrink-0">{fmtTime(c.last_message_at)}</span>
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {c.last_message ? (c.last_message_type !== 'text' ? `📎 ${c.last_message_type === 'image' ? 'Фото' : c.last_message_type === 'audio' ? 'Аудио' : 'Видео'}` : c.last_message) : (c.type !== 'direct' ? `${c.member_count} уч.` : 'Нет сообщений')}
              </p>
            </div>
          </button>
        ))}
      </div>

      {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
      {showCreate && <CreateGroupModal type={tab === 'channel' ? 'channel' : 'group'} onClose={() => setShowCreate(false)} />}
      {showDiscover && <DiscoverModal onClose={() => setShowDiscover(false)} onSelect={handleSelect} />}
    </div>
  );
}

function DiscoverModal({ onClose, onSelect }: { onClose: () => void; onSelect: (c: Conversation) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<(Conversation & { member_count: number })[]>([]);
  const [loading, setLoading] = useState(false);
  const { refresh } = useChat();

  const search = async (q: string) => {
    setQuery(q);
    if (q.length < 1) { setResults([]); return; }
    setLoading(true);
    try { const d = await api.discover(q); setResults(d.results); } catch {}
    setLoading(false);
  };

  const join = async (id: string) => {
    try {
      const d = await api.conversations.join(id);
      await refresh();
      onSelect(d.conversation);
      onClose();
    } catch {}
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-dark-800 rounded-2xl border border-dark-600 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-dark-600">
          <h3 className="text-lg font-bold text-white mb-3">Найти</h3>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={query} onChange={e => search(e.target.value)} placeholder="Группы и каналы..." className="w-full pl-8 pr-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent transition" autoFocus />
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading && <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>}
          {!loading && results.length === 0 && query && <p className="text-center text-slate-500 text-sm py-6">Ничего не найдено</p>}
          {results.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-dark-700/50">
              <Avatar src={r.avatar} name={r.name || '?'} size={40} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  {r.type === 'channel' ? <Radio size={12} className="text-accent" /> : <Users size={12} className="text-accent" />}
                  <span className="text-sm font-medium text-white truncate">{r.name}</span>
                </div>
                <p className="text-xs text-slate-400">{r.member_count} уч. · {r.type === 'channel' ? 'Канал' : 'Группа'}</p>
              </div>
              <button onClick={() => join(r.id)} className="px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent-hover transition">Вступить</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
