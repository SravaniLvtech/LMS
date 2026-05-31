'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, TrendingUp, TrendingDown, Users, BookOpen, IndianRupee, ShoppingCart, CalendarCheck, Calendar, Heart } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
} from 'recharts';
import api from '@/lib/api';
import { DashboardData, RevenueChartPoint } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import StudentDashboard from './StudentDashboard';
import TutorDashboard from './TutorDashboard';
import TopInstructors from './TopInstructors';

function KPICard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-white rounded-lg p-3 border" style={{ borderColor: '#E4E7EF' }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium mb-0.5" style={{ color: '#8B93A5' }}>{label}</p>
          <p className="text-lg font-bold leading-tight" style={{ color: '#0F1117' }}>{value}</p>
          {sub && <p className="text-xs mt-0.5" style={{ color: '#4B5263' }}>{sub}</p>}
        </div>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + '20' }}>
          <Icon size={14} style={{ color }} />
        </div>
      </div>
    </div>
  );
}

function HealthBar({ label, value, good = true }: { label: string; value: number; good?: boolean }) {
  const color = good ? (value >= 80 ? '#22c55e' : value >= 60 ? '#f59e0b' : '#ef4444') : (value <= 5 ? '#22c55e' : value <= 10 ? '#f59e0b' : '#ef4444');
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-36 shrink-0" style={{ color: '#4B5263' }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full" style={{ background: '#E4E7EF' }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
      </div>
      <span className="text-xs font-medium w-9 text-right" style={{ color: '#0F1117' }}>{value}%</span>
    </div>
  );
}

const severityStyles: Record<string, { bg: string; text: string; dot: string }> = {
  red: { bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444' },
  amber: { bg: '#FFFBEB', text: '#D97706', dot: '#F59E0B' },
  green: { bg: '#F0FDF4', text: '#16A34A', dot: '#22C55E' },
};

interface RevenueTooltipProps {
  active?: boolean;
  payload?: { value: number; payload: RevenueChartPoint }[];
  label?: string;
}
function RevenueTooltip({ active, payload }: RevenueTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white rounded-xl shadow-lg border px-3 py-2.5 text-xs" style={{ borderColor: '#E4E7EF' }}>
      <p className="font-semibold mb-1" style={{ color: '#0F1117' }}>{d.label}</p>
      <p style={{ color: '#1A3FD1' }}>₹{d.revenue.toLocaleString('en-IN')}</p>
      <p style={{ color: '#8B93A5' }}>{d.orders} order{d.orders !== 1 ? 's' : ''}</p>
    </div>
  );
}

function RevenueBarChart({ data }: { data: RevenueChartPoint[] }) {
  const today = new Date().toISOString().split('T')[0];
  const maxRev = Math.max(...data.map((d) => d.revenue), 1);

  // Show every 5th label to avoid crowding (30 bars → ~6 labels)
  const tickFormatter = (_: string, index: number) =>
    index % 5 === 0 ? data[index]?.label ?? '' : '';

  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={data} barCategoryGap="20%" margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#F3F4F6" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: '#9CA3AF' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={tickFormatter}
          interval={0}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#9CA3AF' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => v === 0 ? '0' : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
          width={36}
        />
        <Tooltip content={<RevenueTooltip />} cursor={{ fill: '#EEF2FF' }} />
        <Bar dataKey="revenue" radius={[3, 3, 0, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.date}
              fill={entry.date === today ? '#0F1117' : entry.revenue >= maxRev * 0.8 ? '#1A3FD1' : '#93C5FD'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData]           = useState<DashboardData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [cartCount, setCartCount] = useState(0);
  const [wishCount, setWishCount] = useState(0);
  const router = useRouter();

  // Role-based routing
  if (user?.role === 'student') return <StudentDashboard user={user} />;
  if (user?.role === 'tutor')   return <TutorDashboard user={user} />;

  useEffect(() => {
    api.get('/dashboard/overview')
      .then((r) => setData(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));

    const sid = (user?.linkedId || user?._id) as string | undefined;
    if (sid) {
      api.get('/cart',     { params: { studentId: sid } }).then((r) => setCartCount(r.data.total ?? 0)).catch(() => {});
      api.get('/wishlist', { params: { studentId: sid } }).then((r) => setWishCount(r.data.total ?? 0)).catch(() => {});
    }
  }, []);

  if (loading) return <div className="p-8 text-sm" style={{ color: '#8B93A5' }}>Loading…</div>;
  if (!data) return <div className="p-8 text-sm text-red-500">Failed to load</div>;

  const { kpis, revenue, health, pendingActions, alertCount } = data;

  return (
    <div>
      {/* Header */}
      <div className="px-6 py-3.5 sticky top-0 z-40" style={{ background: 'linear-gradient(135deg, #0F1117 0%, #1A3FD1 100%)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">
              {user?.role === 'super_admin' ? 'Super Admin Overview' : 'Admin Overview'}
            </h1>
            <p className="text-xs mt-0.5" style={{ color: '#93C5FD' }}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Cart */}
            <button
              onClick={() => router.push('/cart')}
              className="relative p-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.15)' }}
              title="My Cart"
            >
              <ShoppingCart size={16} className="text-white" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-400 text-white text-xs flex items-center justify-center font-bold">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </button>
            {/* Wishlist */}
            <button
              onClick={() => router.push('/wishlist')}
              className="relative p-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.15)' }}
              title="My Wishlist"
            >
              <Heart size={16} className="text-white" />
              {wishCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-pink-400 text-white text-xs flex items-center justify-center font-bold">
                  {wishCount > 9 ? '9+' : wishCount}
                </span>
              )}
            </button>
            {/* Alerts */}
            <button
              onClick={() => router.push('/alerts')}
              className="relative p-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.15)' }}
              title="Alerts"
            >
              <Bell size={16} className="text-white" />
              {alertCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
                  {alertCount > 9 ? '9+' : alertCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* KPI Grid */}
        <div>
          <h2 className="text-xs font-semibold mb-2.5 uppercase tracking-wide" style={{ color: '#8B93A5' }}>Key Metrics</h2>
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
            <KPICard
              label="Monthly Revenue"
              value={`₹${kpis.monthlyRevenue.toLocaleString('en-IN')}`}
              sub={kpis.revenueChange >= 0 ? `+${kpis.revenueChange}% vs last month` : `${kpis.revenueChange}% vs last month`}
              icon={IndianRupee}
              color="#1A3FD1"
            />
            <KPICard label="Active Students" value={kpis.activeStudents.toString()} icon={Users} color="#8B5CF6" />
            <KPICard label="Active Tutors" value={kpis.activeTutors.toString()} icon={Users} color="#10B981" />
            <KPICard
              label="Total Sessions"
              value={kpis.totalSessions.toLocaleString('en-IN')}
              sub="all-time"
              icon={Calendar}
              color="#F59E0B"
            />
            <KPICard
              label="Completed Sessions"
              value={kpis.completedSessions.toLocaleString('en-IN')}
              sub="this month"
              icon={CalendarCheck}
              color="#10B981"
            />
          </div>
        </div>

        {/* Revenue + Top Instructors — side by side */}
        <div className="grid gap-4" style={{ gridTemplateColumns: '65fr 35fr' }}>
          {/* Revenue — Last 30 Days */}
          {revenue ? (
            <div className="bg-white rounded-lg p-4 border" style={{ borderColor: '#E4E7EF' }}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: '#0F1117' }}>Revenue — Last 30 Days</h2>
                  <p className="text-xs" style={{ color: '#8B93A5' }}>Paid orders · amount before tax</p>
                </div>
                {/* Chips */}
                <div className="flex flex-wrap gap-1.5">
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: '#EEF2FF' }}>
                    <IndianRupee size={11} style={{ color: '#1A3FD1' }} />
                    <span className="text-xs font-semibold" style={{ color: '#1A3FD1' }}>
                      ₹{revenue.today.toLocaleString('en-IN')} today
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: '#F0FDF4' }}>
                    <ShoppingCart size={11} style={{ color: '#16A34A' }} />
                    <span className="text-xs font-semibold" style={{ color: '#16A34A' }}>
                      {revenue.ordersToday} order{revenue.ordersToday !== 1 ? 's' : ''} today
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: revenue.change >= 0 ? '#F0FDF4' : '#FEF2F2' }}>
                    {revenue.change >= 0
                      ? <TrendingUp size={11} style={{ color: '#16A34A' }} />
                      : <TrendingDown size={11} style={{ color: '#DC2626' }} />}
                    <span className="text-xs font-semibold" style={{ color: revenue.change >= 0 ? '#16A34A' : '#DC2626' }}>
                      {revenue.change >= 0 ? '+' : ''}{revenue.change}% vs prev 30d
                    </span>
                  </div>
                  <div className="px-2 py-1 rounded-lg" style={{ background: '#F8F9FC' }}>
                    <span className="text-xs font-semibold" style={{ color: '#4B5263' }}>
                      {revenue.totalOrders} total orders
                    </span>
                  </div>
                </div>
              </div>

              {/* Total revenue figure */}
              <p className="text-2xl font-bold mb-2" style={{ color: '#0F1117' }}>
                ₹{revenue.last30Days.toLocaleString('en-IN')}
              </p>

              {/* Bar chart */}
              <RevenueBarChart data={revenue.chart} />
            </div>
          ) : <div />}

          {/* Top Instructors */}
          <TopInstructors />
        </div>

        {/* Platform Health + Pending Actions — side by side */}
        <div className="grid grid-cols-2 gap-4">

          {/* Platform Health */}
          <div className="bg-white rounded-lg p-4 border" style={{ borderColor: '#E4E7EF' }}>
            <h2 className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: '#8B93A5' }}>Platform Health</h2>
            <div className="space-y-2">
              <HealthBar label="Session Completion" value={health.sessionCompletion} />
              <HealthBar label="Student Retention" value={health.studentRetention} />
              <HealthBar label="Avg Tutor Rating" value={health.avgTutorRating * 20} />
              <HealthBar label="Payment Success Rate" value={health.paymentSuccessRate} />
              <HealthBar label="Complaint Rate (low is good)" value={100 - health.complaintRate * 10} good={false} />
            </div>
            <div className="mt-3 pt-3 border-t grid grid-cols-5 gap-2" style={{ borderColor: '#E4E7EF' }}>
              {[
                { label: 'Completion', val: `${health.sessionCompletion}%` },
                { label: 'Retention', val: `${health.studentRetention}%` },
                { label: 'Avg Rating', val: `${health.avgTutorRating}/5` },
                { label: 'Pay Success', val: `${health.paymentSuccessRate}%` },
                { label: 'Complaints', val: `${health.complaintRate}%` },
              ].map(({ label, val }) => (
                <div key={label} className="text-center">
                  <p className="text-sm font-bold" style={{ color: '#0F1117' }}>{val}</p>
                  <p className="text-xs" style={{ color: '#8B93A5' }}>{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Pending Actions */}
          <div className="bg-white rounded-lg p-4 border" style={{ borderColor: '#E4E7EF' }}>
            <h2 className="text-xs font-semibold mb-2.5 uppercase tracking-wide" style={{ color: '#8B93A5' }}>Pending Actions</h2>
            <div className="space-y-1.5">
              {pendingActions.map((item) => {
                const s = severityStyles[item.severity] || severityStyles.amber;
                const actionMap: Record<string, string> = {
                  review_tutors: '/tutors?filter=pending',
                  view_alerts: '/alerts',
                  process_payouts: '/revenue',
                };
                return (
                  <button
                    key={item.label}
                    onClick={() => router.push(actionMap[item.action] || '/dashboard')}
                    className="flex items-center justify-between w-full px-3 py-2 rounded-lg border text-left transition-all hover:shadow-sm"
                    style={{ borderColor: s.text + '30', background: s.bg }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
                      <span className="text-xs font-medium" style={{ color: '#0F1117' }}>{item.label}</span>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: s.text + '20', color: s.text }}>
                      {item.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
