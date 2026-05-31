'use client';
import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle, Calendar, Activity } from 'lucide-react';
import api from '@/lib/api';
import { User } from '@/lib/types';
import TopInstructors from './TopInstructors';

// ── Types ─────────────────────────────────────────────────────────────────────
interface SessionItem {
  _id: string;
  courseName: string;
  startDateTime: string;
  endDateTime: string;
  durationMinutes: number;
  tutorId?: { _id: string; name: string } | null;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
}

interface StudentProfile {
  _id: string;
  name: string;
  grade?: string;
  subjects?: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Derive real display status from DB status + time window.
// Sessions often stay 'scheduled' in DB even after endDateTime passes.
function getDisplayStatus(s: SessionItem, now: Date): string {
  if (s.status === 'completed' || s.status === 'cancelled') return s.status;
  if (s.status === 'ongoing') return 'ongoing';
  // 'scheduled' — decide by time
  const start = new Date(s.startDateTime);
  const end   = new Date(s.endDateTime);
  if (end   <  now) return 'completed';            // past end → treat as completed
  if (start <= now) return 'ongoing';              // started but not ended → live
  return 'scheduled';                              // future → upcoming
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E4E7EF' }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: '#8B93A5' }}>{label}</p>
          <p className="text-2xl font-bold" style={{ color: '#0F1117' }}>{value}</p>
          {sub && <p className="text-xs mt-1" style={{ color: '#4B5263' }}>{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: color + '20' }}>
          <Icon size={18} style={{ color }} />
        </div>
      </div>
    </div>
  );
}

// ── Status styles ─────────────────────────────────────────────────────────────
const statusStyle: Record<string, { bg: string; color: string; label: string }> = {
  scheduled: { bg: '#EEF2FF', color: '#1A3FD1', label: 'Upcoming'  },
  ongoing:   { bg: '#ECFDF5', color: '#16A34A', label: 'Live Now'  },
  completed: { bg: '#F0FDF4', color: '#16A34A', label: 'Completed' },
  cancelled: { bg: '#FEF2F2', color: '#DC2626', label: 'Cancelled' },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function StudentDashboard({ user }: { user: User }) {
  const [student,  setStudent]  = useState<StudentProfile | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!user.linkedId) { setLoading(false); return; }
    Promise.all([
      api.get(`/students/${user.linkedId}`),
      api.get('/sessions', { params: { studentId: user.linkedId, limit: 200 } }),
    ])
      .then(([sRes, sessRes]) => {
        setStudent(sRes.data.data);
        setSessions(sessRes.data.data ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user.linkedId]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // ── Derive stats from Session collection (time-aware) ────────────────────
  const now       = new Date();
  const completed = sessions.filter((s) => getDisplayStatus(s, now) === 'completed').length;
  const upcoming  = sessions.filter((s) => getDisplayStatus(s, now) === 'scheduled').length;
  const ongoing   = sessions.filter((s) => getDisplayStatus(s, now) === 'ongoing').length;

  // Recent 5 sessions — most recent first
  const recent = [...sessions]
    .sort((a, b) => new Date(b.startDateTime).getTime() - new Date(a.startDateTime).getTime())
    .slice(0, 5);

  if (loading) return <div className="p-8 text-sm" style={{ color: '#8B93A5' }}>Loading…</div>;

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-8 py-6 sticky top-0 z-40" style={{ background: 'linear-gradient(135deg, #0F1117 0%, #1A3FD1 100%)' }}>
        <h1 className="text-2xl font-bold text-white">
          {greeting()}, {user.displayName || user.firstName || user.name}! 👋
        </h1>
        <p className="text-sm mt-0.5" style={{ color: '#93C5FD' }}>
          {new Date().toLocaleDateString('en-IN', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          })}
        </p>
        {student?.grade && (
          <span className="inline-block mt-2 text-xs px-2.5 py-1 rounded-full font-medium"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
            Grade {student.grade}
          </span>
        )}
      </div>

      <div className="p-8 space-y-6">
        {/* ── Stats ──────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            label="Total Sessions"
            value={sessions.length.toString()}
            icon={BookOpen}
            color="#1A3FD1"
            sub={sessions.length > 0 ? 'All enrolled sessions' : 'No sessions yet'}
          />
          <StatCard
            label="Completed"
            value={completed.toString()}
            icon={CheckCircle}
            color="#10B981"
            sub={sessions.length > 0 ? `${Math.round((completed / sessions.length) * 100)}% completion` : undefined}
          />
          <StatCard
            label="Upcoming"
            value={upcoming.toString()}
            icon={Calendar}
            color="#F59E0B"
            sub={upcoming > 0 ? 'Scheduled ahead' : 'No upcoming sessions'}
          />
          <StatCard
            label="Live Now"
            value={ongoing.toString()}
            icon={Activity}
            color={ongoing > 0 ? '#16A34A' : '#8B5CF6'}
            sub={ongoing > 0 ? 'Sessions in progress' : 'No live sessions'}
          />
        </div>

        {/* ── Subjects ───────────────────────────────────────────────────────── */}
        {student?.subjects && student.subjects.length > 0 && (
          <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E4E7EF' }}>
            <h2 className="text-sm font-semibold mb-3" style={{ color: '#0F1117' }}>My Subjects</h2>
            <div className="flex flex-wrap gap-2">
              {student.subjects.map((s) => (
                <span key={s} className="text-sm px-3 py-1 rounded-full font-medium"
                  style={{ background: '#EEF2FF', color: '#1A3FD1' }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Recent Sessions + Top Instructors side by side 65/35 ─────────── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: '60fr 40fr' }}>
          {/* Recent Sessions */}
          <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E4E7EF' }}>
            <h2 className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: '#8B93A5' }}>Recent Sessions</h2>
            {recent.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: '#8B93A5' }}>No sessions yet</p>
            ) : (
              <div className="space-y-3">
                {recent.map((s) => {
                  const displayStatus = getDisplayStatus(s, now);
                  const st = statusStyle[displayStatus] || statusStyle.scheduled;
                  return (
                    <div key={s._id}
                      className="flex items-center justify-between p-3 rounded-xl border"
                      style={{ borderColor: '#E4E7EF' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: '#0F1117' }}>
                          {s.courseName || 'Session'}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: '#8B93A5' }}>
                          {fmtDateTime(s.startDateTime)}
                          {s.durationMinutes ? ` · ${s.durationMinutes} min` : ''}
                        </p>
                        {s.tutorId && typeof s.tutorId === 'object' && (
                          <p className="text-xs mt-0.5" style={{ color: '#C3C8D4' }}>
                            {s.tutorId.name}
                          </p>
                        )}
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full ml-3 shrink-0"
                        style={{ background: st.bg, color: st.color }}>
                        {displayStatus === 'ongoing' ? '🔴 Live' : st.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top Instructors */}
          <TopInstructors />
        </div>
      </div>
    </div>
  );
}
