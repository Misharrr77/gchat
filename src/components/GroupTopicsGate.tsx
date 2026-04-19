import { useEffect, useState } from 'react';
import { useChat } from '../contexts/ChatContext';
import { api } from '../lib/api';
import { Hash, ChevronRight } from 'lucide-react';
import type { GroupTopic } from '../types';

/** Экран выбора темы при входе в группу с включёнными темами */
export default function GroupTopicsGate() {
  const { active, activeTopicId, selectGroupTopic } = useChat();
  const [topics, setTopics] = useState<GroupTopic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!active?.id || active.type !== 'group' || !active.topics_enabled) return;
    setLoading(true);
    api.conversations
      .topics(active.id)
      .then(d => setTopics(d.topics || []))
      .catch(() => setTopics([]))
      .finally(() => setLoading(false));
  }, [active?.id, active?.topics_enabled]);

  if (!active || active.type !== 'group' || !active.topics_enabled || activeTopicId) return null;

  return (
    <div className="absolute inset-0 z-[50] flex flex-col bg-dark-900 border-t border-dark-700/80">
      <div className="px-4 py-3 border-b border-dark-600 flex-shrink-0">
        <h2 className="text-base font-bold text-white">Темы</h2>
        <p className="text-xs text-slate-500 mt-1">Выберите тему, чтобы открыть переписку</p>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : topics.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-12 px-4">Тем пока нет. Админ может включить темы в профиле группы.</p>
        ) : (
          topics.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectGroupTopic(t.id)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left border-b border-dark-700/60 hover:bg-dark-800/80 transition"
            >
              <div className="w-11 h-11 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0 ring-1 ring-accent/25">
                <Hash size={20} className="text-accent-light" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{t.name}</p>
              </div>
              <ChevronRight size={18} className="text-slate-500 flex-shrink-0" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
