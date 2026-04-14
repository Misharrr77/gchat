import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { api } from '../lib/api';
import { User } from '../types';

interface Ctx {
  user: User | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  register: (username: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
  updateUser: (u: User) => void;
}

const AuthContext = createContext<Ctx | null>(null);

export function useAuth() {
  const c = useContext(AuthContext);
  if (!c) throw new Error('useAuth requires AuthProvider');
  return c;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('gchat_token');
    if (t) {
      api.auth.me()
        .then(d => setUser(d.user))
        .catch(() => localStorage.removeItem('gchat_token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (login: string, password: string) => {
    const d = await api.auth.login({ login, password });
    localStorage.setItem('gchat_token', d.token);
    setUser(d.user);
  }, []);

  const register = useCallback(async (username: string, password: string, displayName?: string) => {
    const d = await api.auth.register({ username, password, displayName });
    localStorage.setItem('gchat_token', d.token);
    setUser(d.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('gchat_token');
    setUser(null);
  }, []);

  const updateUser = useCallback((u: User) => setUser(u), []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}
