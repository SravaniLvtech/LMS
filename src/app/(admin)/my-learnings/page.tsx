'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, BookOpen, Search, Star, Calendar, Tag, Users, MessageSquare, Send, CheckCircle, X } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { hasRole } from '@/lib/auth';

// ── Types ──────────────────────────────────────────────────────────────────────
interface SubCourse {
  _id: string;
  courseName: string;
  courseImage?: string;
  price: number;
  discountedPrice?: number;
  category: string;
  subject: string;
  level: string;
  enrolledCount?: number;
}
interface SubTutor  { _id: string; name: string; rating?: number }
interface SubOrder  { _id: string; amountBeforeTax: number; amountAfterTax: number; paymentStatus: string; createdAt: string }
interface Subscription {
  _id: string;
  courseId: SubCourse;
  tutorId?: SubTutor;
  orderId?: SubOrder;
  status: 'confirmed' | 'cancelled' | 'expired';
  createdAt: string;
}

// ── Review state per card ──────────────────────────────────────────────────────
interface ReviewState {
  open:    boolean;
  rating:  number;
  text:    string;
  topic:   string;
  loading: boolean;
  done:    boolean;
  error:   string;
}
const defaultReview = (): ReviewState => ({
  open: false, rating: 0, text: '', topic: '', loading: false, done: false, error: '',
});

const ADMIN_ROLES = ['super_admin', 'operations', 'finance', 'support_agent'] as const;

const levelColors: Record<string, { bg: string; text: string }> = {
  beginner:     { bg: '#F0FDF4', text: '#16A34A' },
  intermediate: { bg: '#FFFBEB', text: '#D97706' },
  advanced:     { bg: '#FEF2F2', text: '#DC2626' },
};

const statusStyle: Record<string, { bg: string; text: string; dot: string }> = {
  confirmed: { bg: '#ECFDF5', text: '#16A34A', dot: '#22C55E' },
  cancelled: { bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444' },
  expired:   { bg: '#F3F4F6', text: '#6B7280', dot: '#9CA3AF' },
};

// ── Star Picker ────────────────────────────────────────────────────────────────
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className="transition-transform hover:scale-110">
          <Star size={16}
            style={{
              color: (hover || value) >= star ? '#F59E0B' : '#D1D5DB',
              fill:  (hover || value) >= star ? '#F59E0B' : 'none',
            }} />
        </button>
      ))}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function MyLearningsPage() {
  const router = useRouter();
  const { user } = useAuth();

  const isAdmin   = hasRole(user, ...ADMIN_ROLES);
  const isStudent = user?.role === 'student';

  const [subs,    setSubs]    = useState<Subscription[]>([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  // Per-card review state map: subscriptionId → ReviewState
  const [reviews, setReviews] = useState<Record<string, ReviewState>>({});

  const updateReview = (subId: string, patch: Partial<ReviewState>) =>
    setReviews((prev) => ({ ...prev, [subId]: { ...(prev[subId] || defaultReview()), ...patch } }));

  const fetchSubs = useCallback(() => {
    if (!user?._id && !isAdmin) return;
    setLoading(true);

    const params: Record<string, string> = { limit: '200', status: 'confirmed' };

    api.get('/subscriptions', { params })
      .then((r) => {
        const data: Subscription[] = r.data.data || [];
        setSubs(data);
        setTotal(r.data.total || 0);

        // Pre-mark already-reviewed courses so the button is disabled on load
        const linkedId = user?.linkedId;
        if (linkedId && data.length > 0) {
          const courseIds = data
            .map((s) => s.courseId?._id)
            .filter(Boolean)
            .join(',');

          api.get('/reviews/check-by-student', { params: { student: linkedId, courseIds } })
            .then((rv) => {
              const reviewed: string[] = rv.data.data || [];
              if (reviewed.length === 0) return;

              setReviews((prev) => {
                const next = { ...prev };
                data.forEach((s) => {
                  if (reviewed.includes(s.courseId?._id)) {
                    next[s._id] = { ...(next[s._id] || defaultReview()), done: true };
                  }
                });
                return next;
              });
            })
            .catch(console.error);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user?._id, user?.linkedId, isAdmin, isStudent]);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  // Client-side search by course name or tutor name
  const filtered = subs.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.courseId?.courseName?.toLowerCase().includes(q) ||
      s.tutorId?.name?.toLowerCase().includes(q)
    );
  });

  const submitReview = async (sub: Subscription) => {
    const rv = reviews[sub._id] || defaultReview();
    if (!rv.rating)       { updateReview(sub._id, { error: 'Please select a star rating.' });  return; }
    if (!rv.text.trim())  { updateReview(sub._id, { error: 'Please write a review.' });         return; }
    if (!sub.tutorId?._id){ updateReview(sub._id, { error: 'No tutor associated.' });           return; }

    updateReview(sub._id, { loading: true, error: '' });
    try {
      await api.post('/reviews', {
        tutor:      sub.tutorId._id,
        courseId:   sub.courseId?._id,
        student:    user?.linkedId || user?._id,
        parentName: user?.name,
        rating:     rv.rating,
        review:     rv.text.trim(),
        topic:      rv.topic.trim() || undefined,
      });
      updateReview(sub._id, { loading: false, done: true, open: false });
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } } };
      // 409 = already reviewed — mark as done silently
      if (e?.response?.status === 409) {
        updateReview(sub._id, { loading: false, done: true, open: false });
      } else {
        updateReview(sub._id, { loading: false, error: e?.response?.data?.message || 'Failed to submit.' });
      }
    }
  };

  if (!isAdmin && !isStudent) {
    return (
      <div className="p-8 text-sm text-red-500">
        Access denied. This page is for students only.
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#F8F9FC' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-8 py-6 shrink-0 sticky top-0 z-40"
        style={{ background: 'linear-gradient(135deg, #0F1117 0%, #1A3FD1 100%)' }}>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <GraduationCap size={24} /> My Learnings
            </h1>
            <p className="text-sm mt-0.5" style={{ color: '#93C5FD' }}>
              {loading ? 'Loading…' : `${total} course${total !== 1 ? 's' : ''} purchased`}
            </p>
          </div>
        </div>
      </div>

      {/* ── Search bar ─────────────────────────────────────────────────────── */}
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
              {search ? 'No courses match your search' : 'No courses yet'}
            </p>
            {!search && (
              <>
                <p className="text-sm" style={{ color: '#8B93A5' }}>
                  Browse and purchase courses to start learning
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {filtered.map((sub) => {
              const c   = sub.courseId;
              const t   = sub.tutorId;
              const o   = sub.orderId;
              const lc  = levelColors[c?.level] || levelColors.beginner;
              const ss  = statusStyle[sub.status] || statusStyle.confirmed;
              const pricePaid = o?.amountBeforeTax ?? c?.discountedPrice ?? c?.price ?? 0;
              const enrolledOn = new Date(sub.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
              });
              const rv = reviews[sub._id] || defaultReview();

              return (
                <div key={sub._id}
                  className="bg-white rounded-xl border overflow-hidden flex flex-col"
                  style={{ borderColor: '#E4E7EF' }}>

                  {/* Course image — clickable */}
                  <div
                    className="relative w-full h-28 shrink-0 cursor-pointer"
                    style={{ background: '#EEF2FF' }}
                    onClick={() => router.push(`/courses/${c?._id}`)}>
                    {c?.courseImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.courseImage} alt={c.courseName}
                        className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl">📚</div>
                    )}
                    {/* Status badge */}
                    <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{ background: ss.bg, color: ss.text }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: ss.dot }} />
                      {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                    </span>
                    {/* Level badge */}
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-semibold capitalize"
                      style={{ background: lc.bg, color: lc.text }}>
                      {c?.level}
                    </span>
                  </div>

                  {/* Card body */}
                  <div className="flex flex-col flex-1 p-3 gap-2">

                    {/* Course name */}
                    <div
                      className="cursor-pointer"
                      onClick={() => router.push(`/courses/${c?._id}`)}>
                      <h3 className="text-xs font-bold leading-snug hover:text-blue-700 transition-colors"
                        style={{ color: '#0F1117' }}>
                        {c?.courseName || '—'}
                      </h3>
                      <p className="text-xs mt-0.5 capitalize" style={{ color: '#8B93A5' }}>
                        {c?.category} · {c?.subject}
                      </p>
                    </div>

                    {/* Tutor + rating */}
                    {t && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ background: '#1A3FD1', fontSize: 9 }}>
                          {t.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate" style={{ color: '#0F1117' }}>{t.name}</p>
                          {t.rating && t.rating > 0 ? (
                            <p className="text-xs flex items-center gap-0.5" style={{ color: '#F59E0B' }}>
                              <Star size={9} fill="#F59E0B" /> {t.rating.toFixed(1)}
                            </p>
                          ) : (
                            <p className="text-xs flex items-center gap-0.5" style={{ color: '#9CA3AF' }}>
                              <Star size={9} /> No ratings
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Enrolled count */}
                    <div className="flex items-center gap-1 text-xs" style={{ color: '#6B7280' }}>
                      <Users size={11} style={{ color: '#1A3FD1' }} />
                      <span>
                        {(c?.enrolledCount ?? 0) > 0
                          ? `${c!.enrolledCount} enrolled`
                          : 'No enrolments yet'}
                      </span>
                    </div>

                    {/* Divider */}
                    <div className="border-t" style={{ borderColor: '#E4E7EF' }} />

                    {/* Footer: price + enrolled date */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-xs" style={{ color: '#8B93A5' }}>
                        <Calendar size={10} />
                        <span>{enrolledOn}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Tag size={10} style={{ color: '#1A3FD1' }} />
                        <span className="text-xs font-bold" style={{ color: '#1A3FD1' }}>
                          ₹{pricePaid.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    {/* ── Write Review section ──────────────────────────────── */}
                    {t && (
                      <>
                        {/* Toggle button or already-reviewed badge */}
                        {!rv.open && (
                          rv.done ? (
                            <div className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold cursor-default"
                              style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>
                              <CheckCircle size={11} /> Reviewed
                            </div>
                          ) : (
                            <button
                              onClick={() => updateReview(sub._id, { open: true })}
                              className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors hover:bg-blue-50"
                              style={{ color: '#1A3FD1', borderColor: '#C7D2FE', background: '#EEF2FF' }}>
                              <MessageSquare size={11} /> Write a Review
                            </button>
                          )
                        )}

                        {/* Inline review form */}
                        {rv.open && !rv.done && (
                          <div className="rounded-lg border p-2.5 space-y-2"
                            style={{ borderColor: '#E4E7EF', background: '#F8F9FC' }}>

                            {/* Header row */}
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold" style={{ color: '#0F1117' }}>Rate this course</p>
                              <button onClick={() => updateReview(sub._id, { open: false, error: '' })}
                                className="text-gray-400 hover:text-gray-600">
                                <X size={12} />
                              </button>
                            </div>

                            {/* Stars */}
                            <StarPicker value={rv.rating} onChange={(v) => updateReview(sub._id, { rating: v })} />

                            {/* Topic */}
                            <input
                              type="text"
                              value={rv.topic}
                              onChange={(e) => updateReview(sub._id, { topic: e.target.value })}
                              placeholder="Topic (optional)"
                              className="w-full px-2 py-1 border border-gray-200 rounded-md text-xs focus:outline-none focus:border-blue-400"
                              style={{ color: '#0F1117' }}
                            />

                            {/* Review text */}
                            <textarea
                              value={rv.text}
                              onChange={(e) => updateReview(sub._id, { text: e.target.value })}
                              placeholder="Share your experience…"
                              rows={2}
                              className="w-full px-2 py-1 border border-gray-200 rounded-md text-xs resize-none focus:outline-none focus:border-blue-400"
                              style={{ color: '#0F1117' }}
                            />

                            {/* Error */}
                            {rv.error && (
                              <p className="text-xs" style={{ color: '#EF4444' }}>{rv.error}</p>
                            )}

                            {/* Submit */}
                            <button
                              onClick={() => submitReview(sub)}
                              disabled={rv.loading}
                              className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60 transition-opacity"
                              style={{ background: 'linear-gradient(135deg, #1A3FD1 0%, #4F46E5 100%)' }}>
                              {rv.loading ? (
                                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <><Send size={10} /> Submit</>
                              )}
                            </button>
                          </div>
                        )}
                      </>
                    )}

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
