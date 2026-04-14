import { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import { api } from '../lib/api';
import Avatar from './Avatar';
import StoryViewer from './StoryViewer';
import { Plus, Camera } from 'lucide-react';
import { StoryGroup } from '../types';

export default function StoriesBar() {
  const { user } = useAuth();
  const { stories, refreshStories } = useChat();
  const [viewing, setViewing] = useState<StoryGroup | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const myStories = stories.find(s => s.user_id === user?.id);
  const otherStories = stories.filter(s => s.user_id !== user?.id);

  const addStory = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const isVideo = f.type.startsWith('video/');
    try {
      const d = await api.upload(f);
      await api.stories.create({ type: isVideo ? 'video' : 'image', mediaUrl: d.url });
      await refreshStories();
    } catch {}
    e.target.value = '';
  };

  return (
    <>
      <div className="flex gap-3 px-4 py-3 overflow-x-auto border-b border-dark-600 flex-shrink-0 scrollbar-none">
        <button onClick={() => myStories ? setViewing(myStories) : fileRef.current?.click()} className="flex flex-col items-center gap-1 flex-shrink-0">
          <div className="relative">
            <Avatar src={user?.avatar} videoSrc={user?.video_avatar} name={user?.display_name || ''} size={48} />
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-accent rounded-full flex items-center justify-center border-2 border-dark-800">
              <Plus size={10} className="text-white" />
            </div>
          </div>
          <span className="text-[10px] text-slate-400 w-14 text-center truncate">Моя</span>
        </button>

        {otherStories.map(sg => (
          <button key={sg.user_id} onClick={() => setViewing(sg)} className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className={`rounded-full p-0.5 ${sg.has_unviewed ? 'bg-gradient-to-tr from-accent to-blue-400' : 'bg-dark-600'}`}>
              <div className="bg-dark-800 rounded-full p-0.5">
                <Avatar src={sg.avatar} videoSrc={sg.video_avatar} name={sg.display_name || sg.username} size={44} />
              </div>
            </div>
            <span className="text-[10px] text-slate-400 w-14 text-center truncate">{sg.display_name || sg.username}</span>
          </button>
        ))}
        <input ref={fileRef} type="file" className="hidden" accept="image/*,video/*" onChange={addStory} />
      </div>

      {viewing && <StoryViewer group={viewing} onClose={() => { setViewing(null); refreshStories(); }} />}
    </>
  );
}
