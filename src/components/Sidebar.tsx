import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import { api } from '../lib/api';
import Avatar from './Avatar';
import StoriesBar from './StoriesBar';
import SearchModal from './SearchModal';
import CreateGroupModal from './CreateGroupModal';
import { Menu, MessageSquare, Users, Radio, Plus, Search, Compass, ChevronLeft, Bookmark } from 'lucide-react';
import ChatVideo from './media/ChatVideo';
import ChatAudio from './media/ChatAudio';
import { Conversation, User, SavedListItem } from '../types';
import { formatKaliningradListTime } from '../lib/datetime';

type Tab = 'direct' | 'group' | 'channel';

function chatListSubtitle(c: Conversation, myId?: string) {
  if (!c.last_message_at) {
    if (c.type !== 'direct') return `${c.member_count} уч.`;
    return 'Нет сообщений';
  }
  const display = (c.last_message ?? '').trim() || '…';
  if (myId && c.last_message_sender_id === myId) return `Вы: ${display}`;
  if (c.type !== 'direct' && c.last_message_sender_id) {
    const sender = c.members?.find(x => x.id === c.last_message_sender_id);
    if (sender) return `${sender.display_name || sender.username}: ${display}`;
  }
  return display;
}

interface Props {
  onSelect: (c?: Conversation) => void;
  onProfile: (u: User) => void;
  onDrawer: () => void;
  isMobile: boolean;
  listMode?: 'chats' | 'favorites';
  onListModeChange?: (mode: 'chats' | 'favorites') => void;
}

function SavedFavoriteRow({ item }: { item: SavedListItem }) {
  const m = item.message;
  const senderName = m.sender_display_name || m.sender_username || '?';

  return (
    <div className="w-full px-4 py-3 text-left border-b border-dark-700/60">
      <div className="flex items-start gap-3">
        <Avatar src={m.sender_avatar} videoSrc={m.sender_video_avatar} name={senderName} size={44} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-white truncate">{senderName}</span>
            <span className="text-[10px] text-slate-500 whitespace-nowrap flex-shrink-0">{formatKaliningradListTime(item.saved_at)}</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 truncate">{item.conversation.name}</p>
          <div className="mt-2 space-y-2">
            {m.type === 'image' && m.media_url && (
              <div className="rounded-xl overflow-hidden ring-1 ring-white/[0.08] bg-black/40">
                <img src={m.media_url} alt="" className="w-full max-h-52 object-cover bg-black/40" />
              </div>
            )}
            {m.type === 'video' && m.media_url && <ChatVideo src={m.media_url} videoClassName="max-h-52 w-full object-contain" />}
            {m.type === 'audio' && m.media_url && <ChatAudio src={m.media_url} compact />}
          </div>
          {m.content ? (
            <p className="text-xs text-slate-400 mt-2 line-clamp-4 whitespace-pre-wrap">{m.content}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({
  onSelect,
  onProfile,
  onDrawer,
  isMobile,
  listMode = 'chats',
  onListModeChange,
}: Props) {
  const { user } = useAuth();
  const { conversations, active, setActive, stories } = useChat();
  const [tab, setTab] = useState<Tab>('direct');
  const [showSearch, setShowSearch] = useState(false);
  const [showCreate, setShowCreate] = useState<'group' | 'channel' | null>(null);
  const [showDiscover, setShowDiscover] = useState(false);
  const [savedItems, setSavedItems] = useState<SavedListItem[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  const filtered = useMemo(() => conversations.filter(c => c.type === tab), [conversations, tab]);

  const handleSelect = (c: Conversation) => { setActive(c); onSelect(c); };

  useEffect(() => {
    if (listMode !== 'favorites') return;
    setSavedLoading(true);
    api.saved
      .list()
      .then(d => setSavedItems(d.items))
      .catch(() => setSavedItems([]))
      .finally(() => setSavedLoading(false));
  }, [listMode]);

  const tabBtn = (t: Tab, icon: React.ReactNode, label: string) => (
    <button onClick={() => setTab(t)} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition ${tab === t ? 'text-accent border-b-2 border-accent' : 'text-slate-400 hover:text-white border-b-2 border-transparent'}`}>
      {icon}<span className="hidden sm:inline">{label}</span>
    </button>
  );

  if (listMode === 'favorites') {
    return (
      <div className="flex flex-col h-full bg-dark-800 w-full">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-dark-600 flex-shrink-0">
          <button
            type="button"
            onClick={() => onListModeChange?.('chats')}
            className="p-2 hover:bg-dark-700 rounded-xl text-slate-400 hover:text-white transition flex-shrink-0"
            aria-label="Назад к чатам"
          >
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-lg font-bold text-white flex-1">Избранное</h1>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {savedLoading ? (
            <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
          ) : savedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-slate-500 text-center">
              <Bookmark size={40} className="text-slate-600 mb-2" />
              <p className="text-sm">Пока пусто</p>
              <p className="text-xs mt-2 text-slate-600 max-w-[240px]">Выбери сообщение в чате и нажми «В избранное» в панели действий.</p>
            </div>
          ) : (
            savedItems.map(item => <SavedFavoriteRow key={item.save_id} item={item} />)
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-dark-800 w-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-dark-600 flex-shrink-0">
        <button onClick={onDrawer} className="p-2 hover:bg-dark-700 rounded-xl text-slate-400 hover:text-white transition flex-shrink-0">
          <Menu size={20} />
        </button>
        <h1 className="text-lg font-bold text-white flex-1">gchat</h1>
        <button onClick={() => setShowDiscover(true)} className="p-2 hover:bg-dark-700 rounded-xl text-slate-400 hover:text-white transition"><Compass size={18} /></button>
        <button onClick={() => tab === 'direct' ? setShowSearch(true) : setShowCreate(tab === 'channel' ? 'channel' : 'group')} className="p-2 hover:bg-dark-700 rounded-xl text-slate-400 hover:text-white transition"><Plus size={18} /></button>
      </div>

      {onListModeChange && (
        <button
          type="button"
          onClick={() => onListModeChange('favorites')}
          className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-dark-600/80 hover:bg-dark-700/35 transition"
        >
          <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0 ring-1 ring-amber-400/25">
            <Bookmark size={22} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-white">Избранное</span>
            <p className="text-xs text-slate-500 mt-0.5">Все сохранёнки в одной ленте</p>
          </div>
        </button>
      )}

      {/* Stories */}
      {tab === 'direct' && stories.length > 0 && <StoriesBar />}

      {/* Tabs */}
      <div className="flex border-b border-dark-600 flex-shrink-0">
        {tabBtn('direct', <MessageSquare size={14} />, 'Чаты')}
        {tabBtn('group', <Users size={14} />, 'Группы')}
        {tabBtn('channel', <Radio size={14} />, 'Каналы')}
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <p className="text-sm">{tab === 'direct' ? 'Нет чатов' : tab === 'group' ? 'Нет групп' : 'Нет каналов'}</p>
            <button onClick={() => tab === 'direct' ? setShowSearch(true) : setShowCreate(tab === 'channel' ? 'channel' : 'group')} className="mt-2 text-xs text-accent hover:underline">
              {tab === 'direct' ? 'Начать чат' : 'Создать'}
            </button>
          </div>
        ) : filtered.map(c => (
          <button key={c.id} onClick={() => handleSelect(c)} className={`w-full flex items-center gap-3 px-4 py-3 text-left transition active:bg-dark-600 ${active?.id === c.id ? 'bg-dark-700' : 'hover:bg-dark-700/50'}`}>
            <Avatar src={c.avatar} videoSrc={c.type === 'direct' ? c.otherUser?.video_avatar : undefined} name={c.name || '?'} size={48} online={c.type === 'direct' ? c.otherUser?.is_online === 1 : undefined} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {c.type === 'channel' && <Radio size={12} className="text-accent flex-shrink-0" />}
                  {c.type === 'group' && <Users size={12} className="text-accent flex-shrink-0" />}
                  <span className="text-sm font-medium text-white truncate">{c.name}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {(c.unread_count ?? 0) > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white leading-none">
                      {(c.unread_count ?? 0) > 99 ? '99+' : c.unread_count}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500 whitespace-nowrap">{formatKaliningradListTime(c.last_message_at)}</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">{chatListSubtitle(c, user?.id)}</p>
            </div>
          </button>
        ))}
      </div>

      {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
      {showCreate && <CreateGroupModal type={showCreate} onClose={() => setShowCreate(null)} />}
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
    try { const d = await api.conversations.join(id); await refresh(); onSelect(d.conversation); onClose(); } catch {}
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-sm bg-dark-800 rounded-t-2xl sm:rounded-2xl border-t sm:border border-dark-600 shadow-2xl overflow-hidden max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-dark-600">
          <h3 className="text-base font-bold text-white mb-3">Найти группы и каналы</h3>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={query} onChange={e => search(e.target.value)} placeholder="Название..." className="w-full pl-8 pr-3 py-2.5 bg-dark-700 border border-dark-600 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent" autoFocus />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {loading && <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>}
          {!loading && results.length === 0 && query && <p className="text-center text-slate-500 text-sm py-8">Ничего не найдено</p>}
          {results.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-dark-700/50">
              <Avatar src={r.avatar} name={r.name || '?'} size={44} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1"><span className="text-sm font-medium text-white truncate">{r.name}</span></div>
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
