'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@/lib/types';
import { getUser, getToken, setAuth, clearAuth } from '@/lib/auth';
import api from '@/lib/api';

interface AuthCtx {
  user: User | null;
  login: (payload: Record<string, string>, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (u: User) => void;
  loading: boolean;
}

const AuthContext = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(getUser());
    setLoading(false);
  }, []);

  const login = async (payload: Record<string, string>, password: string) => {
    const body = password ? { ...payload, password } : payload;
    const res = await api.post('/auth/login', body);
    setAuth(res.data.token, res.data.user);
    setUser(res.data.user);
  };

  const logout = () => {
    clearAuth();
    setUser(null);
  };

  // Call this after a successful PATCH /auth/me to refresh user in memory + localStorage
  const updateUser = (u: User) => {
    const token = getToken();
    if (token) setAuth(token, u);
    else localStorage.setItem('mp_user', JSON.stringify(u));
    setUser(u);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
