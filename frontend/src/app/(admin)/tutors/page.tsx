'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import api from '@/lib/api';
import { Tutor } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { hasRole } from '@/lib/auth';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'top_rated', label: 'Top Rated' },
  { key: 'flagged', label: 'Flagged' },
  { key: 'new', label: 'New' },
  { key: 'pending', label: 'Pending Approval' },
];

const statusStyles: Record<string, { bg: string; text: string }> = {
  active: { bg: '#F0FDF4', text: '#16A34A' },
  flagged: { bg: '#FEF2F2', text: '#DC2626' },
  suspended: { bg: '#F3F4F6', text: '#6B7280' },
  pending_approval: { bg: '#FFFBEB', text: '#D97706' },
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-sm font-semibold" style={{ color: '#F59E0B' }}>
      ★ {rating > 0 ? rating.toFixed(1) : '—'}
    </span>
  );
}

function Initials({ name }: { name: string }) {
  const parts = name.split(' ');
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
      style={{ background: '#1A3FD1' }}>
      {parts[0]?.[0]}{parts[1]?.[0]}
    </div>
  );
}

export default function TutorsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [stats, setStats] = useState({ avgRating: 0, totalRevenue: 0, avgCompletion: 0 });
  const [filter, setFilter] = useState(searchParams.get('filter') || 'all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const canAct = hasRole(user, 'super_admin', 'operations');
  const canSuspend = hasRole(user, 'super_admin');

  const fetchTutors = async () => {
    setLoading(true);
    try {
      const [tutorsRes, statsRes] = await Promise.all([
        api.get('/tutors', { params: { filter, search: search || undefined, sort: 'rating' } }),
        api.get('/tutors/stats/summary'),
      ]);
      setTutors(tutorsRes.data.data);
      setStats(statsRes.data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchTutors(); }, [filter]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); fetchTutors(); };

  const handleAction = async (id: string, action: 'warn' | 'suspend' | 'approve') => {
    try {
      await api.post(`/tutors/${id}/${action}`);
      fetchTutors();
    } catch (err) { console.error(err); }
  };

  return (
    <div>
      {/* Header */}
      <div className="px-8 py-6 sticky top-0 z-40" style={{ background: 'linear-gradient(135deg, #0F1117 0%, #1A3FD1 100%)' }}>
        <h1 className="text-2xl font-bold text-white">Tutor Management</h1>
        <div className="flex gap-8 mt-3">
          {[
            { label: 'Avg Rating', val: `★ ${stats.avgRating}` },
            { label: 'Completion', val: `${stats.avgCompletion}%` },
            { label: 'Total Payouts', val: `₹${stats.totalRevenue.toLocaleString('en-IN')}` },
          ].map(({ label, val }) => (
            <div key={label}>
              <p className="text-xs" style={{ color: '#93C5FD' }}>{label}</p>
              <p className="text-base font-semibold text-white">{val}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="p-8">
        {/* Filter + Search */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex gap-2 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                style={filter === f.key
                  ? { background: '#1A3FD1', color: '#fff' }
                  : { background: '#EEF2FF', color: '#1A3FD1' }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <form onSubmit={handleSearch} className="flex ml-auto">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: '#E4E7EF', background: '#fff' }}>
              <Search size={14} style={{ color: '#8B93A5' }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tutors…"
                className="outline-none text-sm w-44"
              />
            </div>
          </form>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E4E7EF' }}>
          {loading ? (
            <div className="p-8 text-center text-sm" style={{ color: '#8B93A5' }}>Loading…</div>
          ) : tutors.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: '#8B93A5' }}>No tutors found</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ background: '#F8F9FC', borderBottom: '1px solid #E4E7EF' }}>
                  {['Tutor', 'Subjects', 'Sessions', 'Rating', 'Revenue', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: '#8B93A5' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tutors.map((t, i) => {
                  const st = statusStyles[t.status] || statusStyles.active;
                  const isLow = t.status === 'flagged';
                  return (
                    <tr
                      key={t._id}
                      style={{
                        borderTop: i > 0 ? '1px solid #E4E7EF' : undefined,
                        background: isLow ? '#FFF5F5' : undefined,
                        borderLeft: isLow ? '3px solid #EF4444' : '3px solid transparent',
                      }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Initials name={t.name} />
                          <div>
                            <p className="text-sm font-medium" style={{ color: '#0F1117' }}>{t.name}</p>
                            <p className="text-xs" style={{ color: '#8B93A5' }}>{t.qualification}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {t.subjects.map((s) => (
                            <span key={s} className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#EEF2FF', color: '#1A3FD1' }}>{s}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: '#4B5263' }}>{t.totalSessions}</td>
                      <td className="px-4 py-3"><Stars rating={t.rating} /></td>
                      <td className="px-4 py-3 text-sm font-medium" style={{ color: '#0F1117' }}>₹{t.totalRevenue.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ background: st.bg, color: st.text }}>
                          {t.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => router.push(`/tutors/${t._id}`)} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: '#EEF2FF', color: '#1A3FD1' }}>
                            View
                          </button>
                          {canAct && t.status !== 'suspended' && (
                            <>
                              {t.status === 'pending_approval' && (
                                <button onClick={() => handleAction(t._id, 'approve')} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: '#F0FDF4', color: '#16A34A' }}>
                                  Approve
                                </button>
                              )}
                              <button onClick={() => handleAction(t._id, 'warn')} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: '#FFFBEB', color: '#D97706' }}>
                                Warn
                              </button>
                            </>
                          )}
                          {canSuspend && t.status === 'active' && (
                            <button onClick={() => handleAction(t._id, 'suspend')} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: '#FEF2F2', color: '#DC2626' }}>
                              Suspend
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
