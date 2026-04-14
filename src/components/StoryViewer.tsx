import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import Avatar from './Avatar';
import { X, Eye } from 'lucide-react';
import { StoryGroup } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';

interface Props {
  group: StoryGroup;
  onClose: () => void;
}

export default function StoryViewer({ group, onClose }: Props) {
  const [idx, setIdx] = useState(0);
  const story = group.stories[idx];
  const [progress, setProgress] = useState(0);

  const next = useCallback(() => {
    if (idx < group.stories.length - 1) setIdx(i => i + 1);
    else onClose();
  }, [idx, group.stories.length, onClose]);

  const prev = useCallback(() => {
    if (idx > 0) setIdx(i => i - 1);
  }, [idx]);

  useEffect(() => {
    if (story) api.stories.view(story.id).catch(() => {});
  }, [story?.id]);

  useEffect(() => {
    setProgress(0);
    const duration = story?.type === 'video' ? 15000 : 5000;
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { next(); return 0; }
        return p + 100 / (duration / 50);
      });
    }, 50);
    return () => clearInterval(interval);
  }, [idx, story?.type, next]);

  if (!story) return null;

  const time = (() => {
    try { return formatDistanceToNow(new Date(story.created_at + 'Z'), { addSuffix: true, locale: ru }); }
    catch { return ''; }
  })();

  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
      <div className="relative w-full max-w-lg h-full max-h-[90vh] flex flex-col">
        <div className="flex gap-1 px-3 pt-3 pb-2">
          {group.stories.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-100" style={{ width: i < idx ? '100%' : i === idx ? `${progress}%` : '0%' }} />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 px-4 py-2">
          <Avatar src={group.avatar} name={group.display_name || group.username} size={36} />
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{group.display_name || group.username}</p>
            <p className="text-white/60 text-xs">{time}</p>
          </div>
          <div className="flex items-center gap-1 text-white/60 text-xs">
            <Eye size={14} />
            <span>{story.view_count || 0}</span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-white"><X size={20} /></button>
        </div>

        <div className="flex-1 flex items-center justify-center relative overflow-hidden rounded-xl mx-3 mb-3">
          {story.type === 'text' ? (
            <div className="w-full h-full flex items-center justify-center p-8 rounded-xl" style={{ backgroundColor: story.bg_color }}>
              <p className="text-white text-2xl font-bold text-center">{story.text_content}</p>
            </div>
          ) : story.type === 'video' ? (
            <video src={story.media_url || ''} className="max-w-full max-h-full object-contain" autoPlay playsInline />
          ) : (
            <img src={story.media_url || ''} className="max-w-full max-h-full object-contain" alt="" />
          )}

          <div className="absolute inset-0 flex">
            <div className="w-1/3 cursor-pointer" onClick={prev} />
            <div className="w-1/3" />
            <div className="w-1/3 cursor-pointer" onClick={next} />
          </div>
        </div>
      </div>
    </div>
  );
}
