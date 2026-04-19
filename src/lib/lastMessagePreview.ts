/** Превью строки в списке чатов (совпадает с server/lastMessageLine.js) */
export function lastMessagePreviewLine(content: string | null | undefined, type: string | null | undefined): string {
  const t = type || 'text';
  const raw = (content ?? '').trim();
  if (t === 'text') return raw;
  const labels: Record<string, string> = { image: '📷 Фото', video: '🎬 Видео', audio: '🎵 Аудио' };
  const fb = labels[t] || '📎 Вложение';
  if (!raw) return fb;
  return `${fb}: ${raw.length > 100 ? `${raw.slice(0, 100)}…` : raw}`;
}
