import { useRef, useEffect, useState } from 'react';

interface Props {
  src?: string | null;
  videoSrc?: string | null;
  name: string;
  size?: number;
  online?: boolean;
}

export default function Avatar({ src, videoSrc, name, size = 40, online }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playVideo, setPlayVideo] = useState(false);
  const s = { width: size, height: size };
  const initials = name.slice(0, 2).toUpperCase();
  const colors = ['bg-blue-600', 'bg-purple-600', 'bg-pink-600', 'bg-teal-600', 'bg-indigo-600', 'bg-cyan-600'];
  const bg = colors[name.charCodeAt(0) % colors.length];

  useEffect(() => {
    const root = containerRef.current;
    const v = videoRef.current;
    if (!videoSrc || !root || !v) return;
    const io = new IntersectionObserver(
      ([e]) => {
        const on = !!(e?.isIntersecting && e.intersectionRatio >= 0.15);
        setPlayVideo(on);
        if (on) v.play().catch(() => {});
        else v.pause();
      },
      { root: null, rootMargin: '48px', threshold: [0, 0.15, 0.35] }
    );
    io.observe(root);
    return () => io.disconnect();
  }, [videoSrc]);

  const staticLayer =
    src ? (
      <img src={src} alt={name} className="rounded-full object-cover w-full h-full" />
    ) : (
      <div className={`${bg} rounded-full flex items-center justify-center text-white font-bold w-full h-full`} style={{ fontSize: size * 0.35 }}>
        {initials}
      </div>
    );

  /** Внешний блок без overflow — индикатор «в сети» не обрезается */
  const pad = online !== undefined ? 4 : 0;
  const outer = size + pad * 2;

  return (
    <div className="relative inline-flex flex-shrink-0 items-center justify-center overflow-visible" style={{ width: outer, height: outer }}>
      <div ref={containerRef} className="relative rounded-full overflow-hidden flex-shrink-0 bg-dark-800" style={s}>
        {videoSrc ? (
          <>
            {staticLayer}
            <video
              ref={videoRef}
              src={videoSrc}
              loop
              muted
              playsInline
              preload="metadata"
              className="absolute inset-0 rounded-full object-cover pointer-events-none transition-opacity duration-150 w-full h-full"
              style={{ opacity: playVideo ? 1 : 0 }}
            />
          </>
        ) : (
          staticLayer
        )}
      </div>
      {online !== undefined && (
        <span
          className={`pointer-events-none absolute z-10 rounded-full border-[2.5px] border-dark-900 shadow-sm ${
            online ? 'bg-green-400' : 'bg-slate-500'
          }`}
          style={{
            width: Math.max(10, Math.round(size * 0.22)),
            height: Math.max(10, Math.round(size * 0.22)),
            right: pad > 0 ? 0 : -1,
            bottom: pad > 0 ? 0 : -1,
          }}
        />
      )}
    </div>
  );
}
