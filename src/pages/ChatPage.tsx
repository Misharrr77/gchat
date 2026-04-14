import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import { api } from '../lib/api';
import Sidebar from '../components/Sidebar';
import ChatView from '../components/ChatView';
import ProfileModal from '../components/ProfileModal';
import SearchModal from '../components/SearchModal';
import CreateGroupModal from '../components/CreateGroupModal';
import Avatar from '../components/Avatar';
import { LogOut, UserPlus, Users, Radio, Compass, X, Search } from 'lucide-react';
import { User, Conversation } from '../types';

export default function ChatPage() {
  const { user, logout } = useAuth();
  const { active, setActive, refresh } = useChat();
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState(false);
  const [drawerCreate, setDrawerCreate] = useState<'group' | 'channel' | null>(null);
  const [drawerDiscover, setDrawerDiscover] = useState(false);

  const openChat = () => setMobileView('chat');
  const backToList = () => setMobileView('list');

  return (
    <>
      <div className="flex h-[100dvh] bg-dark-900 overflow-hidden">
        <div className="hidden md:flex w-[340px] lg:w-[400px] flex-shrink-0 border-r border-dark-600">
          <Sidebar onSelect={openChat} onProfile={setProfileUser} onDrawer={() => setDrawer(true)} isMobile={false} />
        </div>
        <div className="hidden md:flex flex-1 flex-col min-w-0">
          {active ? (
            <ChatView onBack={backToList} onProfile={setProfileUser} isMobile={false} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
              <h2 className="text-3xl font-bold text-white/10 mb-2">gchat</h2>
              <p className="text-sm">Выберите чат</p>
            </div>
          )}
        </div>
        <div className="flex md:hidden w-full">
          {mobileView === 'list' || !active ? (
            <div className="w-full flex">
              <Sidebar onSelect={openChat} onProfile={setProfileUser} onDrawer={() => setDrawer(true)} isMobile={true} />
            </div>
          ) : (
            <div className="w-full flex flex-col">
              <ChatView onBack={backToList} onProfile={setProfileUser} isMobile={true} />
            </div>
          )}
        </div>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-[100]" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/60 drawer-overlay" />
          <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-dark-900 shadow-2xl drawer-panel flex flex-col border-r border-dark-600" onClick={e => e.stopPropagation()}>
            <div className="p-5 pb-4 bg-gradient-to-br from-accent/30 via-accent/10 to-transparent">
              <button onClick={() => setDrawer(false)} className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-white transition"><X size={18} /></button>
              <button onClick={() => { setDrawer(false); if (user) setProfileUser(user as unknown as User); }} className="block">
                <Avatar src={user?.avatar} videoSrc={user?.video_avatar} name={user?.display_name || ''} size={52} />
              </button>
              <p className="mt-3 text-white font-semibold">{user?.display_name}</p>
              <p className="text-xs text-slate-400">@{user?.username}</p>
            </div>
            <div className="flex-1 py-1">
              <DrawerBtn icon={<UserPlus size={18} />} label="Новый чат" onClick={() => { setDrawer(false); setDrawerSearch(true); }} />
              <DrawerBtn icon={<Users size={18} />} label="Создать группу" onClick={() => { setDrawer(false); setDrawerCreate('group'); }} />
              <DrawerBtn icon={<Radio size={18} />} label="Создать канал" onClick={() => { setDrawer(false); setDrawerCreate('channel'); }} />
              <DrawerBtn icon={<Compass size={18} />} label="Найти" onClick={() => { setDrawer(false); setDrawerDiscover(true); }} />
            </div>
            <div className="border-t border-dark-600 p-2">
              <button onClick={() => { setDrawer(false); logout(); }} className="w-full flex items-center gap-3 px-5 py-3 text-red-400 hover:bg-dark-700 rounded-xl transition text-sm"><LogOut size={18} />Выйти</button>
            </div>
          </div>
        </div>
      )}

      {drawerSearch && <SearchModal onClose={() => setDrawerSearch(false)} />}
      {drawerCreate && <CreateGroupModal type={drawerCreate} onClose={() => setDrawerCreate(null)} />}
      {drawerDiscover && <DiscoverModal onClose={() => setDrawerDiscover(false)} onJoin={(c) => { setActive(c); openChat(); setDrawerDiscover(false); }} />}
      {profileUser && <ProfileModal userId={profileUser.id} onClose={() => setProfileUser(null)} />}
    </>
  );
}

function DrawerBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-5 py-3.5 text-slate-300 hover:bg-dark-700 transition text-sm">
      <span className="text-slate-400">{icon}</span>{label}
    </button>
  );
}

function DiscoverModal({ onClose, onJoin }: { onClose: () => void; onJoin: (c: Conversation) => void }) {
  const { refresh } = useChat();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async (q: string) => {
    setQuery(q);
    if (q.length < 1) { setResults([]); return; }
    setLoading(true);
    try { const d = await api.discover(q); setResults(d.results); } catch {}
    setLoading(false);
  };

  const join = async (id: string) => {
    try { const d = await api.conversations.join(id); await refresh(); onJoin(d.conversation); } catch {}
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
          {results.map((r: any) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-dark-700/50">
              <Avatar src={r.avatar} name={r.name || '?'} size={44} />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-white truncate block">{r.name}</span>
                <p className="text-xs text-slate-400">{r.member_count} уч.</p>
              </div>
              <button onClick={() => join(r.id)} className="px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent-hover transition">Вступить</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
