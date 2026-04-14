import { useState } from 'react';
import { useChat } from '../contexts/ChatContext';
import Sidebar from '../components/Sidebar';
import ChatView from '../components/ChatView';
import ProfileModal from '../components/ProfileModal';
import { MessageCircle } from 'lucide-react';
import { User } from '../types';

export default function ChatPage() {
  const { active } = useChat();
  const [mobileSidebar, setMobileSidebar] = useState(true);
  const [profileUser, setProfileUser] = useState<User | null>(null);

  return (
    <div className="h-screen flex bg-dark-900">
      <div className={`${mobileSidebar ? 'flex' : 'hidden'} md:flex w-full md:w-80 lg:w-96 flex-shrink-0 border-r border-dark-600`}>
        <Sidebar onSelect={() => setMobileSidebar(false)} onProfile={setProfileUser} />
      </div>

      <div className={`${!mobileSidebar ? 'flex' : 'hidden'} md:flex flex-1 flex-col min-w-0`}>
        {active ? (
          <ChatView onBack={() => setMobileSidebar(true)} onProfile={setProfileUser} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 bg-dark-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-10 h-10 text-slate-500" />
              </div>
              <h2 className="text-xl font-semibold text-slate-300 mb-2">gchat</h2>
              <p className="text-slate-500">Выберите чат или начните новый</p>
            </div>
          </div>
        )}
      </div>

      {profileUser && <ProfileModal user={profileUser} onClose={() => setProfileUser(null)} />}
    </div>
  );
}
