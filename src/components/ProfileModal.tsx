import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import Avatar from './Avatar';
import { X, Edit3, Camera, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { User } from '../types';

export default function ProfileModal({ user: pu, onClose }: { user: User; onClose: () => void }) {
  const { user: me, updateUser } = useAuth();
  const self = me?.id === pu.id;
  const [editing, setEditing] = useState(false);
  const [dn, setDn] = useState(pu.display_name);
  const [bio, setBio] = useState(pu.bio);
  const [status, setStatus] = useState(pu.status);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try { const d = await api.users.updateProfile({ displayName: dn, bio, status }); updateUser(d.user); setEditing(false); } catch { /* ignore */ }
    setSaving(false);
  };

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { const d = await api.upload(f); const r = await api.users.updateProfile({ avatar: d.url }); updateUser(r.user); } catch { /* ignore */ }
  };

  const joined = (() => { try { return format(new Date(pu.created_at + 'Z'), 'LLLL yyyy', { locale: ru }); } catch { return ''; } })();

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-dark-800 rounded-2xl border border-dark-600 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="h-24 bg-gradient-to-r from-accent/40 to-blue-900/40 relative">
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 bg-dark-900/50 hover:bg-dark-900/80 rounded-lg text-white transition"><X size={16} /></button>
        </div>
        <div className="px-6 -mt-12 relative">
          <div className="relative inline-block">
            <Avatar src={pu.avatar} name={pu.display_name || pu.username} size={80} />
            {self && (
              <label className="absolute bottom-0 right-0 p-1.5 bg-accent rounded-full cursor-pointer hover:bg-accent-hover transition">
                <Camera size={12} className="text-white" />
                <input type="file" className="hidden" accept="image/*" onChange={uploadAvatar} />
              </label>
            )}
          </div>
        </div>
        <div className="p-6 pt-3">
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Имя</label>
                <input value={dn} onChange={e => setDn(e.target.value)} className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-white focus:outline-none focus:border-accent transition" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Статус</label>
                <input value={status} onChange={e => setStatus(e.target.value)} className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-white focus:outline-none focus:border-accent transition" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">О себе</label>
                <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-white focus:outline-none focus:border-accent transition resize-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={save} disabled={saving} className="flex-1 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition disabled:opacity-50">
                  {saving ? 'Сохраняю...' : 'Сохранить'}
                </button>
                <button onClick={() => setEditing(false)} className="flex-1 py-2 bg-dark-700 hover:bg-dark-600 text-white text-sm rounded-lg transition">Отмена</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-bold text-white">{pu.display_name || pu.username}</h3>
                {self && <button onClick={() => setEditing(true)} className="p-2 hover:bg-dark-700 rounded-lg text-slate-400 hover:text-white transition"><Edit3 size={16} /></button>}
              </div>
              <p className="text-sm text-accent mb-3">@{pu.username}</p>
              {pu.status && <p className="text-sm text-slate-300 mb-2">{pu.status}</p>}
              {pu.bio && <p className="text-sm text-slate-400 mb-3">{pu.bio}</p>}
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Calendar size={12} />
                <span>Присоединился {joined}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
