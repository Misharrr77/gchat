import { useState } from 'react';
import { useChat } from '../contexts/ChatContext';
import Sidebar from '../components/Sidebar';
import ChatView from '../components/ChatView';
import ProfileModal from '../components/ProfileModal';
import { User } from '../types';

export default function ChatPage() {
  const { active } = useChat();
  const [mobileSidebar, setMobileSidebar] = useState(true);
  const [profileUser, setProfileUser] = useState<User | null>(null);

  return (
    <div className="flex h-[100dvh] bg-dark-900 overflow-hidden">
      <div className={`${mobileSidebar ? 'flex' : 'hidden'} md:flex w-full md:w-80 lg:w-96 flex-shrink-0 border-r border-dark-600`}>
        <Sidebar onSelect={() => setMobileSidebar(false)} onProfile={setProfileUser} />
      </div>
      <div className={`${!mobileSidebar ? 'flex' : 'hidden'} md:flex flex-1 flex-col min-w-0`}>
        {active ? (
          <ChatView onBack={() => setMobileSidebar(true)} onProfile={setProfileUser} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            <h2 className="text-2xl font-bold text-white/20 mb-2">gchat</h2>
            <p className="text-sm">Выберите чат</p>
          </div>
        )}
      </div>
      {profileUser && <ProfileModal userId={profileUser.id} onClose={() => setProfileUser(null)} />}
    </div>
  );
}
