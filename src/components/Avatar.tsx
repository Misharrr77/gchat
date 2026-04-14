interface Props { src?: string | null; videoSrc?: string | null; name: string; size?: number; online?: boolean; }

export default function Avatar({ src, videoSrc, name, size = 40, online }: Props) {
  const s = { width: size, height: size };
  const initials = name.slice(0, 2).toUpperCase();
  const colors = ['bg-blue-600', 'bg-purple-600', 'bg-pink-600', 'bg-teal-600', 'bg-indigo-600', 'bg-cyan-600'];
  const bg = colors[name.charCodeAt(0) % colors.length];

  return (
    <div className="relative flex-shrink-0" style={s}>
      {videoSrc ? (
        <video src={videoSrc} autoPlay loop muted playsInline className="rounded-full object-cover" style={s} />
      ) : src ? (
        <img src={src} alt={name} className="rounded-full object-cover" style={s} />
      ) : (
        <div className={`${bg} rounded-full flex items-center justify-center text-white font-bold`} style={{ ...s, fontSize: size * 0.35 }}>{initials}</div>
      )}
      {online !== undefined && (
        <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-dark-800 ${online ? 'bg-green-400' : 'bg-slate-600'}`} />
      )}
    </div>
  );
}
