'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShoppingBag, BookOpen, Search, Calendar, Tag,
  CheckCircle, Clock, XCircle, RefreshCw,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────
interface OrderCourse { _id: string; courseName: string; category?: string; courseImage?: string }
interface OrderTutor  { _id: string; name: string; profileImage?: string }
interface Order {
  _id: string;
  courseId?: OrderCourse;
  courseName?: string;
  tutor?: OrderTutor;
  type: string;
  subject: string;
  amountBeforeTax: number;
  amountAfterTax: number;
  taxAmount: number;
  paymentStatus: 'pending' | 'paid' | 'refunded' | 'failed';
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  transactionId?: string;
  createdAt: string;
  paidAt?: string;
}

interface Summary {
  totalOrders: number;
  paidOrders: number;
  totalSpentINR: number;
  totalSessions: number;
}

// ── Status styling ─────────────────────────────────────────────────────────────
const paymentStyle: Record<string, { bg: string; text: string; dot: string; icon: React.ReactNode }> = {
  paid:     { bg: '#ECFDF5', text: '#16A34A', dot: '#22C55E', icon: <CheckCircle size={12} /> },
  pending:  { bg: '#FFFBEB', text: '#D97706', dot: '#F59E0B', icon: <Clock size={12} /> },
  refunded: { bg: '#EEF2FF', text: '#4F46E5', dot: '#818CF8', icon: <RefreshCw size={12} /> },
  failed:   { bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444', icon: <XCircle size={12} /> },
};
const orderStyle: Record<string, { bg: string; text: string }> = {
  confirmed: { bg: '#ECFDF5', text: '#16A34A' },
  pending:   { bg: '#FFFBEB', text: '#D97706' },
  cancelled: { bg: '#FEF2F2', text: '#DC2626' },
  completed: { bg: '#EEF2FF', text: '#4F46E5' },
};

const typeLabels: Record<string, string> = {
  live_single:  'Live 1:1',
  live_pack:    'Live Pack',
  video_course: 'Video Course',
};

export default function MyOrdersPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [orders,  setOrders]  = useState<Order[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    if (!user?.linkedId) return;
    setLoading(true);
    api.get(`/orders/student/${user.linkedId}`, { params: { limit: 200 } })
      .then((r) => {
        setOrders(r.data.data || []);
        setSummary(r.data.summary || null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user?.linkedId]);

  // Client-side filter by course name or tutor name
  const filtered = orders.filter((o) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = (o.courseId?.courseName || o.courseName || '').toLowerCase();
    const tutor = (o.tutor?.name || '').toLowerCase();
    return name.includes(q) || tutor.includes(q);
  });

  if (user?.role !== 'student') {
    return (
      <div className="p-8 text-sm text-red-500">
        Access denied. This page is for students only.
      </div>
    );
  }

  const fmt = (d?: string) =>
    d
      ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—';

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#F8F9FC' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-8 py-6 shrink-0 sticky top-0 z-40"
        style={{ background: 'linear-gradient(135deg, #0F1117 0%, #1A3FD1 100%)' }}>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ShoppingBag size={24} /> My Orders
        </h1>
        <p className="text-sm mt-0.5" style={{ color: '#93C5FD' }}>
          {loading ? 'Loading…' : `${summary?.totalOrders ?? 0} order${(summary?.totalOrders ?? 0) !== 1 ? 's' : ''} total`}
        </p>

        {/* Summary chips */}
        {!loading && summary && (
          <div className="flex flex-wrap gap-6 mt-4">
            {[
              { label: 'Paid Orders',    val: summary.paidOrders },
              { label: 'Total Spent',    val: `₹${summary.totalSpentINR.toLocaleString('en-IN')}` },
              { label: 'Total Sessions', val: summary.totalSessions },
            ].map(({ label, val }) => (
              <div key={label}>
                <p className="text-xs" style={{ color: '#93C5FD' }}>{label}</p>
                <p className="text-base font-bold text-white">{val}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <div className="px-8 py-4 border-b bg-white shrink-0" style={{ borderColor: '#E4E7EF' }}>
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: '#9CA3AF' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search course or tutor…"
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            style={{ color: '#0F1117' }}
          />
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="p-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: '#EEF2FF' }}>
              <BookOpen size={32} style={{ color: '#1A3FD1' }} />
            </div>
            <p className="text-base font-semibold" style={{ color: '#0F1117' }}>
              {search ? 'No orders match your search' : 'No orders yet'}
            </p>
            {!search && (
              <>
                <p className="text-sm" style={{ color: '#8B93A5' }}>
                  Purchase a course to get started
                </p>
                <button onClick={() => router.push('/courses')}
                  className="mt-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                  style={{ background: '#1A3FD1' }}>
                  Browse Courses
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((order) => {
              const ps         = paymentStyle[order.paymentStatus] || paymentStyle.pending;
              const os         = orderStyle[order.status]          || orderStyle.pending;
              const courseName = order.courseId?.courseName || order.courseName || '—';
              const courseImg  = order.courseId?.courseImage;
              const tutor      = order.tutor;
              const tutorInitials = tutor?.name
                ? tutor.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                : '?';

              return (
                <div key={order._id}
                  className="bg-white rounded-2xl border hover:shadow-sm transition-shadow overflow-hidden"
                  style={{ borderColor: '#E4E7EF' }}>

                  <div className="flex">

                    {/* ── Course image thumbnail ─────────────────────────── */}
                    <div
                      className="shrink-0 w-20 self-stretch flex items-center justify-center cursor-pointer"
                      style={{ background: '#EEF2FF', minHeight: '80px' }}
                      onClick={() => order.courseId?._id && router.push(`/courses/${order.courseId._id}`)}>
                      {courseImg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={courseImg} alt={courseName} className="w-full h-full object-cover" />
                      ) : (
                        <BookOpen size={20} style={{ color: '#93C5FD' }} />
                      )}
                    </div>

                    {/* ── Card body ─────────────────────────────────────── */}
                    <div className="flex-1 min-w-0 px-3 py-2.5 flex flex-col gap-1.5">

                      {/* Course name + badges */}
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className="text-sm font-bold leading-snug cursor-pointer hover:text-blue-700 transition-colors truncate"
                          style={{ color: '#0F1117', maxWidth: '55%' }}
                          onClick={() => order.courseId?._id && router.push(`/courses/${order.courseId._id}`)}>
                          {courseName}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{ background: ps.bg, color: ps.text }}>
                            {ps.icon}
                            {order.paymentStatus.charAt(0).toUpperCase() + order.paymentStatus.slice(1)}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold capitalize"
                            style={{ background: os.bg, color: os.text }}>
                            {order.status}
                          </span>
                        </div>
                      </div>

                      {/* Tutor row */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {tutor && (
                          <>
                            <div className="shrink-0 w-5 h-5 rounded-full overflow-hidden flex items-center justify-center text-white font-bold"
                              style={{ fontSize: '9px', background: 'linear-gradient(135deg,#1A3FD1,#6366F1)' }}>
                              {tutor.profileImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={tutor.profileImage} alt={tutor.name} className="w-full h-full object-cover" />
                              ) : tutorInitials}
                            </div>
                            <span className="text-sm font-bold" style={{ color: '#0F1117' }}>{tutor.name}</span>
                          </>
                        )}
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                          style={{ background: '#F3F4F6', color: '#6B7280' }}>
                          {typeLabels[order.type] || order.type}
                        </span>
                        <span className="text-xs" style={{ color: '#8B93A5' }}>{order.subject}</span>
                      </div>

                      {/* Bottom: dates + amount */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs" style={{ color: '#8B93A5' }}>
                          <span className="flex items-center gap-0.5">
                            <Calendar size={10} /> {fmt(order.createdAt)}
                          </span>
                          {order.paidAt && (
                            <span className="flex items-center gap-0.5">
                              <CheckCircle size={10} style={{ color: '#22C55E' }} />
                              Paid {fmt(order.paidAt)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-bold" style={{ color: '#1A3FD1' }}>
                          ₹{order.amountAfterTax.toLocaleString('en-IN')}
                          <span className="text-xs font-normal ml-0.5" style={{ color: '#9CA3AF' }}>incl. tax</span>
                        </p>
                      </div>

                    </div>
                  </div>

                  {/* Footer: txn id + view course */}
                  {(order.transactionId || order.courseId?._id) && (
                    <div className="px-3 py-1.5 flex items-center justify-between gap-2 border-t"
                      style={{ borderColor: '#F3F4F6' }}>
                      {order.transactionId ? (
                        <span className="flex items-center gap-1 text-xs" style={{ color: '#C3C8D4' }}>
                          <Tag size={9} /> {order.transactionId}
                        </span>
                      ) : <span />}
                      {order.courseId?._id && (
                        <button
                          onClick={() => router.push(`/courses/${order.courseId!._id}`)}
                          className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors hover:bg-blue-50"
                          style={{ color: '#1A3FD1', background: '#EEF2FF' }}>
                          View Course →
                        </button>
                      )}
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
