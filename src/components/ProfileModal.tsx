import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import Avatar from './Avatar';
import { X, Edit3, Camera, Calendar, Image as ImageIcon, Music, Play, Pause, Trash2, Plus, Loader } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { User, AlbumPhoto, ProfileTrack } from '../types';

type ProfileTab = 'info' | 'album' | 'music';

export default function ProfileModal({ user: pu, onClose }: { user: User; onClose: () => void }) {
  const { user: me, updateUser } = useAuth();
  const self = me?.id === pu.id;
  const [tab, setTab] = useState<ProfileTab>('info');
  const [editing, setEditing] = useState(false);
  const [dn, setDn] = useState(pu.display_name);
  const [bio, setBio] = useState(pu.bio);
  const [status, setStatus] = useState(pu.status);
  const [saving, setSaving] = useState(false);

  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const albumRef = useRef<HTMLInputElement>(null);

  const [tracks, setTracks] = useState<ProfileTrack[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const musicRef = useRef<HTMLInputElement>(null);
  const [newTrackTitle, setNewTrackTitle] = useState('');

  const loadAlbum = async () => {
    setLoadingPhotos(true);
    try { const d = await api.albums.list(pu.id); setPhotos(d.photos); } catch { /* ignore */ }
    setLoadingPhotos(false);
  };

  const loadMusic = async () => {
    setLoadingTracks(true);
    try { const d = await api.music.list(pu.id); setTracks(d.tracks); } catch { /* ignore */ }
    setLoadingTracks(false);
  };

  useEffect(() => {
    if (tab === 'album') loadAlbum();
    if (tab === 'music') loadMusic();
  }, [tab, pu.id]);

  const save = async () => {
    setSaving(true);
    try {
      const d = await api.users.updateProfile({ displayName: dn, bio, status });
      updateUser(d.user);
      setEditing(false);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const d = await api.upload(f);
      if (f.type.startsWith('video')) {
        const r = await api.users.updateProfile({ videoAvatar: d.url });
        updateUser(r.user);
      } else {
        const r = await api.users.updateProfile({ avatar: d.url, videoAvatar: '' });
        updateUser(r.user);
      }
    } catch { /* ignore */ }
  };

  const uploadHeader = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const d = await api.upload(f);
      const r = await api.users.updateProfile({ profileHeader: d.url });
      updateUser(r.user);
    } catch { /* ignore */ }
  };

  const addPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { const d = await api.upload(f); await api.albums.add({ url: d.url }); loadAlbum(); } catch { /* ignore */ }
    e.target.value = '';
  };

  const deletePhoto = async (id: string) => {
    try { await api.albums.delete(id); setPhotos(p => p.filter(ph => ph.id !== id)); } catch { /* ignore */ }
  };

  const addTrack = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const title = newTrackTitle || f.name.replace(/\.[^.]+$/, '');
    try { const d = await api.upload(f); await api.music.add({ title, url: d.url }); loadMusic(); setNewTrackTitle(''); } catch { /* ignore */ }
    e.target.value = '';
  };

  const deleteTrack = async (id: string) => {
    try { await api.music.delete(id); setTracks(p => p.filter(t => t.id !== id)); } catch { /* ignore */ }
  };

  const togglePlay = (track: ProfileTrack) => {
    if (playingTrack === track.id) {
      audioRef.current?.pause();
      setPlayingTrack(null);
    } else {
      if (audioRef.current) { audioRef.current.src = track.url; audioRef.current.play(); }
      setPlayingTrack(track.id);
    }
  };

  const joined = (() => { try { return format(new Date(pu.created_at + 'Z'), 'LLLL yyyy', { locale: ru }); } catch { return ''; } })();

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-dark-800 rounded-2xl border border-dark-600 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="h-28 relative flex-shrink-0" style={{
          background: pu.profile_header ? `url(${pu.profile_header}) center/cover` : 'linear-gradient(135deg, rgba(59,130,246,0.4), rgba(30,58,138,0.4))'
        }}>
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 bg-dark-900/50 hover:bg-dark-900/80 rounded-lg text-white transition"><X size={16} /></button>
          {self && (
            <label className="absolute top-3 left-3 p-1.5 bg-dark-900/50 hover:bg-dark-900/80 rounded-lg text-white transition cursor-pointer">
              <ImageIcon size={14} />
              <input type="file" className="hidden" accept="image/*" onChange={uploadHeader} />
            </label>
          )}
        </div>

        <div className="px-6 -mt-12 relative flex-shrink-0">
          <div className="relative inline-block">
            <Avatar src={pu.avatar} videoSrc={pu.video_avatar} name={pu.display_name || pu.username} size={80} />
            {self && (
              <label className="absolute bottom-0 right-0 p-1.5 bg-accent rounded-full cursor-pointer hover:bg-accent-hover transition" title="Фото/видео аватар">
                <Camera size={12} className="text-white" />
                <input type="file" className="hidden" accept="image/*,video/mp4,video/webm" onChange={uploadAvatar} />
              </label>
            )}
          </div>
        </div>

        <div className="flex border-b border-dark-600 mt-2 flex-shrink-0">
          {(['info', 'album', 'music'] as ProfileTab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-medium transition ${tab === t ? 'text-accent border-b-2 border-accent' : 'text-slate-400 hover:text-white'}`}>
              {t === 'info' ? 'Профиль' : t === 'album' ? 'Альбом' : 'Музыка'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-3">
          {tab === 'info' && (
            editing ? (
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
                  <span>В gchat с {joined}</span>
                </div>
              </>
            )
          )}

          {tab === 'album' && (
            <div>
              {self && (
                <button onClick={() => albumRef.current?.click()} className="w-full py-2.5 mb-3 border border-dashed border-dark-600 rounded-xl text-sm text-slate-400 hover:text-accent hover:border-accent transition flex items-center justify-center gap-2">
                  <Plus size={16} /> Добавить фото
                </button>
              )}
              <input type="file" ref={albumRef} className="hidden" accept="image/*" onChange={addPhoto} />
              {loadingPhotos ? (
                <div className="flex justify-center py-8"><Loader size={20} className="animate-spin text-accent" /></div>
              ) : photos.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-8">Нет фотографий</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {photos.map(p => (
                    <div key={p.id} className="relative group aspect-square">
                      <img src={p.url} alt="" className="w-full h-full object-cover rounded-lg cursor-pointer" onClick={() => setViewingPhoto(p.url)} />
                      {self && (
                        <button onClick={() => deletePhoto(p.id)} className="absolute top-1 right-1 p-1 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition text-red-400">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'music' && (
            <div>
              {self && (
                <div className="mb-3 space-y-2">
                  <input value={newTrackTitle} onChange={e => setNewTrackTitle(e.target.value)} placeholder="Название трека"
                    className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent transition" />
                  <button onClick={() => musicRef.current?.click()} className="w-full py-2.5 border border-dashed border-dark-600 rounded-xl text-sm text-slate-400 hover:text-accent hover:border-accent transition flex items-center justify-center gap-2">
                    <Music size={16} /> Добавить трек
                  </button>
                </div>
              )}
              <input type="file" ref={musicRef} className="hidden" accept="audio/*" onChange={addTrack} />
              <audio ref={audioRef} onEnded={() => setPlayingTrack(null)} />
              {loadingTracks ? (
                <div className="flex justify-center py-8"><Loader size={20} className="animate-spin text-accent" /></div>
              ) : tracks.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-8">Нет треков</p>
              ) : (
                <div className="space-y-2">
                  {tracks.map(t => (
                    <div key={t.id} className="flex items-center gap-3 p-3 bg-dark-700 rounded-xl">
                      <button onClick={() => togglePlay(t)} className="w-9 h-9 bg-accent/20 rounded-full flex items-center justify-center flex-shrink-0 hover:bg-accent/30 transition">
                        {playingTrack === t.id ? <Pause size={16} className="text-accent" /> : <Play size={16} className="text-accent ml-0.5" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{t.title}</p>
                        {t.artist && <p className="text-xs text-slate-400 truncate">{t.artist}</p>}
                      </div>
                      {self && (
                        <button onClick={() => deleteTrack(t.id)} className="p-1.5 hover:bg-dark-600 rounded-lg text-slate-400 hover:text-red-400 transition">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {viewingPhoto && (
          <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 cursor-pointer" onClick={() => setViewingPhoto(null)}>
            <img src={viewingPhoto} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
          </div>
        )}
      </div>
    </div>
  );
}
