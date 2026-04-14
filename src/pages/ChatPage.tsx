import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import Sidebar from '../components/Sidebar';
import ChatView from '../components/ChatView';
import ProfileModal from '../components/ProfileModal';
import Avatar from '../components/Avatar';
import { LogOut, UserPlus, Users, Radio, Compass, X } from 'lucide-react';
import { User } from '../types';

export default function ChatPage() {
  const { user, logout } = useAuth();
  const { active } = useChat();
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [drawer, setDrawer] = useState(false);

  const openChat = () => setMobileView('chat');
  const backToList = () => { setMobileView('list'); };

  return (
    <div className="flex h-[100dvh] bg-dark-900 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex w-[340px] lg:w-[400px] flex-shrink-0 border-r border-dark-600">
        <Sidebar
          onSelect={openChat}
          onProfile={setProfileUser}
          onDrawer={() => setDrawer(true)}
          isMobile={false}
        />
      </div>

      {/* Desktop chat area */}
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

      {/* Mobile: list OR chat */}
      <div className="flex md:hidden w-full">
        {mobileView === 'list' ? (
          <div className="w-full flex">
            <Sidebar
              onSelect={openChat}
              onProfile={setProfileUser}
              onDrawer={() => setDrawer(true)}
              isMobile={true}
            />
          </div>
        ) : active ? (
          <div className="w-full flex flex-col">
            <ChatView onBack={backToList} onProfile={setProfileUser} isMobile={true} />
          </div>
        ) : (
          <div className="w-full flex">
            <Sidebar
              onSelect={openChat}
              onProfile={setProfileUser}
              onDrawer={() => setDrawer(true)}
              isMobile={true}
            />
          </div>
        )}
      </div>

      {/* Mobile drawer (Telegram-style) */}
      {drawer && (
        <div className="fixed inset-0 z-50 drawer-overlay" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-dark-800 shadow-2xl drawer-panel flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 bg-gradient-to-br from-accent/20 to-dark-800">
              <button onClick={() => setDrawer(false)} className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-white"><X size={18} /></button>
              <button onClick={() => { setDrawer(false); if (user) setProfileUser(user as unknown as User); }}>
                <Avatar src={user?.avatar} videoSrc={user?.video_avatar} name={user?.display_name || ''} size={52} />
              </button>
              <p className="mt-3 text-white font-semibold text-sm">{user?.display_name}</p>
              <p className="text-xs text-slate-400">@{user?.username}</p>
            </div>
            <div className="flex-1 py-2 overflow-y-auto">
              <DrawerItem icon={<UserPlus size={18} />} label="Новый чат" onClick={() => { setDrawer(false); }} />
              <DrawerItem icon={<Users size={18} />} label="Создать группу" onClick={() => setDrawer(false)} />
              <DrawerItem icon={<Radio size={18} />} label="Создать канал" onClick={() => setDrawer(false)} />
              <DrawerItem icon={<Compass size={18} />} label="Найти" onClick={() => setDrawer(false)} />
            </div>
            <div className="border-t border-dark-600 p-2">
              <button onClick={() => { setDrawer(false); logout(); }} className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-dark-700 rounded-xl transition text-sm">
                <LogOut size={18} />Выйти
              </button>
            </div>
          </div>
        </div>
      )}

      {profileUser && <ProfileModal userId={profileUser.id} onClose={() => setProfileUser(null)} />}
    </div>
  );
}

function DrawerItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-5 py-3 text-slate-300 hover:bg-dark-700 transition text-sm">
      {icon}{label}
    </button>
  );
}
