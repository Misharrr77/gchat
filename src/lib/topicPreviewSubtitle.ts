import type { GroupTopic, User } from '../types';

/** Превью последнего сообщения в теме (как в списке чатов, без каналов) */
export function topicPreviewSubtitle(t: GroupTopic, members: User[] | undefined, myId?: string): string {
  if (!t.last_message_at) return 'Нет сообщений';
  const display = (t.last_message ?? '').trim() || '…';
  if (myId && t.last_message_sender_id === myId) return `Ты: ${display}`;
  if (t.last_message_sender_id && members?.length) {
    const sender = members.find(x => x.id === t.last_message_sender_id);
    if (sender) return `${sender.display_name || sender.username}: ${display}`;
  }
  return display;
}
