'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, MessageSquare, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { Tutor } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { hasRole } from '@/lib/auth';

const statusStyles: Record<string, { bg: string; text: string }> = {
  active: { bg: '#F0FDF4', text: '#16A34A' },
  flagged: { bg: '#FEF2F2', text: '#DC2626' },
  suspended: { bg: '#F3F4F6', text: '#6B7280' },
  pending_approval: { bg: '#FFFBEB', text: '#D97706' },
};

function PerformanceBar({ label, value, max, threshold, invert = false }: {
  label: string; value: number; max: number; threshold: number; invert?: boolean;
}) {
  const pct = (value / max) * 100;
  const below = invert ? value > threshold : value < threshold;
  const color = below ? '#EF4444' : '#22C55E';
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs w-40 shrink-0" style={{ color: '#4B5263' }}>{label}</span>
      <div className="flex-1 h-2 rounded-full" style={{ background: '#E4E7EF' }}>
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold w-12 text-right" style={{ color: below ? '#EF4444' : '#0F1117' }}>
        {value}{max === 5 ? '/5' : '%'}
      </span>
      {below && <span className="text-xs text-red-500">⚠</span>}
    </div>
  );
}

export default function TutorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [reviews, setReviews] = useState<{ _id: string; parentName: string; rating: number; review: string; topic: string; createdAt: string }[]>([]);
  const [reviewStats, setReviewStats] = useState<{ avgRating: number; totalReviews: number; ratingBreakdown: { star: number; count: number }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionDone, setActionDone] = useState('');

  const canAct = hasRole(user, 'super_admin', 'operations');

  useEffect(() => {
    Promise.all([
      api.get(`/tutors/${id}`),
      api.get(`/reviews/tutor/${id}`),
    ])
      .then(([tutorRes, reviewsRes]) => {
        setTutor(tutorRes.data.data);
        setReviews(reviewsRes.data.data);
        setReviewStats(reviewsRes.data.summary);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const handleWarn = async () => {
    await api.post(`/tutors/${id}/warn`, { reason: 'Warning issued by admin' });
    setActionDone('Warning issued successfully');
    const r = await api.get(`/tutors/${id}`);
    setTutor(r.data.data);
  };

  if (loading) return <div className="p-8 text-sm" style={{ color: '#8B93A5' }}>Loading…</div>;
  if (!tutor) return <div className="p-8 text-sm text-red-500">Tutor not found</div>;

  const st = statusStyles[tutor.status] || statusStyles.active;
  const p = tutor.performance;

  return (
    <div>
      {/* Hero */}
      <div className="px-8 py-6 sticky top-0 z-40" style={{ background: 'linear-gradient(135deg, #0F1117 0%, #1A3FD1 100%)' }}>
        <button onClick={() => router.push('/tutors')} className="flex items-center gap-2 mb-4 text-sm" style={{ color: '#93C5FD' }}>
          <ArrowLeft size={16} /> Back to Tutors
        </button>
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>
            {tutor.name.split(' ').map((n) => n[0]).join('')}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-white">{tutor.name}</h1>
              <span className="text-xs px-2.5 py-1 rounded-full capitalize font-medium" style={{ background: st.bg, color: st.text }}>
                {tutor.status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-sm mt-0.5" style={{ color: '#93C5FD' }}>{tutor.qualification} · {tutor.experience} years exp</p>
            <div className="flex gap-6 mt-3 flex-wrap">
              {[
                { label: 'Rating', val: `★ ${tutor.rating > 0 ? tutor.rating.toFixed(1) : '—'}` },
                { label: 'Sessions', val: tutor.totalSessions.toString() },
                { label: 'Revenue', val: `₹${tutor.totalRevenue.toLocaleString('en-IN')}` },
                { label: 'Warnings', val: tutor.warningCount.toString() },
              ].map(({ label, val }) => (
                <div key={label}>
                  <p className="text-xs" style={{ color: '#93C5FD' }}>{label}</p>
                  <p className="text-base font-semibold text-white">{val}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {actionDone && (
          <div className="px-4 py-3 rounded-lg text-sm text-green-700 bg-green-50 border border-green-200">{actionDone}</div>
        )}

        {/* Subjects */}
        <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E4E7EF' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: '#0F1117' }}>Subjects</h3>
          <div className="flex flex-wrap gap-2">
            {tutor.subjects.map((s) => (
              <span key={s} className="text-sm px-3 py-1 rounded-full" style={{ background: '#EEF2FF', color: '#1A3FD1' }}>{s}</span>
            ))}
          </div>
        </div>

        {/* Performance */}
        <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E4E7EF' }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: '#0F1117' }}>Performance Dimensions</h3>
          <div className="space-y-4">
            <PerformanceBar label="Teaching Quality" value={p.teachingQuality} max={5} threshold={4.0} />
            <PerformanceBar label="Punctuality" value={p.punctuality} max={100} threshold={90} />
            <PerformanceBar label="Communication" value={p.communication} max={5} threshold={4.0} />
            <PerformanceBar label="Student Progress" value={p.studentProgress} max={5} threshold={3.5} />
            <PerformanceBar label="Rebook Rate" value={p.rebookRate} max={100} threshold={60} />
            <PerformanceBar label="Completion Rate" value={p.completionRate} max={100} threshold={80} />
            <PerformanceBar label="No-show Rate (low is good)" value={p.noShowRate} max={20} threshold={5} invert />
          </div>
        </div>

        {/* Reviews */}
        <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E4E7EF' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: '#0F1117' }}>Reviews</h3>
            {reviewStats && reviewStats.totalReviews > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold" style={{ color: '#F59E0B' }}>★ {reviewStats.avgRating}</span>
                <span className="text-xs" style={{ color: '#8B93A5' }}>({reviewStats.totalReviews} reviews)</span>
              </div>
            )}
          </div>

          {/* Star rating breakdown */}
          {reviewStats && reviewStats.totalReviews > 0 && (
            <div className="mb-5 p-4 rounded-xl" style={{ background: '#F9FAFB' }}>
              <div className="space-y-2">
                {reviewStats.ratingBreakdown.map(({ star, count }) => {
                  const pct = reviewStats.totalReviews > 0 ? (count / reviewStats.totalReviews) * 100 : 0;
                  return (
                    <div key={star} className="flex items-center gap-3">
                      <div className="flex items-center gap-1 w-20 shrink-0">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i} style={{ color: i < star ? '#F59E0B' : '#E4E7EF', fontSize: 12 }}>★</span>
                        ))}
                      </div>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#E4E7EF' }}>
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{ width: `${pct}%`, background: star >= 4 ? '#22C55E' : star === 3 ? '#F59E0B' : '#EF4444' }}
                        />
                      </div>
                      <span className="text-xs font-semibold w-6 text-right" style={{ color: '#0F1117' }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {reviews.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: '#8B93A5' }}>No reviews yet</p>
          ) : (
            <div className="space-y-3">
              {reviews.map((fb) => (
                <div key={fb._id} className="p-4 rounded-xl border" style={{ borderColor: '#E4E7EF' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: '#0F1117' }}>{fb.parentName}</span>
                      {fb.topic && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#EEF2FF', color: '#1A3FD1' }}>{fb.topic}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} style={{ color: i < fb.rating ? '#F59E0B' : '#E4E7EF', fontSize: 14 }}>★</span>
                      ))}
                      <span className="text-xs ml-1" style={{ color: '#8B93A5' }}>
                        {new Date(fb.createdAt).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm" style={{ color: '#4B5263' }}>{fb.review}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        {canAct && (
          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: '#1A3FD1' }}>
              <MessageSquare size={16} /> Message Tutor
            </button>
            <button
              onClick={handleWarn}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border"
              style={{ borderColor: '#D97706', color: '#D97706' }}
            >
              <AlertTriangle size={16} /> Issue Warning
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
