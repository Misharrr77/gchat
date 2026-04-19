import { useRef, useState, useEffect, useCallback, type MouseEvent } from 'react';
import { Play, Pause } from 'lucide-react';

type Props = {
  src: string;
  className?: string;
  /** Tighter layout for sidebar / narrow columns */
  compact?: boolean;
};

function fmtTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Custom audio UI: play/pause, seek, time — works in message bubbles and lists */
export default function ChatAudio({ src, className = '', compact }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const setDur = () => setDuration(Number.isFinite(a.duration) ? a.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
    };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', setDur);
    a.addEventListener('durationchange', setDur);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnd);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', setDur);
      a.removeEventListener('durationchange', setDur);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnd);
    };
  }, [src]);

  const toggle = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const a = audioRef.current;
      if (!a) return;
      if (playing) a.pause();
      else void a.play().catch(() => {});
    },
    [playing]
  );

  const onSeekPct = useCallback(
    (pctVal: number) => {
      const a = audioRef.current;
      if (!a || !Number.isFinite(duration) || duration <= 0) return;
      const t = (pctVal / 100) * duration;
      a.currentTime = t;
      setCurrent(t);
    },
    [duration]
  );

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  const pad = compact ? 'px-2 py-1.5 gap-2' : 'px-3 py-2.5 gap-3';
  const iconSz = compact ? 14 : 18;

  return (
    <div
      className={`flex items-center min-w-0 rounded-2xl bg-gradient-to-r from-dark-800 via-dark-800 to-dark-700/95 ring-1 ring-white/[0.07] border border-dark-600/60 shadow-sm ${pad} ${className}`}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        className="flex-shrink-0 rounded-full p-2 bg-accent/20 text-accent-light hover:bg-accent/30 ring-1 ring-accent/35 transition"
        aria-label={playing ? 'Пауза' : 'Воспроизвести'}
      >
        {playing ? <Pause size={iconSz} className="opacity-95" /> : <Play size={iconSz} className="opacity-95 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <input
          type="range"
          min={0}
          max={100}
          step={0.25}
          value={pct}
          disabled={!duration}
          onChange={e => onSeekPct(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-dark-600 accent-accent
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-md
            [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:border-0"
          aria-label="Позиция воспроизведения"
        />
        <div className={`flex justify-between text-slate-500 tabular-nums ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
          <span>{fmtTime(current)}</span>
          <span>{fmtTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
