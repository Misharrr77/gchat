import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import { api } from '../lib/api';
import Avatar from './Avatar';
import { X, Edit3, Camera, Users, Radio, Shield, UserMinus, UserPlus, LogOut, Search, Crown, Hash, Trash2, ChevronUp, ChevronDown, Pin } from 'lucide-react';
import { Conversation, GroupTopic, User } from '../types';
import { topicPreviewSubtitle } from '../lib/topicPreviewSubtitle';
import { formatKaliningradListTime } from '../lib/datetime';

export default function GroupProfileModal({
  conversation: conv,
  onClose,
  onOpenMemberProfile,
}: {
  conversation: Conversation;
  onClose: () => void;
  onOpenMemberProfile?: (u: User) => void;
}) {
  const { user: me } = useAuth();
  const { refresh, setActive } = useChat();
  const myRole = conv.members?.find(m => m.id === me?.id)?.role;
  const isAdmin = myRole === 'admin';

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(conv.name || '');
  const [desc, setDesc] = useState(conv.description || '');
  const [isPublic, setIsPublic] = useState(!!conv.is_public);
  const [saving, setSaving] = useState(false);
  const [addingMembers, setAddingMembers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [topics, setTopics] = useState<GroupTopic[]>([]);
  const [topicsEnabled, setTopicsEnabled] = useState(!!conv.topics_enabled);
  const [newTopicName, setNewTopicName] = useState('');
  const [renameTopicId, setRenameTopicId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  useEffect(() => {
    setTopicsEnabled(!!conv.topics_enabled);
  }, [conv.topics_enabled]);

  useEffect(() => {
    if (conv.type !== 'group') return;
    api.conversations
      .topics(conv.id)
      .then(d => {
        setTopics(d.topics || []);
        setTopicsEnabled(!!d.topics_enabled);
      })
      .catch(() => {});
  }, [conv.id, conv.type]);

  const save = async () => {
    setSaving(true);
    try { await api.conversations.update(conv.id, { name, description: desc, isPublic }); await refresh(); } catch {}
    setSaving(false); setEditing(false);
  };

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { const d = await api.upload(f); await api.conversations.update(conv.id, { avatar: d.url }); await refresh(); } catch {}
  };

  const setRole = async (userId: string, role: string) => {
    try { await api.conversations.setRole(conv.id, userId, role); await refresh(); } catch {}
  };

  const removeMember = async (userId: string) => {
    try { await api.conversations.removeMember(conv.id, userId); await refresh(); } catch {}
  };

  const leaveGroup = async () => {
    try { await api.conversations.removeMember(conv.id, me!.id); await refresh(); setActive(null); onClose(); } catch {}
  };

  const searchUsers = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try { const d = await api.users.search(q); setSearchResults(d.users.filter((u: User) => !conv.members?.some(m => m.id === u.id))); } catch {}
  };

  const addMember = async (userId: string) => {
    try { await api.conversations.addMembers(conv.id, [userId]); await refresh(); setSearchResults(r => r.filter(u => u.id !== userId)); } catch {}
  };

  const toggleTopicsEnabled = async () => {
    if (!isAdmin || conv.type !== 'group') return;
    try {
      await api.conversations.update(conv.id, { topicsEnabled: !topicsEnabled });
      await refresh();
      setTopicsEnabled(!topicsEnabled);
      const d = await api.conversations.topics(conv.id);
      setTopics(d.topics || []);
    } catch {}
  };

  const addTopic = async () => {
    const n = newTopicName.trim();
    if (!n || !isAdmin || conv.type !== 'group') return;
    try {
      await api.conversations.topicCreate(conv.id, n);
      const d = await api.conversations.topics(conv.id);
      setTopics(d.topics || []);
      setNewTopicName('');
    } catch {}
  };

  const deleteTopic = async (topicId: string) => {
    if (!isAdmin || conv.type !== 'group') return;
    try {
      await api.conversations.topicDelete(conv.id, topicId);
      const d = await api.conversations.topics(conv.id);
      setTopics(d.topics || []);
      await refresh();
    } catch {}
  };

  const saveRenameTopic = async () => {
    if (!renameTopicId || !isAdmin || conv.type !== 'group') return;
    const n = renameDraft.trim().slice(0, 120);
    if (!n) return;
    try {
      await api.conversations.topicRename(conv.id, renameTopicId, n);
      const d = await api.conversations.topics(conv.id);
      setTopics(d.topics || []);
      setRenameTopicId(null);
      await refresh();
    } catch {}
  };

  const moveTopic = async (topicId: string, direction: 'up' | 'down') => {
    if (!isAdmin || conv.type !== 'group') return;
    try {
      const d = await api.conversations.topicMove(conv.id, topicId, direction);
      setTopics(d.topics || []);
      await refresh();
    } catch {}
  };

  const togglePinTopic = async (topicId: string, nextPinned: boolean) => {
    if (!isAdmin || conv.type !== 'group') return;
    try {
      await api.conversations.topicPatch(conv.id, topicId, { pinned: nextPinned });
      const d = await api.conversations.topics(conv.id);
      setTopics(d.topics || []);
      await refresh();
    } catch {}
  };

  const isChannel = conv.type === 'channel';

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-dark-800 rounded-t-2xl sm:rounded-2xl border-t sm:border border-dark-600 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="h-20 relative flex-shrink-0 bg-gradient-to-r from-accent/20 to-blue-900/20">
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 bg-dark-900/50 hover:bg-dark-900/80 rounded-lg text-white transition z-10"><X size={16} /></button>
        </div>

        <div className="px-5 -mt-8 flex items-end gap-3 flex-shrink-0 relative z-10">
          <div className="relative flex-shrink-0">
            <Avatar src={conv.avatar} name={conv.name || ''} size={56} />
            {isAdmin && <label className="absolute -bottom-0.5 -right-0.5 p-1 bg-accent rounded-full cursor-pointer hover:bg-accent-hover transition"><Camera size={9} className="text-white" /><input type="file" className="hidden" accept="image/*" onChange={uploadAvatar} /></label>}
          </div>
          <div className="pb-1 min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {isChannel ? <Radio size={13} className="text-accent" /> : <Users size={13} className="text-accent" />}
              <h3 className="text-base font-bold text-white truncate drop-shadow-lg">{conv.name}</h3>
            </div>
            <p className="text-xs text-slate-300 drop-shadow">{conv.member_count} уч. · {conv.is_public ? 'Публичный' : 'Приватный'}</p>
          </div>
          {isAdmin && <button onClick={() => setEditing(!editing)} className="p-2 hover:bg-dark-700 rounded-lg text-slate-400 hover:text-white transition mb-1 flex-shrink-0"><Edit3 size={15} /></button>}
        </div>

        <div className="flex-1 overflow-y-auto">
          {editing ? (
            <div className="p-5 space-y-3">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Название" className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-xl text-sm text-white focus:outline-none focus:border-accent" />
              <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Описание" rows={3} className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-xl text-sm text-white focus:outline-none focus:border-accent resize-none" />
              <label className="flex items-center gap-3 p-3 bg-dark-700 rounded-xl cursor-pointer">
                <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="accent-accent w-4 h-4" />
                <div><p className="text-sm text-white">Публичный</p><p className="text-xs text-slate-400">Можно найти в поиске</p></div>
              </label>
              <div className="flex gap-2">
                <button onClick={save} disabled={saving} className="flex-1 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-xl transition disabled:opacity-50">{saving ? '...' : 'Сохранить'}</button>
                <button onClick={() => setEditing(false)} className="flex-1 py-2 bg-dark-700 text-white text-sm rounded-xl">Отмена</button>
              </div>
            </div>
          ) : (
            <div className="p-5">
              {conv.description && <p className="text-sm text-slate-300 mb-4">{conv.description}</p>}

              {conv.type === 'group' && isAdmin && (
                <div className="mb-6 p-3 rounded-xl bg-dark-700/50 border border-dark-600/80">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-accent mt-1 w-4 h-4 flex-shrink-0"
                      checked={topicsEnabled}
                      onChange={toggleTopicsEnabled}
                    />
                    <div>
                      <p className="text-sm font-medium text-white">Темы в группе</p>
                      <p className="text-xs text-slate-500 mt-1">
                        При включении весь текущий чат попадает в тему «Основной чат». Перед общением выбери тему.
                      </p>
                    </div>
                  </label>
                  {topicsEnabled && (
                    <div className="mt-4 space-y-2 border-t border-dark-600 pt-3">
                      <p className="text-xs text-slate-400 uppercase tracking-wide">Темы</p>
                      {topics.map(t => (
                        <div key={t.id} className="rounded-lg bg-dark-800/80 border border-dark-600/50 overflow-hidden">
                          <div className="flex items-start gap-2 py-2 px-2">
                            <Hash size={14} className="text-accent flex-shrink-0 mt-1" />
                            {renameTopicId === t.id ? (
                              <div className="flex-1 flex gap-1 min-w-0">
                                <input
                                  value={renameDraft}
                                  onChange={e => setRenameDraft(e.target.value)}
                                  className="flex-1 min-w-0 px-2 py-1 bg-dark-700 border border-dark-600 rounded-lg text-sm text-white focus:outline-none focus:border-accent"
                                  autoFocus
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') saveRenameTopic();
                                    if (e.key === 'Escape') setRenameTopicId(null);
                                  }}
                                />
                                <button type="button" onClick={saveRenameTopic} className="px-2 py-1 text-xs bg-accent text-white rounded-lg">
                                  ОК
                                </button>
                                <button type="button" onClick={() => setRenameTopicId(null)} className="px-2 py-1 text-xs text-slate-400">
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1">
                                    <span className="text-sm text-white font-medium truncate">{t.name}</span>
                                    {(t.pinned ?? 0) > 0 && <Pin size={12} className="text-amber-400 fill-amber-400 flex-shrink-0" />}
                                  </div>
                                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                    {topicPreviewSubtitle(t, conv.members, me?.id)}
                                    {t.last_message_at ? ` · ${formatKaliningradListTime(t.last_message_at)}` : ''}
                                  </p>
                                </div>
                                {isAdmin && (
                                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                                    <div className="flex items-center gap-0.5">
                                      <button
                                        type="button"
                                        onClick={() => moveTopic(t.id, 'up')}
                                        className="p-1 text-slate-500 hover:text-white rounded-md hover:bg-dark-700"
                                        title="Выше"
                                      >
                                        <ChevronUp size={15} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => moveTopic(t.id, 'down')}
                                        className="p-1 text-slate-500 hover:text-white rounded-md hover:bg-dark-700"
                                        title="Ниже"
                                      >
                                        <ChevronDown size={15} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => togglePinTopic(t.id, !(t.pinned ?? 0))}
                                        className={`p-1 rounded-md hover:bg-dark-700 ${(t.pinned ?? 0) ? 'text-amber-400' : 'text-slate-500 hover:text-amber-300'}`}
                                        title={(t.pinned ?? 0) ? 'Открепить' : 'Закрепить'}
                                      >
                                        <Pin size={15} className={(t.pinned ?? 0) ? 'fill-amber-400' : ''} />
                                      </button>
                                    </div>
                                    <div className="flex items-center justify-end gap-0.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setRenameTopicId(t.id);
                                          setRenameDraft(t.name);
                                        }}
                                        className="p-1.5 text-slate-500 hover:text-accent"
                                        aria-label="Переименовать тему"
                                      >
                                        <Edit3 size={14} />
                                      </button>
                                      {topics.length > 1 && (
                                        <button type="button" onClick={() => deleteTopic(t.id)} className="p-1.5 text-slate-500 hover:text-red-400" aria-label="Удалить тему">
                                          <Trash2 size={14} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-2 mt-2">
                        <input
                          value={newTopicName}
                          onChange={e => setNewTopicName(e.target.value)}
                          placeholder="Новая тема…"
                          className="flex-1 px-3 py-2 bg-dark-700 border border-dark-600 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent"
                          onKeyDown={e => e.key === 'Enter' && addTopic()}
                        />
                        <button type="button" onClick={addTopic} className="px-3 py-2 bg-accent text-white text-sm rounded-xl hover:bg-accent-hover">
                          Добавить
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-slate-300">
                    {isChannel ? 'Подписчики' : 'Участники'} ({conv.member_count})
                  </h4>
                  {isAdmin && <button onClick={() => setAddingMembers(!addingMembers)} className="p-1.5 hover:bg-dark-700 rounded-lg text-accent"><UserPlus size={16} /></button>}
                </div>
                {addingMembers && isAdmin && (
                  <div className="mb-4">
                    <div className="relative mb-2">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input value={searchQuery} onChange={e => searchUsers(e.target.value)} placeholder="Найти по имени..." className="w-full pl-8 pr-3 py-2 bg-dark-700 border border-dark-600 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent" autoFocus />
                    </div>
                    {searchResults.map(u => (
                      <div key={u.id} className="flex items-center gap-2 py-1.5">
                        <Avatar src={u.avatar} name={u.display_name || u.username} size={32} />
                        <span className="text-sm text-white flex-1 truncate">{u.display_name || u.username}</span>
                        <button onClick={() => addMember(u.id)} className="px-2 py-1 bg-accent/20 text-accent text-xs rounded-lg hover:bg-accent/30">Добавить</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-0.5">
                  {conv.members?.map(m => (
                    <div
                      key={m.id}
                      role={onOpenMemberProfile ? 'button' : undefined}
                      onClick={onOpenMemberProfile ? () => onOpenMemberProfile(m) : undefined}
                      className={`flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-dark-700/50 ${onOpenMemberProfile ? 'cursor-pointer' : ''}`}
                    >
                      <Avatar src={m.avatar} videoSrc={m.video_avatar} name={m.display_name || m.username} size={36} online={m.is_online === 1} />
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm text-white truncate">{m.display_name || m.username}</p>
                        <p className="text-xs text-slate-400">@{m.username}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        {conv.creator_id === m.id && <Crown size={13} className="text-yellow-400" />}
                        {m.role === 'admin' && conv.creator_id !== m.id && <Shield size={13} className="text-accent" />}
                        {isAdmin && m.id !== me?.id && (
                          <>
                            <button type="button" onClick={() => setRole(m.id, m.role !== 'admin' ? 'admin' : 'member')} className="p-1 hover:bg-dark-600 rounded text-slate-500 hover:text-accent transition"><Shield size={13} /></button>
                            <button type="button" onClick={() => removeMember(m.id)} className="p-1 hover:bg-dark-600 rounded text-slate-500 hover:text-red-400 transition"><UserMinus size={13} /></button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
              <button onClick={leaveGroup} className="mt-5 w-full py-2.5 border border-red-500/30 text-red-400 text-sm rounded-xl hover:bg-red-500/10 transition flex items-center justify-center gap-2">
                <LogOut size={15} />Покинуть
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
