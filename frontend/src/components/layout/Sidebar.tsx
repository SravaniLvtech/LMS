'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, DollarSign, CalendarCheck, UserCheck,
  Bell, LogOut, BookOpen, CalendarDays, ShoppingCart, GraduationCap,
  UserCircle, ShoppingBag,
} from 'lucide-react';

const ADMIN_ROLES = ['super_admin', 'operations', 'finance', 'support_agent'];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();

  const role    = user?.role ?? '';
  const isAdmin = ADMIN_ROLES.includes(role);
  const isTutor = role === 'tutor';
  const isStudent = role === 'student';

  const nav = [
    { href: '/dashboard',           label: 'Overview',              icon: LayoutDashboard, show: true },
    { href: '/schedule',            label: 'Schedule',               icon: CalendarDays,    show: true },
    { href: '/tutors',              label: 'Tutors',                 icon: Users,           show: isAdmin },
    { href: '/courses',             label: 'Courses',                icon: BookOpen,        show: true },
    { href: '/cart',                label: 'Cart',                   icon: ShoppingCart,    show: isStudent },
    { href: '/my-learnings',        label: 'My Learnings',           icon: GraduationCap,   show: isStudent },
    { href: '/my-orders',           label: 'My Orders',              icon: ShoppingBag,     show: isStudent },
    { href: '/revenue',             label: 'Revenue',                icon: DollarSign,      show: isAdmin || isTutor },
    // Admin sees both; tutor sees only their own; student sees only their own
    { href: '/attendance/students', label: isAdmin ? 'Student Attendance' : 'My Attendance', icon: CalendarCheck, show: isAdmin || isStudent },
    { href: '/attendance/tutors',   label: isAdmin ? 'Tutor Attendance'   : 'My Attendance', icon: UserCheck,     show: isAdmin || isTutor },
    { href: '/alerts',              label: 'Alerts',                 icon: Bell,            show: isAdmin },
    { href: '/profile',             label: 'Profile',                icon: UserCircle,      show: true },
  ].filter(item => item.show);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 flex flex-col border-r z-50" style={{ background: '#0F1117', borderColor: '#1e2130' }}>
      {/* Logo */}
      <div className="px-6 py-5 border-b" style={{ borderColor: '#1e2130' }}>
        <h1 className="text-xl font-bold text-white">MathPath</h1>
        <p className="text-xs mt-0.5" style={{ color: '#8B93A5' }}>Admin Panel</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
              style={{
                color: active ? '#FFFFFF' : '#8B93A5',
                background: active ? '#1A3FD1' : 'transparent',
              }}
            >
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t" style={{ borderColor: '#1e2130' }}>
        {/* Avatar + name */}
        <Link href="/profile" className="flex items-center gap-2.5 px-3 py-2 mb-1 rounded-lg transition-colors hover:bg-white/5">
          {user?.profileImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.profileImage} alt={user.name}
              className="w-8 h-8 rounded-full object-cover shrink-0"
              style={{ border: '1px solid #2a3050' }} />
          ) : (
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
              style={{ background: '#1A3FD1' }}>
              {(user?.name || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.name}</p>
            <p className="text-xs capitalize" style={{ color: '#8B93A5' }}>
              {user?.role?.replace(/_/g, ' ')}
            </p>
          </div>
        </Link>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors hover:bg-white/5"
          style={{ color: '#8B93A5' }}
        >
          <LogOut size={16} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
