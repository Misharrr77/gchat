import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import Avatar from './Avatar';
import SearchModal from './SearchModal';
import CreateGroupModal from './CreateGroupModal';
import StoriesBar from './StoriesBar';
import StoryViewer from './StoryViewer';
import { Search, Plus, LogOut, Users, Radio, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { User, Conversation, StoryGroup } from '../types';

interface Props {
  onSelect: () => void;
  onProfile: (u: User) => void;
}

type Tab = 'chats' | 'groups' | 'channels';

export default function Sidebar({ onSelect, onProfile }: Props) {
  const { user, logout } = useAuth();
  const { conversations, active, setActive, loadingConvs, typingUsers, onlineUsers, stories } = useChat();
  const [searchOpen, setSearchOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createType, setCreateType] = useState<'group' | 'channel'>('group');
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<Tab>('chats');
  const [viewingStory, setViewingStory] = useState<StoryGroup | null>(null);

  const filtered = conversations.filter(c => {
    const m = c.name?.toLowerCase().includes(filter.toLowerCase());
    if (tab === 'chats') return c.type === 'direct' && m;
    if (tab === 'groups') return c.type === 'group' && m;
    if (tab === 'channels') return c.type === 'channel' && m;
    return false;
  });

  const pick = (c: Conversation) => { setActive(c); onSelect(); };

  const preview = (c: Conversation) => {
    if (!c.last_message) return 'Нет сообщений';
    if (c.last_message_type === 'image') return 'Фото';
    if (c.last_message_type === 'audio') return 'Аудио';
    if (c.last_message_type === 'video') return 'Видео';
    return c.last_message.length > 30 ? c.last_message.slice(0, 30) + '...' : c.last_message;
  };

  const timeLabel = (t: string | null) => {
    if (!t) return '';
    try { return formatDistanceToNow(new Date(t + 'Z'), { addSuffix: false, locale: ru }); } catch { return ''; }
  };

  const openCreate = (type: 'group' | 'channel') => {
    setCreateType(type);
    setCreateGroupOpen(true);
  };

  return (
    <div className="flex flex-col h-full w-full bg-dark-800">
      <div className="p-4 flex items-center justify-between border-b border-dark-600">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => user && onProfile(user)}>
          <Avatar src={user?.avatar} videoSrc={user?.video_avatar} name={user?.display_name || user?.username || ''} size={40} online />
          <div>
            <h2 className="font-semibold text-white text-sm">{user?.display_name || user?.username}</h2>
            <p className="text-xs text-accent">В сети</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => tab === 'chats' ? setSearchOpen(true) : openCreate(tab === 'groups' ? 'group' : 'channel')} className="p-2 hover:bg-dark-700 rounded-xl text-slate-400 hover:text-white transition" title="Создать">
            <Plus size={20} />
          </button>
          <button onClick={logout} className="p-2 hover:bg-dark-700 rounded-xl text-slate-400 hover:text-red-400 transition" title="Выйти">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <StoriesBar stories={stories} onView={setViewingStory} />

      <div className="flex border-b border-dark-600">
        {([
          ['chats', MessageSquare, 'Чаты'],
          ['groups', Users, 'Группы'],
          ['channels', Radio, 'Каналы'],
        ] as [Tab, any, string][]).map(([key, Icon, label]) => (
          <button
            key={key} onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-all ${tab === key ? 'text-accent border-b-2 border-accent' : 'text-slate-400 hover:text-white'}`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div className="p-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={filter} onChange={e => setFilter(e.target.value)} placeholder="Поиск..."
            className="w-full pl-9 pr-4 py-2.5 bg-dark-700 border border-dark-600 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent/50 transition"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loadingConvs ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            {filter ? 'Ничего не найдено' : tab === 'chats' ? 'Нет чатов' : tab === 'groups' ? 'Нет групп' : 'Нет каналов'}
            <br />
            <button onClick={() => tab === 'chats' ? setSearchOpen(true) : openCreate(tab === 'groups' ? 'group' : 'channel')}
              className="text-accent hover:underline mt-2 inline-block">
              {tab === 'chats' ? 'Начать чат' : tab === 'groups' ? 'Создать группу' : 'Создать канал'}
            </button>
          </div>
        ) : filtered.map(c => {
          const on = c.type === 'direct' && c.otherUser ? (onlineUsers.has(c.otherUser.id) || c.otherUser.is_online === 1) : false;
          const typing = (typingUsers.get(c.id)?.size ?? 0) > 0;
          return (
            <div
              key={c.id} onClick={() => pick(c)}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all ${active?.id === c.id ? 'bg-accent/10 border-r-2 border-accent' : 'hover:bg-dark-700'}`}
            >
              <Avatar src={c.avatar} name={c.name || ''} size={48} online={c.type === 'direct' ? on : undefined} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {c.type === 'channel' && <Radio size={12} className="text-accent flex-shrink-0" />}
                    {c.type === 'group' && <Users size={12} className="text-accent flex-shrink-0" />}
                    <span className="font-medium text-white text-sm truncate">{c.name}</span>
                  </div>
                  <span className="text-xs text-slate-500 flex-shrink-0 ml-2">{timeLabel(c.last_message_at)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <p className={`text-xs truncate mt-0.5 ${typing ? 'text-accent' : 'text-slate-400'}`}>
                    {typing ? 'печатает...' : preview(c)}
                  </p>
                  {(c.type === 'group' || c.type === 'channel') && (
                    <span className="text-[10px] text-slate-500 ml-1">{c.member_count}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
      {createGroupOpen && <CreateGroupModal type={createType} onClose={() => setCreateGroupOpen(false)} />}
      {viewingStory && <StoryViewer group={viewingStory} onClose={() => setViewingStory(null)} />}
    </div>
  );
}
