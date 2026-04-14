import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import Avatar from './Avatar';
import { X, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { StoryGroup, Story } from '../types';

export default function StoryViewer({ group, onClose }: { group: StoryGroup; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<NodeJS.Timeout>();
  const story = group.stories[idx];
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!story) return;
    if (!story.viewed) api.stories.view(story.id).catch(() => {});
    setProgress(0);
    const dur = story.type === 'video' ? 15000 : 5000;
    const step = 50;
    let elapsed = 0;
    timerRef.current = setInterval(() => {
      elapsed += step;
      setProgress(elapsed / dur);
      if (elapsed >= dur) {
        if (idx < group.stories.length - 1) setIdx(i => i + 1);
        else onClose();
      }
    }, step);
    return () => clearInterval(timerRef.current);
  }, [idx, story?.id]);

  if (!story) return null;

  const prev = () => { if (idx > 0) setIdx(i => i - 1); };
  const next = () => { if (idx < group.stories.length - 1) setIdx(i => i + 1); else onClose(); };

  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
      <div className="relative w-full max-w-md h-full max-h-[100dvh] bg-dark-900 flex flex-col">
        <div className="flex gap-1 px-2 pt-2 flex-shrink-0">
          {group.stories.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 bg-dark-600 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-100" style={{ width: `${i < idx ? 100 : i === idx ? progress * 100 : 0}%` }} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0">
          <Avatar src={group.avatar} videoSrc={group.video_avatar} name={group.display_name || group.username} size={36} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{group.display_name || group.username}</p>
          </div>
          {story.view_count > 0 && <span className="flex items-center gap-1 text-xs text-slate-400"><Eye size={12} />{story.view_count}</span>}
          <button onClick={onClose} className="p-1.5 hover:bg-dark-700 rounded-lg text-white"><X size={18} /></button>
        </div>
        <div className="flex-1 flex items-center justify-center overflow-hidden relative">
          {story.type === 'image' && story.media_url && <img src={story.media_url} className="max-w-full max-h-full object-contain" />}
          {story.type === 'video' && story.media_url && <video src={story.media_url} autoPlay muted className="max-w-full max-h-full object-contain" />}
          {story.type === 'text' && (
            <div className="w-full h-full flex items-center justify-center p-8" style={{ backgroundColor: story.bg_color }}>
              <p className="text-xl font-bold text-white text-center">{story.text_content}</p>
            </div>
          )}
          <button onClick={prev} className="absolute left-0 top-0 w-1/3 h-full z-10" />
          <button onClick={next} className="absolute right-0 top-0 w-1/3 h-full z-10" />
        </div>
      </div>
    </div>
  );
}
