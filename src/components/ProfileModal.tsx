import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import Avatar from './Avatar';
import { X, Camera, Edit3, Plus, Trash2, ImagePlus, Music, User as UserIcon, Play, Pause, Upload } from 'lucide-react';
import { User, AlbumPhoto, ProfileTrack } from '../types';
import { format, parseISO } from 'date-fns';

type Tab = 'profile' | 'album' | 'music';

export default function ProfileModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { user: me, updateUser } = useAuth();
  const isMe = me?.id === userId;
  const [profile, setProfile] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('profile');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [tracks, setTracks] = useState<ProfileTrack[]>([]);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    api.users.get(userId).then(d => { setProfile(d.user); setName(d.user.display_name); setBio(d.user.bio || ''); setStatus(d.user.status || ''); });
    api.albums.list(userId).then(d => setPhotos(d.photos));
    api.music.list(userId).then(d => setTracks(d.tracks));
  }, [userId]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const d = await api.users.updateProfile({ displayName: name, bio, status });
      setProfile(d.user); updateUser(d.user);
    } catch {}
    setSaving(false); setEditing(false);
  };

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const isVideo = f.type.startsWith('video/');
    try {
      const d = await api.upload(f);
      const update = isVideo ? { videoAvatar: d.url, avatar: undefined } : { avatar: d.url, videoAvatar: undefined };
      const r = await api.users.updateProfile(update);
      setProfile(r.user); updateUser(r.user);
    } catch {}
  };

  const uploadHeader = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { const d = await api.upload(f); const r = await api.users.updateProfile({ profileHeader: d.url }); setProfile(r.user); updateUser(r.user); } catch {}
  };

  const addPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      try { const d = await api.upload(f); const r = await api.albums.add({ url: d.url }); setPhotos(p => [r.photo, ...p]); } catch {}
    }
  };

  const deletePhoto = async (id: string) => {
    try { await api.albums.delete(id); setPhotos(p => p.filter(x => x.id !== id)); } catch {}
  };

  const addMusic = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const title = f.name.replace(/\.[^/.]+$/, '');
    try { const d = await api.upload(f); const r = await api.music.add({ title, url: d.url }); setTracks(p => [r.track, ...p]); } catch {}
  };

  const deleteTrack = async (id: string) => {
    if (playingTrack === id) { audioRef.current?.pause(); setPlayingTrack(null); }
    try { await api.music.delete(id); setTracks(p => p.filter(x => x.id !== id)); } catch {}
  };

  const togglePlay = (t: ProfileTrack) => {
    if (playingTrack === t.id) { audioRef.current?.pause(); setPlayingTrack(null); return; }
    setPlayingTrack(t.id);
    if (audioRef.current) { audioRef.current.src = t.url; audioRef.current.play(); }
  };

  if (!profile) return null;
  const joined = (() => { try { return format(parseISO(profile.created_at), 'dd.MM.yyyy'); } catch { return ''; } })();

  const tabClass = (t: Tab) => tab === t
    ? 'flex-1 py-2.5 text-xs font-semibold text-accent border-b-2 border-accent'
    : 'flex-1 py-2.5 text-xs text-slate-400 hover:text-white border-b-2 border-transparent';

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-dark-800 rounded-2xl border border-dark-600 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="h-28 relative flex-shrink-0" style={profile.profile_header ? { background: `url(${profile.profile_header}) center/cover` } : { background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)' }}>
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 bg-dark-900/50 hover:bg-dark-900/80 rounded-lg text-white transition"><X size={16} /></button>
          {isMe && <label className="absolute top-3 left-3 p-1.5 bg-dark-900/50 hover:bg-dark-900/80 rounded-lg text-white transition cursor-pointer"><Camera size={14} /><input type="file" className="hidden" accept="image/*" onChange={uploadHeader} /></label>}
        </div>

        <div className="px-6 -mt-10 flex items-end gap-4 flex-shrink-0">
          <div className="relative flex-shrink-0">
            <Avatar src={profile.avatar} videoSrc={profile.video_avatar} name={profile.display_name} size={72} />
            {isMe && <label className="absolute bottom-0 right-0 p-1.5 bg-accent rounded-full cursor-pointer hover:bg-accent-hover transition"><Camera size={10} className="text-white" /><input type="file" className="hidden" accept="image/*,video/mp4,video/webm" onChange={uploadAvatar} /></label>}
          </div>
          <div className="pb-1 min-w-0 flex-1">
            <h3 className="text-lg font-bold text-white truncate">{profile.display_name}</h3>
            <p className="text-xs text-slate-400">@{profile.username}</p>
          </div>
          {isMe && !editing && <button onClick={() => setEditing(true)} className="p-2 hover:bg-dark-700 rounded-lg text-slate-400 hover:text-white transition mb-1"><Edit3 size={16} /></button>}
        </div>

        <div className="flex border-b border-dark-600 mt-3 flex-shrink-0">
          <button onClick={() => setTab('profile')} className={tabClass('profile')}><UserIcon size={14} className="inline mr-1" />Профиль</button>
          <button onClick={() => setTab('album')} className={tabClass('album')}><ImagePlus size={14} className="inline mr-1" />Альбом</button>
          <button onClick={() => setTab('music')} className={tabClass('music')}><Music size={14} className="inline mr-1" />Музыка</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === 'profile' && (
            <div className="p-6 space-y-4">
              {editing ? (
                <>
                  <div><label className="text-xs text-slate-400 mb-1 block">Имя</label><input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-white focus:outline-none focus:border-accent" /></div>
                  <div><label className="text-xs text-slate-400 mb-1 block">Статус</label><input value={status} onChange={e => setStatus(e.target.value)} className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-white focus:outline-none focus:border-accent" maxLength={60} /></div>
                  <div><label className="text-xs text-slate-400 mb-1 block">О себе</label><textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-white focus:outline-none focus:border-accent resize-none" /></div>
                  <div className="flex gap-2"><button onClick={saveProfile} disabled={saving} className="flex-1 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition disabled:opacity-50">{saving ? '...' : 'Сохранить'}</button><button onClick={() => setEditing(false)} className="flex-1 py-2 bg-dark-700 text-white text-sm rounded-lg">Отмена</button></div>
                </>
              ) : (
                <>
                  {profile.status && <div className="p-3 bg-dark-700/50 rounded-xl"><p className="text-sm text-slate-300">{profile.status}</p></div>}
                  {profile.bio && <div><label className="text-xs text-slate-500 mb-1 block">О себе</label><p className="text-sm text-slate-300">{profile.bio}</p></div>}
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>В gchat с {joined}</span>
                    <span className={`flex items-center gap-1 ${profile.is_online ? 'text-green-400' : ''}`}><span className={`w-1.5 h-1.5 rounded-full ${profile.is_online ? 'bg-green-400' : 'bg-slate-600'}`} />{profile.is_online ? 'в сети' : 'не в сети'}</span>
                  </div>
                  <div className="pt-2 flex items-center justify-between text-sm text-slate-400">
                    <span>Альбом: {photos.length} фото</span>
                    <span>Музыка: {tracks.length} трек(ов)</span>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'album' && (
            <div className="p-4">
              {isMe && (
                <label className="flex items-center justify-center gap-2 mb-4 p-3 border-2 border-dashed border-dark-600 rounded-xl text-sm text-slate-400 hover:border-accent hover:text-accent transition cursor-pointer">
                  <Upload size={16} />Добавить фото
                  <input type="file" className="hidden" accept="image/*" multiple onChange={addPhoto} />
                </label>
              )}
              {photos.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-8">Нет фото</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {photos.map(p => (
                    <div key={p.id} className="relative group aspect-square rounded-lg overflow-hidden cursor-pointer" onClick={() => setPreviewImg(p.url)}>
                      <img src={p.url} alt="" className="w-full h-full object-cover" />
                      {isMe && (
                        <button onClick={e => { e.stopPropagation(); deletePhoto(p.id); }} className="absolute top-1 right-1 p-1 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition text-white hover:text-red-400"><Trash2 size={12} /></button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'music' && (
            <div className="p-4">
              {isMe && (
                <label className="flex items-center justify-center gap-2 mb-4 p-3 border-2 border-dashed border-dark-600 rounded-xl text-sm text-slate-400 hover:border-accent hover:text-accent transition cursor-pointer">
                  <Upload size={16} />Добавить музыку
                  <input type="file" className="hidden" accept="audio/*" onChange={addMusic} />
                </label>
              )}
              {tracks.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-8">Нет музыки</p>
              ) : (
                <div className="space-y-1">
                  {tracks.map(t => (
                    <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-dark-700/50 transition group">
                      <button onClick={() => togglePlay(t)} className="w-9 h-9 bg-accent/20 rounded-full flex items-center justify-center flex-shrink-0 hover:bg-accent/30 transition">
                        {playingTrack === t.id ? <Pause size={16} className="text-accent" /> : <Play size={16} className="text-accent ml-0.5" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{t.title}</p>
                        {t.artist && <p className="text-xs text-slate-400 truncate">{t.artist}</p>}
                      </div>
                      {isMe && <button onClick={() => deleteTrack(t.id)} className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition"><Trash2 size={14} /></button>}
                    </div>
                  ))}
                </div>
              )}
              <audio ref={audioRef} onEnded={() => setPlayingTrack(null)} className="hidden" />
            </div>
          )}
        </div>

        {previewImg && (
          <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 cursor-pointer" onClick={() => setPreviewImg(null)}>
            <img src={previewImg} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
          </div>
        )}
      </div>
    </div>
  );
}
