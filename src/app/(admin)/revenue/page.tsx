'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
} from 'recharts';
import { Calendar, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { hasRole } from '@/lib/auth';

// ── Types ──────────────────────────────────────────────────────────────────────
type Period = 'today' | 'week' | 'month' | 'custom';

interface RevenueData {
  role: 'admin' | 'tutor';
  period: { from: string; to: string };
  grossRevenue: number;
  sessionCount: number;
  avgPerSession: number;
  tutorCutPct?: number;
  breakdown: { liveRevenue: number; videoRevenue: number };
  dailyRevenue: { date: string; amount: number }[];
  // Admin only
  tutorPayouts?: number;
  platformShare?: number;
  taxCollected?: number;
  pendingPayouts?: { _id: string; tutor: { name: string }; amount: number; sessionCount: number }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function getDateRange(period: Period, cf: string, ct: string): { from: string; to: string } {
  const today = new Date();
  if (period === 'today') { const t = toYMD(today); return { from: t, to: t }; }
  if (period === 'week') {
    const dow  = today.getDay();               // 0 = Sun
    const diff = dow === 0 ? -6 : 1 - dow;    // back to Monday
    const mon  = new Date(today);
    mon.setDate(today.getDate() + diff);
    return { from: toYMD(mon), to: toYMD(today) };
  }
  if (period === 'month') {
    return {
      from: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`,
      to: toYMD(today),
    };
  }
  // custom
  return { from: cf || toYMD(today), to: ct || toYMD(today) };
}

function humanPeriod(from: string, to: string): string {
  if (!from) return '';
  const fmt = (s: string) =>
    new Date(s + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (from === to)
    return new Date(from + 'T12:00:00').toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  const fd = new Date(from + 'T12:00:00');
  const td = new Date(to   + 'T12:00:00');
  if (fd.getMonth() === td.getMonth() && fd.getFullYear() === td.getFullYear()) {
    return `${fd.getDate()}–${td.getDate()} ${td.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`;
  }
  return `${fmt(from)} – ${fmt(to)}`;
}

// ── Chart tooltip ──────────────────────────────────────────────────────────────
interface TTProps {
  active?: boolean;
  payload?: { value: number; payload: { date: string; amount: number } }[];
}
function ChartTooltip({ active, payload }: TTProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white rounded-xl shadow-lg border px-3 py-2.5 text-xs" style={{ borderColor: '#E4E7EF' }}>
      <p className="font-semibold mb-0.5" style={{ color: '#0F1117' }}>
        {new Date(d.date + 'T12:00:00').toLocaleDateString('en-IN', {
          weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
        })}
      </p>
      <p style={{ color: '#1A3FD1' }}>₹{d.amount.toLocaleString('en-IN')}</p>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function RevenuePage() {
  const { user } = useAuth();
  const isTutor = user?.role === 'tutor';
  const canPay  = hasRole(user, 'super_admin', 'finance');

  // Period state
  const [period,       setPeriod]       = useState<Period>('month');
  const [showCustom,   setShowCustom]   = useState(false);
  const [customFrom,   setCustomFrom]   = useState('');
  const [customTo,     setCustomTo]     = useState('');
  const [stagingFrom,  setStagingFrom]  = useState('');
  const [stagingTo,    setStagingTo]    = useState('');

  // Data state
  const [data,       setData]       = useState<RevenueData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [payingAll,  setPayingAll]  = useState(false);

  const todayStr = toYMD(new Date());

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchData = useCallback((p: Period, cf: string, ct: string) => {
    const { from, to } = getDateRange(p, cf, ct);
    setLoading(true);
    api.get('/revenue/overview', { params: { from, to } })
      .then((r) => setData(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData('month', '', ''); }, [fetchData]);

  // ── Period chip handler ──────────────────────────────────────────────────────
  function handlePeriod(p: Period) {
    setPeriod(p);
    if (p === 'custom') {
      setShowCustom(true);
      if (!stagingFrom) {
        // seed custom picker with current month range
        const { from, to } = getDateRange('month', '', '');
        setStagingFrom(from);
        setStagingTo(to);
      }
      return;
    }
    setShowCustom(false);
    fetchData(p, '', '');
  }

  function applyCustom() {
    if (!stagingFrom || !stagingTo) return;
    setCustomFrom(stagingFrom);
    setCustomTo(stagingTo);
    fetchData('custom', stagingFrom, stagingTo);
  }

  // ── Pay helpers ──────────────────────────────────────────────────────────────
  const refetch = () => fetchData(period, customFrom, customTo);

  const payIndividual = async (id: string) => {
    try { await api.post(`/revenue/pay/${id}`); refetch(); }
    catch (err) { console.error(err); }
  };

  const payAll = async () => {
    setPayingAll(true);
    try { await api.post('/revenue/pay-all'); refetch(); }
    catch (err) { console.error(err); }
    finally { setPayingAll(false); }
  };

  // ── Chart axis formatter ─────────────────────────────────────────────────────
  const chartData = data?.dailyRevenue || [];
  const n = chartData.length;

  function xTickFmt(dateStr: string, index: number): string {
    if (n <= 1)  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    if (n <= 7)  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short' });
    if (n <= 14) return String(new Date(dateStr + 'T12:00:00').getDate());
    if (index % 5 !== 0) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return `${d.getDate()} ${d.toLocaleDateString('en-IN', { month: 'short' })}`;
  }

  const barSize = n <= 1 ? 60 : n <= 7 ? 32 : n <= 14 ? 20 : 12;
  const displayPeriod = data?.period || { from: '', to: '' };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#F8F9FC' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-8 py-6 shrink-0 sticky top-0 z-40"
        style={{ background: 'linear-gradient(135deg, #0F1117 0%, #1A3FD1 100%)' }}>
        <h1 className="text-2xl font-bold text-white">
          {isTutor ? 'My Earnings' : 'Revenue Dashboard'}
        </h1>
        {data && (
          <p className="text-sm mt-0.5" style={{ color: '#93C5FD' }}>
            ₹{data.grossRevenue.toLocaleString('en-IN')}
            {isTutor ? ' your share (70%)' : ' gross (before tax)'}
            {' · '}{humanPeriod(displayPeriod.from, displayPeriod.to)}
          </p>
        )}

        {/* Period chips */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {([
            { key: 'today' as Period, label: 'Today' },
            { key: 'week'  as Period, label: 'This Week' },
            { key: 'month' as Period, label: 'This Month' },
            { key: 'custom'as Period, label: 'Custom' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handlePeriod(key)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                background: period === key ? '#fff' : 'rgba(255,255,255,0.15)',
                color:      period === key ? '#1A3FD1' : '#fff',
              }}
            >
              {key === 'custom' && <Calendar size={11} />}
              {label}
            </button>
          ))}
        </div>

        {/* Custom date range picker */}
        {showCustom && (
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)' }}>
              <span className="text-xs text-white/60">From</span>
              <input
                type="date"
                value={stagingFrom}
                max={stagingTo || todayStr}
                onChange={(e) => setStagingFrom(e.target.value)}
                className="bg-transparent text-white text-xs outline-none w-32"
                style={{ colorScheme: 'dark' }}
              />
              <ChevronRight size={12} className="text-white/40 shrink-0" />
              <span className="text-xs text-white/60">To</span>
              <input
                type="date"
                value={stagingTo}
                min={stagingFrom}
                max={todayStr}
                onChange={(e) => setStagingTo(e.target.value)}
                className="bg-transparent text-white text-xs outline-none w-32"
                style={{ colorScheme: 'dark' }}
              />
            </div>
            <button
              onClick={applyCustom}
              disabled={!stagingFrom || !stagingTo}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-white disabled:opacity-50"
              style={{ color: '#1A3FD1' }}
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 py-24">
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data ? (
        <div className="p-8 text-sm text-red-500">Failed to load revenue data</div>
      ) : (
        <div className="p-8 space-y-6">

          {/* ── KPI Cards ────────────────────────────────────────────────────── */}
          {isTutor ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'My Earnings (70% share)', val: `₹${data.grossRevenue.toLocaleString('en-IN')}`, color: '#1A3FD1' },
                { label: 'Total Sessions',           val: data.sessionCount.toString(),                    color: '#10B981' },
                { label: 'Avg Earnings / Session',   val: `₹${data.avgPerSession.toLocaleString('en-IN')}`,color: '#F59E0B' },
              ].map(({ label, val, color }) => (
                <div key={label} className="bg-white rounded-xl p-5 border"
                  style={{ borderColor: '#E4E7EF', borderLeft: `4px solid ${color}` }}>
                  <p className="text-xs font-medium mb-1" style={{ color: '#8B93A5' }}>{label}</p>
                  <p className="text-2xl font-bold" style={{ color: '#0F1117' }}>{val}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {[
                { label: 'Gross Revenue',          val: `₹${data.grossRevenue.toLocaleString('en-IN')}`,          color: '#1A3FD1', sub: `${data.sessionCount} paid order${data.sessionCount !== 1 ? 's' : ''}` },
                { label: 'Tutor Payouts (70%)',     val: `₹${(data.tutorPayouts ?? 0).toLocaleString('en-IN')}`,   color: '#8B5CF6' },
                { label: 'Platform Share (30%)',    val: `₹${(data.platformShare ?? 0).toLocaleString('en-IN')}`,  color: '#10B981' },
                { label: 'GST Collected (2%)',      val: `₹${(data.taxCollected ?? 0).toLocaleString('en-IN')}`,   color: '#F59E0B', sub: `Avg ₹${data.avgPerSession.toLocaleString('en-IN')} / order` },
              ].map(({ label, val, color, sub }) => (
                <div key={label} className="bg-white rounded-xl p-5 border"
                  style={{ borderColor: '#E4E7EF', borderLeft: `4px solid ${color}` }}>
                  <p className="text-xs font-medium mb-1" style={{ color: '#8B93A5' }}>{label}</p>
                  <p className="text-2xl font-bold" style={{ color: '#0F1117' }}>{val}</p>
                  {sub && <p className="text-xs mt-1" style={{ color: '#8B93A5' }}>{sub}</p>}
                </div>
              ))}
            </div>
          )}

          {/* ── Daily Earnings + Earnings by Type ────────────────────────────── */}
          <div className="grid gap-4" style={{ gridTemplateColumns: '65fr 35fr' }}>

            {/* Left: Daily Revenue Chart */}
            <div className="bg-white rounded-xl p-6 border" style={{ borderColor: '#E4E7EF' }}>
              <h2 className="text-sm font-semibold mb-1" style={{ color: '#0F1117' }}>
                {isTutor ? 'My Daily Earnings' : 'Daily Revenue'}
              </h2>
              <p className="text-xs mb-4" style={{ color: '#8B93A5' }}>
                {humanPeriod(displayPeriod.from, displayPeriod.to)}
                {' · '}{n} day{n !== 1 ? 's' : ''}
              </p>

              {chartData.every((d) => d.amount === 0) ? (
                <div className="flex items-center justify-center h-48" style={{ color: '#8B93A5' }}>
                  <p className="text-sm">No revenue data for this period</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} barSize={barSize}
                    margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#F3F4F6" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: '#9CA3AF' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={xTickFmt}
                      interval={0}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#9CA3AF' }}
                      axisLine={false}
                      tickLine={false}
                      width={36}
                      tickFormatter={(v: number) =>
                        v === 0 ? '0' : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                      }
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: '#EEF2FF' }} />
                    <Bar dataKey="amount" radius={[3, 3, 0, 0]}>
                      {chartData.map((entry) => (
                        <Cell
                          key={entry.date}
                          fill={
                            entry.date === todayStr
                              ? '#0F1117'
                              : entry.amount > 0
                                ? '#1A3FD1'
                                : '#E4E7EF'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}

              {/* Legend */}
              <div className="flex items-center gap-5 mt-3 text-xs" style={{ color: '#8B93A5' }}>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block shrink-0" style={{ background: '#0F1117' }} />
                  Today
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block shrink-0" style={{ background: '#1A3FD1' }} />
                  Revenue
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block shrink-0" style={{ background: '#E4E7EF' }} />
                  No revenue
                </span>
              </div>
            </div>

            {/* Right: Revenue by Type */}
            <div className="bg-white rounded-xl p-6 border" style={{ borderColor: '#E4E7EF' }}>
              <h2 className="text-sm font-semibold mb-4" style={{ color: '#0F1117' }}>
                {isTutor ? 'Earnings by Type' : 'Revenue by Type'}
              </h2>
              {data.grossRevenue === 0 ? (
                <div className="flex items-center justify-center h-32" style={{ color: '#8B93A5' }}>
                  <p className="text-sm">No data for this period</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {[
                    { label: 'Live Sessions', val: data.breakdown.liveRevenue,  color: '#1A3FD1' },
                    { label: 'Video Courses', val: data.breakdown.videoRevenue, color: '#8B5CF6' },
                  ].map(({ label, val, color }) => {
                    const pct = data.grossRevenue > 0 ? Math.round((val / data.grossRevenue) * 100) : 0;
                    return (
                      <div key={label}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium" style={{ color: '#4B5263' }}>{label}</span>
                          <span className="text-xs font-semibold" style={{ color }}>
                            {pct}%
                          </span>
                        </div>
                        <div className="h-2.5 rounded-full w-full" style={{ background: '#E4E7EF' }}>
                          <div className="h-2.5 rounded-full transition-all"
                            style={{ width: `${pct}%`, background: color }} />
                        </div>
                        <p className="text-xs mt-1 font-semibold" style={{ color: '#0F1117' }}>
                          ₹{val.toLocaleString('en-IN')}
                        </p>
                      </div>
                    );
                  })}

                  {/* Donut-style summary */}
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: '#E4E7EF' }}>
                    <p className="text-xs mb-2" style={{ color: '#8B93A5' }}>Total</p>
                    <p className="text-xl font-bold" style={{ color: '#0F1117' }}>
                      ₹{data.grossRevenue.toLocaleString('en-IN')}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#8B93A5' }}>
                      {data.sessionCount} paid order{data.sessionCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* ── Pending Payouts (admin only) ─────────────────────────────────── */}
          {!isTutor && (
            <div className="bg-white rounded-xl p-6 border" style={{ borderColor: '#E4E7EF' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold" style={{ color: '#0F1117' }}>
                  Pending Payouts ({(data.pendingPayouts || []).length} tutor{(data.pendingPayouts || []).length !== 1 ? 's' : ''})
                </h2>
                {canPay && (data.pendingPayouts || []).length > 0 && (
                  <button
                    onClick={payAll}
                    disabled={payingAll}
                    className="text-sm px-4 py-2 rounded-lg font-semibold text-white"
                    style={{ background: '#1A3FD1', opacity: payingAll ? 0.7 : 1 }}
                  >
                    {payingAll ? 'Processing…' : `Pay All ${(data.pendingPayouts || []).length} Tutors`}
                  </button>
                )}
              </div>

              {(data.pendingPayouts || []).length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: '#8B93A5' }}>
                  No pending payouts 🎉
                </p>
              ) : (
                <div className="space-y-2">
                  {(data.pendingPayouts || []).map((p) => (
                    <div key={p._id}
                      className="flex items-center justify-between p-3 rounded-xl border"
                      style={{ borderColor: '#E4E7EF' }}>
                      <div>
                        <p className="text-sm font-medium" style={{ color: '#0F1117' }}>
                          {p.tutor?.name || 'Unknown'}
                        </p>
                        <p className="text-xs" style={{ color: '#8B93A5' }}>
                          {p.sessionCount} session{p.sessionCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold" style={{ color: '#0F1117' }}>
                          ₹{p.amount.toLocaleString('en-IN')}
                        </span>
                        {canPay && (
                          <button
                            onClick={() => payIndividual(p._id)}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium"
                            style={{ background: '#F0FDF4', color: '#16A34A' }}
                          >
                            Pay
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
