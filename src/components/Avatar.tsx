interface Props {
  src: string | null | undefined;
  name: string;
  size?: number;
  online?: boolean;
}

const palette = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1'];

export default function Avatar({ src, name, size = 40, online }: Props) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  const ci = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {src ? (
        <img src={src} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />
      ) : (
        <div
          className="rounded-full flex items-center justify-center text-white font-semibold"
          style={{ width: size, height: size, backgroundColor: palette[ci], fontSize: size * 0.35 }}
        >{initials}</div>
      )}
      {online !== undefined && (
        <div className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-dark-800 ${online ? 'bg-green-500' : 'bg-slate-500'}`} style={{ width: size * 0.3, height: size * 0.3 }} />
      )}
    </div>
  );
}
