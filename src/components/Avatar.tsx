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
      <img src={src} alt={name} className="rounded-full object-cover" style={s} />
    ) : (
      <div className={`${bg} rounded-full flex items-center justify-center text-white font-bold`} style={{ ...s, fontSize: size * 0.35 }}>{initials}</div>
    );

  return (
    <div ref={containerRef} className="relative flex-shrink-0 overflow-hidden rounded-full" style={s}>
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
            className="absolute inset-0 rounded-full object-cover pointer-events-none transition-opacity duration-150"
            style={{ ...s, opacity: playVideo ? 1 : 0 }}
          />
        </>
      ) : (
        staticLayer
      )}
      {online !== undefined && (
        <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-dark-800 z-10 ${online ? 'bg-green-400' : 'bg-slate-600'}`} />
      )}
    </div>
  );
}
