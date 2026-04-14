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
    register: (body: { username: string; password: string; displayName?: string }) =>
      req('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
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
    createGroup: (body: { name: string; memberIds: string[]; avatar?: string; description?: string }) =>
      req('/conversations/group', { method: 'POST', body: JSON.stringify(body) }),
    createChannel: (body: { name: string; avatar?: string; description?: string }) =>
      req('/conversations/channel', { method: 'POST', body: JSON.stringify(body) }),
    join: (id: string) => req(`/conversations/${id}/join`, { method: 'POST' }),
    addMembers: (id: string, userIds: string[]) =>
      req(`/conversations/${id}/members`, { method: 'POST', body: JSON.stringify({ userIds }) }),
  },
  channels: {
    search: (q: string) => req(`/channels/search?q=${encodeURIComponent(q)}`),
  },
  messages: {
    list: (cid: string, before?: string) =>
      req(`/messages/${cid}${before ? `?before=${before}` : ''}`),
    send: (body: { conversationId: string; content: string; type?: string; mediaUrl?: string }) =>
      req('/messages', { method: 'POST', body: JSON.stringify(body) }),
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
    add: (body: { url: string; caption?: string }) =>
      req('/albums', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id: string) => req(`/albums/${id}`, { method: 'DELETE' }),
  },
  music: {
    list: (userId: string) => req(`/music/${userId}`),
    add: (body: { title: string; artist?: string; url: string }) =>
      req('/music', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id: string) => req(`/music/${id}`, { method: 'DELETE' }),
  },
  upload: async (file: File) => {
    const t = token();
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${BASE}/upload`, {
      method: 'POST',
      headers: t ? { Authorization: `Bearer ${t}` } : {},
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  },
};
