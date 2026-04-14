import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import Avatar from './Avatar';
import SearchModal from './SearchModal';
import { Search, Plus, LogOut } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { User, Conversation } from '../types';

interface Props {
  onSelect: () => void;
  onProfile: (u: User) => void;
}

export default function Sidebar({ onSelect, onProfile }: Props) {
  const { user, logout } = useAuth();
  const { conversations, active, setActive, loadingConvs, typingUsers, onlineUsers } = useChat();
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const filtered = conversations.filter(c => c.name?.toLowerCase().includes(filter.toLowerCase()));

  const pick = (c: Conversation) => { setActive(c); onSelect(); };

  const preview = (c: Conversation) => {
    if (!c.last_message) return 'Нет сообщений';
    if (c.last_message_type === 'image') return 'Фото';
    if (c.last_message_type === 'audio') return 'Аудио';
    return c.last_message.length > 35 ? c.last_message.slice(0, 35) + '…' : c.last_message;
  };

  const timeLabel = (t: string | null) => {
    if (!t) return '';
    try { return formatDistanceToNow(new Date(t + 'Z'), { addSuffix: false, locale: ru }); } catch { return ''; }
  };

  return (
    <div className="flex flex-col h-full w-full bg-dark-800">
      <div className="p-4 flex items-center justify-between border-b border-dark-600">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => user && onProfile(user)}>
          <Avatar src={user?.avatar} name={user?.display_name || user?.username || ''} size={40} online />
          <div>
            <h2 className="font-semibold text-white text-sm">{user?.display_name || user?.username}</h2>
            <p className="text-xs text-accent">В сети</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setSearchOpen(true)} className="p-2 hover:bg-dark-700 rounded-xl text-slate-400 hover:text-white transition" title="Новый чат">
            <Plus size={20} />
          </button>
          <button onClick={logout} className="p-2 hover:bg-dark-700 rounded-xl text-slate-400 hover:text-red-400 transition" title="Выйти">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <div className="p-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={filter} onChange={e => setFilter(e.target.value)} placeholder="Поиск чатов..."
            className="w-full pl-9 pr-4 py-2.5 bg-dark-700 border border-dark-600 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent/50 transition"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loadingConvs ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            {filter ? 'Ничего не найдено' : 'Пока нет чатов'}
            <br />
            <button onClick={() => setSearchOpen(true)} className="text-accent hover:underline mt-2 inline-block">Начать чат</button>
          </div>
        ) : filtered.map(c => {
          const on = c.otherUser ? (onlineUsers.has(c.otherUser.id) || c.otherUser.is_online === 1) : false;
          const typing = (typingUsers.get(c.id)?.size ?? 0) > 0;
          return (
            <div
              key={c.id} onClick={() => pick(c)}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all ${active?.id === c.id ? 'bg-accent/10 border-r-2 border-accent' : 'hover:bg-dark-700'}`}
            >
              <Avatar src={c.avatar} name={c.name || ''} size={48} online={on} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white text-sm truncate">{c.name}</span>
                  <span className="text-xs text-slate-500 flex-shrink-0 ml-2">{timeLabel(c.last_message_at)}</span>
                </div>
                <p className={`text-xs truncate mt-0.5 ${typing ? 'text-accent' : 'text-slate-400'}`}>
                  {typing ? 'печатает...' : preview(c)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
