import type { GroupTopic, PinnedEntry, SavedListItem } from '../types';

const BASE = '/api';

function token(): string | null {
  return localStorage.getItem('gchat_token');
}

async function req(endpoint: string, opts: RequestInit = {}) {
  const t = token();
  const res = await fetch(`${BASE}${endpoint}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  auth: {
    register: (body: {
      username: string;
      password: string;
      displayName?: string;
      affirmQuiz?: boolean;
      quiz?: { q1: string; q2: string; q3: string[] };
    }) => req('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
    login: (body: { login: string; password: string }) =>
      req('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    me: () => req('/auth/me'),
  },
  users: {
    search: (q: string) => req(`/users/search?q=${encodeURIComponent(q)}`),
    get: (id: string) => req(`/users/${id}`),
    updateProfile: (body: Record<string, string | undefined>) =>
      req('/users/profile', { method: 'PUT', body: JSON.stringify(body) }),
  },
  conversations: {
    list: (type?: string) => req(`/conversations${type ? `?type=${type}` : ''}`),
    create: (userId: string) => req('/conversations', { method: 'POST', body: JSON.stringify({ userId }) }),
    createGroup: (body: { name: string; memberIds: string[]; avatar?: string; description?: string; isPublic?: boolean }) =>
      req('/conversations/group', { method: 'POST', body: JSON.stringify(body) }),
    createChannel: (body: { name: string; avatar?: string; description?: string; isPublic?: boolean }) =>
      req('/conversations/channel', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, any>) =>
      req(`/conversations/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    join: (id: string) => req(`/conversations/${id}/join`, { method: 'POST' }),
    addMembers: (id: string, userIds: string[]) =>
      req(`/conversations/${id}/members`, { method: 'POST', body: JSON.stringify({ userIds }) }),
    setRole: (convId: string, userId: string, role: string) =>
      req(`/conversations/${convId}/members/${userId}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
    removeMember: (convId: string, userId: string) =>
      req(`/conversations/${convId}/members/${userId}`, { method: 'DELETE' }),
    markRead: (id: string) => req(`/conversations/${id}/read`, { method: 'POST' }),
    pins: (id: string): Promise<{ pins: PinnedEntry[] }> => req(`/conversations/${id}/pins`),
    pin: (conversationId: string, messageId: string) =>
      req(`/conversations/${conversationId}/pin`, { method: 'POST', body: JSON.stringify({ messageId }) }),
    unpin: (conversationId: string, messageId: string) =>
      req(`/conversations/${conversationId}/pin/${messageId}`, { method: 'DELETE' }),
    topics: (id: string): Promise<{ topics: GroupTopic[]; topics_enabled: number }> => req(`/conversations/${id}/topics`),
    topicCreate: (convId: string, name: string) =>
      req(`/conversations/${convId}/topics`, { method: 'POST', body: JSON.stringify({ name }) }),
    topicRename: (convId: string, topicId: string, name: string) =>
      req(`/conversations/${convId}/topics/${topicId}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    topicPatch: (convId: string, topicId: string, body: { name?: string; pinned?: boolean }) =>
      req(`/conversations/${convId}/topics/${topicId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    topicMove: (
      convId: string,
      topicId: string,
      direction: 'up' | 'down'
    ): Promise<{ ok: boolean; topics: GroupTopic[] }> =>
      req(`/conversations/${convId}/topics/${topicId}/move`, {
        method: 'POST',
        body: JSON.stringify({ direction }),
      }),
    topicDelete: (convId: string, topicId: string) =>
      req(`/conversations/${convId}/topics/${topicId}`, { method: 'DELETE' }),
    invite: (id: string): Promise<{ code: string }> =>
      req(`/conversations/${id}/invite`, { method: 'POST' }),
  },
  invites: {
    preview: (code: string) => req(`/invite/${encodeURIComponent(code)}`),
    join: (code: string) => req(`/invite/${encodeURIComponent(code)}/join`, { method: 'POST' }),
  },
  discover: (q: string) => req(`/discover?q=${encodeURIComponent(q)}`),
  saved: {
    list: (): Promise<{ items: SavedListItem[] }> => req('/saved'),
    add: (messageId: string) => req(`/saved/${messageId}`, { method: 'POST' }) as Promise<{ saved: boolean }>,
    remove: (messageId: string) => req(`/saved/${messageId}`, { method: 'DELETE' }) as Promise<{ saved: boolean }>,
  },
  messages: {
    list: (cid: string, opts?: { before?: string; anchor?: string; topicId?: string }) => {
      const p = new URLSearchParams();
      if (opts?.before) p.set('before', opts.before);
      if (opts?.anchor) p.set('anchor', opts.anchor);
      if (opts?.topicId) p.set('topicId', opts.topicId);
      const qs = p.toString();
      return req(`/messages/${cid}${qs ? `?${qs}` : ''}`);
    },
    send: (body: {
      conversationId: string;
      content: string;
      type?: string;
      mediaUrl?: string;
      replyToId?: string | null;
      postAsChannel?: boolean;
      topicId?: string | null;
    }) => req('/messages', { method: 'POST', body: JSON.stringify(body) }),
    toggleReaction: (messageId: string, emoji: string) =>
      req(`/messages/${messageId}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) }),
  },
  stories: {
    list: () => req('/stories'),
    create: (body: { type: string; mediaUrl?: string; textContent?: string; bgColor?: string }) =>
      req('/stories', { method: 'POST', body: JSON.stringify(body) }),
    view: (id: string) => req(`/stories/${id}/view`, { method: 'POST' }),
    delete: (id: string) => req(`/stories/${id}`, { method: 'DELETE' }),
  },
  albums: {
    list: (userId: string) => req(`/albums/${userId}`),
    add: (body: { url: string; caption?: string }) => req('/albums', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id: string) => req(`/albums/${id}`, { method: 'DELETE' }),
  },
  music: {
    list: (userId: string) => req(`/music/${userId}`),
    add: (body: { title: string; artist?: string; url: string }) => req('/music', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id: string) => req(`/music/${id}`, { method: 'DELETE' }),
  },
  upload: async (file: File) => {
    const t = token();
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${BASE}/upload`, { method: 'POST', headers: t ? { Authorization: `Bearer ${t}` } : {}, body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  },
};
