import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import { api } from '../lib/api';
import { topicPreviewSubtitle } from '../lib/topicPreviewSubtitle';
import { formatKaliningradListTime } from '../lib/datetime';
import { Hash, ChevronRight, Pin } from 'lucide-react';
import type { GroupTopic } from '../types';

/** Экран выбора темы при входе в группу с включёнными темами */
export default function GroupTopicsGate() {
  const { user } = useAuth();
  const { active, activeTopicId, selectGroupTopic, conversations } = useChat();
  const [topics, setTopics] = useState<GroupTopic[]>([]);
  const [loading, setLoading] = useState(true);

  const convMeta = conversations.find(c => c.id === active?.id);

  useEffect(() => {
    if (!active?.id || active.type !== 'group' || !active.topics_enabled) return;
    setLoading(true);
    api.conversations
      .topics(active.id)
      .then(d => setTopics(d.topics || []))
      .catch(() => setTopics([]))
      .finally(() => setLoading(false));
  }, [active?.id, active?.topics_enabled, convMeta?.last_message_at]);

  if (!active || active.type !== 'group' || !active.topics_enabled || activeTopicId) return null;

  return (
    <div className="absolute inset-0 z-[50] flex flex-col bg-dark-900 border-t border-dark-700/80">
      <div className="px-4 py-3 border-b border-dark-600 flex-shrink-0">
        <h2 className="text-base font-bold text-white">Темы</h2>
        <p className="text-xs text-slate-500 mt-1">Выбери тему, чтобы открыть переписку</p>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : topics.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-12 px-4">Тем пока нет. Попроси админа включить темы в профиле группы.</p>
        ) : (
          topics.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectGroupTopic(t.id)}
              className="sidebar-chat-row w-full flex items-start gap-3 px-4 py-3.5 text-left border-b border-dark-700/60 hover:bg-dark-800/80 transition"
            >
              <div className="relative w-11 h-11 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0 ring-1 ring-accent/25 mt-0.5">
                <Hash size={20} className="text-accent-light" />
                {(t.pinned ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-dark-800 border border-amber-500/80 flex items-center justify-center">
                    <Pin size={10} className="text-amber-400 fill-amber-400" />
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white truncate flex items-center gap-2 min-w-0">
                    {t.name}
                    {(t.unread_count ?? 0) > 0 && (
                      <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white leading-none">
                        {(t.unread_count ?? 0) > 99 ? '99+' : t.unread_count}
                      </span>
                    )}
                  </p>
                  <span className="text-[10px] text-slate-500 whitespace-nowrap flex-shrink-0">
                    {formatKaliningradListTime(t.last_message_at)}
                  </span>
                </div>
                <p className="text-xs text-slate-400 truncate mt-0.5">{topicPreviewSubtitle(t, active.members, user?.id)}</p>
              </div>
              <ChevronRight size={18} className="text-slate-500 flex-shrink-0 mt-3" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
