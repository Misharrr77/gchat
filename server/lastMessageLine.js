/** Единая строка превью последнего сообщения для списка чатов и сокетов */
function lastMessagePreviewLine(content, type) {
  const t = type || 'text';
  const raw = content == null ? '' : String(content).trim();
  if (t === 'text') return raw;
  const labels = { image: '📷 Фото', video: '🎬 Видео', audio: '🎵 Аудио' };
  const fb = labels[t] || '📎 Вложение';
  if (!raw) return fb;
  return `${fb}: ${raw.length > 100 ? `${raw.slice(0, 100)}…` : raw}`;
}

module.exports = { lastMessagePreviewLine };
