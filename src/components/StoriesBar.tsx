import { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import { api } from '../lib/api';
import Avatar from './Avatar';
import { Plus } from 'lucide-react';
import { StoryGroup } from '../types';

interface Props {
  stories: StoryGroup[];
  onView: (g: StoryGroup) => void;
}

export default function StoriesBar({ stories, onView }: Props) {
  const { user } = useAuth();
  const { refreshStories } = useChat();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const myStories = stories.find(s => s.user_id === user?.id);
  const otherStories = stories.filter(s => s.user_id !== user?.id);

  const addStory = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const d = await api.upload(f);
      const type = f.type.startsWith('video') ? 'video' : 'image';
      await api.stories.create({ type, mediaUrl: d.url });
      await refreshStories();
    } catch { /* ignore */ }
    setUploading(false);
    e.target.value = '';
  };

  return (
    <div className="flex gap-3 px-4 py-3 overflow-x-auto border-b border-dark-600 no-scrollbar">
      <div
        className="flex flex-col items-center gap-1 flex-shrink-0 cursor-pointer"
        onClick={() => myStories ? onView(myStories) : fileRef.current?.click()}
      >
        <div className="relative">
          <Avatar src={user?.avatar} videoSrc={user?.video_avatar} name={user?.display_name || ''} size={52} />
          {!myStories && (
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-accent rounded-full flex items-center justify-center border-2 border-dark-800">
              <Plus size={10} className="text-white" />
            </div>
          )}
          {myStories && <div className="absolute inset-0 rounded-full border-2 border-accent pointer-events-none" style={{ width: 52, height: 52 }} />}
        </div>
        <span className="text-[10px] text-slate-400 w-14 text-center truncate">
          {uploading ? '...' : 'Моя'}
        </span>
      </div>

      {otherStories.map(g => (
        <div key={g.user_id} className="flex flex-col items-center gap-1 flex-shrink-0 cursor-pointer" onClick={() => onView(g)}>
          <div className="relative">
            <Avatar src={g.avatar} name={g.display_name || g.username} size={52} />
            <div className={`absolute inset-0 rounded-full border-2 pointer-events-none ${g.has_unviewed ? 'border-accent' : 'border-slate-600'}`} style={{ width: 52, height: 52 }} />
          </div>
          <span className="text-[10px] text-slate-400 w-14 text-center truncate">{g.display_name || g.username}</span>
        </div>
      ))}

      <input type="file" ref={fileRef} className="hidden" accept="image/*,video/*" onChange={addStory} />
    </div>
  );
}
