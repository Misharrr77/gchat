/** Styled video with native controls — consistent look in bubbles and lists */

type Props = {
  src: string;
  className?: string;
  /** Applied to the &lt;video&gt; element (max-height, etc.) */
  videoClassName?: string;
};

export default function ChatVideo({ src, className = '', videoClassName = 'max-h-64 sm:max-h-72' }: Props) {
  return (
    <div
      className={`rounded-xl overflow-hidden bg-black ring-1 ring-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${className}`}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        controlsList="nodownload"
        className={`w-full object-contain bg-black align-middle ${videoClassName}`}
      />
    </div>
  );
}
