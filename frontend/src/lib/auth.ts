import { User } from './types';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('mp_token');
}

export function getUser(): User | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('mp_user');
  return raw ? JSON.parse(raw) : null;
}

export function setAuth(token: string, user: User): void {
  localStorage.setItem('mp_token', token);
  localStorage.setItem('mp_user', JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem('mp_token');
  localStorage.removeItem('mp_user');
}

export function hasRole(user: User | null, ...roles: User['role'][]): boolean {
  if (!user) return false;
  return roles.includes(user.role);
}
