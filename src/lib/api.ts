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
    register: (body: { username: string; email: string; password: string; displayName: string }) =>
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
    list: () => req('/conversations'),
    create: (userId: string) => req('/conversations', { method: 'POST', body: JSON.stringify({ userId }) }),
  },
  messages: {
    list: (cid: string, before?: string) =>
      req(`/messages/${cid}${before ? `?before=${before}` : ''}`),
    send: (body: { conversationId: string; content: string; type?: string; mediaUrl?: string }) =>
      req('/messages', { method: 'POST', body: JSON.stringify(body) }),
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
