'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, BookOpen, Calendar, Clock, Users, Star,
  ShoppingCart, Heart, Check, Zap, Tag, Award, Globe,
  Edit, AlertCircle, CheckCircle, Send, MessageSquare, Video, Lock,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { hasRole } from '@/lib/auth';

interface CourseDetail {
  _id: string;
  courseName: string;
  description?: string;
  courseImage?: string;
  category: string;
  subject: string;
  level: string;
  type: string;
  price: number;
  discountedPrice?: number;
  isActive: boolean;
  isPublished: boolean;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  startDateTime?: string;
  endDateTime?: string;
  timezone?: string;
  durationMinutes?: number;
  sessionCount: number;
  enrolledCount: number;
  maxSlots?: number;
  availableSlots?: number;
  grades?: string[];
  tags?: string[];
  tutor?: InstructorSummary;
  assignedInstructor?: InstructorSummary;
  videoUrl?: string;
  createdAt: string;
}

interface InstructorSummary {
  _id: string;
  name: string;
  rating: number;
  subjects?: string[];
}

const levelColors: Record<string, { bg: string; text: string; border: string }> = {
  beginner:     { bg: '#F0FDF4', text: '#16A34A', border: '#86EFAC' },
  intermediate: { bg: '#FFFBEB', text: '#D97706', border: '#FCD34D' },
  advanced:     { bg: '#FEF2F2', text: '#DC2626', border: '#FCA5A5' },
};
const typeLabels: Record<string, string> = {
  live_single:  'Live 1:1',
  video_course: 'Video Course',
};

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0" style={{ color: '#8B93A5' }}>{icon}</div>
      <div>
        <p className="text-xs uppercase tracking-wide font-semibold mb-0.5" style={{ color: '#8B93A5' }}>{label}</p>
        <div className="text-sm font-medium" style={{ color: '#0F1117' }}>{value}</div>
      </div>
    </div>
  );
}

// ── Star Rating Picker ─────────────────────────────────────────────────────────
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className="transition-transform hover:scale-110"
        >
          <Star
            size={24}
            style={{
              color: (hover || value) >= star ? '#F59E0B' : '#D1D5DB',
              fill:  (hover || value) >= star ? '#F59E0B' : 'none',
            }}
          />
        </button>
      ))}
    </div>
  );
}

export default function CourseDetailPage() {
  const router   = useRouter();
  const params   = useParams();
  const { user } = useAuth();
  const id = params.id as string;

  const [course,         setCourse]         = useState<CourseDetail | null>(null);
  const [loading,        setLoading]        = useState(true);

  // Cart state
  const [inCart,         setInCart]         = useState(false);
  const [cartItemId,     setCartItemId]     = useState<string | null>(null);
  const [cartLoading,    setCartLoading]    = useState(false);

  // Wishlist state
  const [inWishlist,     setInWishlist]     = useState(false);
  const [wishlistItemId, setWishlistItemId] = useState<string | null>(null);
  const [wishlistLoading,setWishlistLoading]= useState(false);

  // Purchase + review state
  const [hasPurchased,   setHasPurchased]   = useState(false);
  const [reviewRating,   setReviewRating]   = useState(0);
  const [reviewText,     setReviewText]     = useState('');
  const [reviewTopic,    setReviewTopic]    = useState('');
  const [reviewLoading,  setReviewLoading]  = useState(false);
  const [reviewDone,     setReviewDone]     = useState(false); // true = submitted now OR already reviewed
  const [reviewError,    setReviewError]    = useState('');
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  const canEdit   = hasRole(user, 'super_admin', 'operations', 'support_agent');
  const isStudent = user?.role === 'student';

  // ── Fetch course ──────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    api.get(`/courses/${id}`)
      .then((r) => setCourse(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  // ── Check cart / wishlist / purchase status ───────────────────────────────
  useEffect(() => {
    if (!user?._id) return;

    const requests: Promise<unknown>[] = [
      api.get('/cart',     { params: { courseId: id, studentId: user._id } }),
      api.get('/wishlist', { params: { courseId: id, studentId: user._id } }),
    ];

    // Check if current student has purchased this course.
    // Backend doesn't auto-scope by role so we pass studentId (= Student doc ID = user.linkedId).
    if (isStudent && user.linkedId) {
      requests.push(
        api.get('/subscriptions', {
          params: { courseId: id, studentId: user.linkedId, status: 'confirmed' },
        })
      );
    }

    Promise.all(requests).then(([cartRes, wishRes, subRes]) => {
      const cartData = (cartRes as { data: { data: { _id: string }[] } }).data;
      const wishData = (wishRes as { data: { data: { _id: string }[] } }).data;

      if (cartData.data.length > 0) {
        setInCart(true);
        setCartItemId(cartData.data[0]._id);
      }
      if (wishData.data.length > 0) {
        setInWishlist(true);
        setWishlistItemId(wishData.data[0]._id);
      }
      if (subRes) {
        const subData = (subRes as { data: { data: unknown[] } }).data;
        if (subData.data.length > 0) {
          setHasPurchased(true);
          // Check if student has already submitted a review for this course
          if (user?.linkedId) {
            api.get('/reviews/check-by-student', {
              params: { student: user.linkedId, courseIds: id },
            }).then((r) => {
              if ((r.data.data as string[]).includes(id)) {
                setAlreadyReviewed(true);
                setReviewDone(true);
              }
            }).catch(console.error);
          }
        }
      }
    }).catch(console.error);
  }, [id, user?._id, user?.linkedId, isStudent]);

  // ── Cart toggle ───────────────────────────────────────────────────────────
  const toggleCart = async () => {
    if (!course || !user?._id || cartLoading) return;
    setCartLoading(true);
    try {
      if (inCart && cartItemId) {
        await api.delete(`/cart/${cartItemId}`);
        setInCart(false);
        setCartItemId(null);
      } else {
        const tutorId = course.tutor?._id || course.assignedInstructor?._id;
        const { data } = await api.post('/cart', { courseId: course._id, tutorId, studentId: user._id });
        setInCart(true);
        setCartItemId(data.data._id);
      }
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { data?: { _id: string } } } };
      if (e?.response?.status === 409 && e?.response?.data?.data?._id) {
        setInCart(true);
        setCartItemId(e.response.data.data._id);
      }
    } finally {
      setCartLoading(false);
    }
  };

  // ── Wishlist toggle ───────────────────────────────────────────────────────
  const toggleWishlist = async () => {
    if (!course || !user?._id || wishlistLoading) return;
    setWishlistLoading(true);
    try {
      if (inWishlist && wishlistItemId) {
        await api.delete(`/wishlist/${wishlistItemId}`);
        setInWishlist(false);
        setWishlistItemId(null);
      } else {
        const tutorId = course.tutor?._id || course.assignedInstructor?._id;
        const { data } = await api.post('/wishlist', { courseId: course._id, tutorId, studentId: user._id });
        setInWishlist(true);
        setWishlistItemId(data.data._id);
      }
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { data?: { _id: string } } } };
      if (e?.response?.status === 409 && e?.response?.data?.data?._id) {
        setInWishlist(true);
        setWishlistItemId(e.response.data.data._id);
      }
    } finally {
      setWishlistLoading(false);
    }
  };

  // ── Buy Now ───────────────────────────────────────────────────────────────
  const handleBuyNow = async () => {
    if (!course || !user?._id) return;
    if (!inCart) {
      try {
        const tutorId = course.tutor?._id || course.assignedInstructor?._id;
        const { data } = await api.post('/cart', { courseId: course._id, tutorId, studentId: user._id });
        setInCart(true);
        setCartItemId(data.data._id);
      } catch { /* ignore if already in cart */ }
    }
    // Redirect to cart page where student can review and confirm purchase
    router.push('/cart');
  };

  // ── Submit Review ─────────────────────────────────────────────────────────
  const submitReview = async () => {
    if (!course || !user || reviewLoading) return;
    if (!reviewRating) { setReviewError('Please select a star rating.'); return; }
    if (!reviewText.trim()) { setReviewError('Please write a review.'); return; }

    const tutorId = course.tutor?._id || course.assignedInstructor?._id;
    if (!tutorId) { setReviewError('No tutor associated with this course.'); return; }

    setReviewLoading(true);
    setReviewError('');
    try {
      await api.post('/reviews', {
        tutor:      tutorId,
        courseId:   course._id,
        student:    user.linkedId || user._id,
        parentName: user.name,
        rating:     reviewRating,
        review:     reviewText.trim(),
        topic:      reviewTopic.trim() || undefined,
      });
      setReviewDone(true);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } } };
      // 409 = duplicate; treat as already done
      if (e?.response?.status === 409) {
        setAlreadyReviewed(true);
        setReviewDone(true);
      } else {
        setReviewError(e?.response?.data?.message || 'Failed to submit review.');
      }
    } finally {
      setReviewLoading(false);
    }
  };

  // ── Loading / not found ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <AlertCircle size={40} className="text-gray-300" />
        <p className="text-sm text-gray-400">Course not found</p>
        <button onClick={() => router.push('/courses')}
          className="text-sm font-medium px-4 py-2 rounded-lg"
          style={{ background: '#EEF2FF', color: '#1A3FD1' }}>
          Back to Courses
        </button>
      </div>
    );
  }

  const effectivePrice = course.discountedPrice ?? course.price;
  const discountPct = course.discountedPrice
    ? Math.round((1 - course.discountedPrice / course.price) * 100)
    : 0;
  const lc    = levelColors[course.level] || levelColors.beginner;
  const tutor = course.tutor || course.assignedInstructor;

  const fmt = (d?: string) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const fmtTime = (t?: string) => {
    if (!t) return '—';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-8 py-6 sticky top-0 z-40" style={{ background: 'linear-gradient(135deg, #0F1117 0%, #1A3FD1 100%)' }}>
        <button onClick={() => router.push('/courses')}
          className="flex items-center gap-2 mb-4 text-sm" style={{ color: '#93C5FD' }}>
          <ArrowLeft size={16} /> Back to Courses
        </button>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest mb-1 font-semibold" style={{ color: '#93C5FD' }}>
              {course.category} · {course.subject}
            </p>
            <h1 className="text-2xl font-bold text-white leading-snug max-w-2xl">{course.courseName}</h1>
          </div>
          {canEdit && (
            <button onClick={() => router.push(`/courses/${id}/edit`)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'rgba(255,255,255,0.2)' }}>
              <Edit size={15} /> Edit Course
            </button>
          )}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="p-8 flex gap-6 items-start">

        {/* ── LEFT: main content ──────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* Course image */}
          <div className="w-full rounded-2xl overflow-hidden border" style={{ height: '260px', borderColor: '#E4E7EF', background: '#EEF2FF' }}>
            {course.courseImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={course.courseImage} alt={course.courseName}
                className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                <BookOpen size={40} className="text-blue-200" />
                <span className="text-sm text-blue-300 font-medium">No image</span>
              </div>
            )}
          </div>

          {/* ── Video section (video_course only) ───────────────────────── */}
          {course.type === 'video_course' && (
            hasPurchased && course.videoUrl ? (
              /* Purchased + video exists → play */
              <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E4E7EF' }}>
                <div className="px-6 pt-5 pb-3 border-b flex items-center gap-2" style={{ borderColor: '#E4E7EF' }}>
                  <Video size={16} style={{ color: '#1A3FD1' }} />
                  <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: '#0F1117' }}>
                    Course Video
                  </h2>
                  <span className="ml-auto text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1"
                    style={{ background: '#ECFDF5', color: '#059669' }}>
                    <CheckCircle size={11} /> Unlocked
                  </span>
                </div>
                <div className="p-4">
                  <video
                    src={
                      course.videoUrl.startsWith('http')
                        ? course.videoUrl  // Cloudinary full URL
                        : `${(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '')}${course.videoUrl}` // legacy local path
                    }
                    controls
                    controlsList="nodownload"
                    className="w-full rounded-xl"
                    style={{ maxHeight: '480px', background: '#000' }}
                    playsInline
                  >
                    Your browser does not support video playback.
                  </video>
                </div>
              </div>
            ) : hasPurchased && !course.videoUrl ? (
              /* Purchased but no video yet */
              <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E4E7EF' }}>
                <div className="px-6 pt-5 pb-3 border-b flex items-center gap-2" style={{ borderColor: '#E4E7EF' }}>
                  <Video size={16} style={{ color: '#8B93A5' }} />
                  <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: '#0F1117' }}>Course Video</h2>
                </div>
                <div className="p-8 flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: '#F3F4F6' }}>
                    <Clock size={26} style={{ color: '#9CA3AF' }} />
                  </div>
                  <p className="text-sm font-semibold" style={{ color: '#0F1117' }}>Video coming soon</p>
                  <p className="text-xs text-center" style={{ color: '#8B93A5' }}>
                    The instructor hasn&#39;t uploaded the course video yet. Check back soon.
                  </p>
                </div>
              </div>
            ) : (
              /* Not purchased → locked */
              <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E4E7EF' }}>
                <div className="px-6 pt-5 pb-3 border-b flex items-center gap-2" style={{ borderColor: '#E4E7EF' }}>
                  <Lock size={16} style={{ color: '#8B93A5' }} />
                  <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: '#0F1117' }}>Course Video</h2>
                </div>
                <div className="p-8 flex flex-col items-center gap-3">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#EEF2FF,#F3F4F6)' }}
                  >
                    <Lock size={28} style={{ color: '#6B7280' }} />
                  </div>
                  <p className="text-sm font-semibold" style={{ color: '#0F1117' }}>Purchase to unlock</p>
                  <p className="text-xs text-center" style={{ color: '#8B93A5' }}>
                    Buy this course to get full access to the video and watch at your own pace, ad-free.
                  </p>
                </div>
              </div>
            )
          )}

          {/* Status badges */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs px-3 py-1 rounded-full font-semibold capitalize"
              style={{ background: lc.bg, color: lc.text, border: `1px solid ${lc.border}` }}>
              {course.level}
            </span>
            <span className="text-xs px-3 py-1 rounded-full font-semibold"
              style={{ background: '#EEF2FF', color: '#1A3FD1', border: '1px solid #C7D2FE' }}>
              {typeLabels[course.type] || course.type}
            </span>
            {course.isPublished ? (
              <span className="text-xs px-3 py-1 rounded-full font-semibold"
                style={{ background: '#F0FDF4', color: '#16A34A', border: '1px solid #86EFAC' }}>
                Published
              </span>
            ) : (
              <span className="text-xs px-3 py-1 rounded-full font-semibold"
                style={{ background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' }}>
                Draft
              </span>
            )}
            {!course.isActive && (
              <span className="text-xs px-3 py-1 rounded-full font-semibold"
                style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5' }}>
                Inactive
              </span>
            )}
            {hasPurchased && (
              <span className="text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1"
                style={{ background: '#ECFDF5', color: '#059669', border: '1px solid #6EE7B7' }}>
                <CheckCircle size={11} /> Purchased
              </span>
            )}
          </div>

          {/* Description */}
          {course.description && (
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#E4E7EF' }}>
              <h2 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: '#0F1117' }}>
                About This Course
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: '#4B5263' }}>{course.description}</p>
            </div>
          )}

          {/* Topics / Tags */}
          {(course.tags && course.tags.length > 0) && (
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#E4E7EF' }}>
              <h2 className="text-sm font-bold uppercase tracking-wide mb-3 flex items-center gap-2" style={{ color: '#0F1117' }}>
                <Tag size={14} /> Topics Covered
              </h2>
              <div className="flex flex-wrap gap-2">
                {course.tags.map((t) => (
                  <span key={t} className="text-xs px-3 py-1 rounded-full font-medium"
                    style={{ background: '#EEF2FF', color: '#1A3FD1' }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Target Grades */}
          {(course.grades && course.grades.length > 0) && (
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#E4E7EF' }}>
              <h2 className="text-sm font-bold uppercase tracking-wide mb-3 flex items-center gap-2" style={{ color: '#0F1117' }}>
                <Award size={14} /> Target Grades
              </h2>
              <div className="flex flex-wrap gap-2">
                {course.grades.map((g) => (
                  <span key={g} className="text-xs px-3 py-1 rounded-full font-semibold border"
                    style={{ background: '#F9FAFB', color: '#374151', borderColor: '#E5E7EB' }}>
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Schedule */}
          <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#E4E7EF' }}>
            <h2 className="text-sm font-bold uppercase tracking-wide mb-4 flex items-center gap-2" style={{ color: '#0F1117' }}>
              <Calendar size={14} /> Schedule
            </h2>
            <div className="grid grid-cols-2 gap-5">
              <InfoRow icon={<Calendar size={15} />} label="Start Date"     value={fmt(course.startDate)} />
              <InfoRow icon={<Calendar size={15} />} label="End Date"       value={fmt(course.endDate)} />
              <InfoRow icon={<Clock size={15} />}    label="Class Time"
                value={course.startTime
                  ? `${fmtTime(course.startTime)} – ${fmtTime(course.endTime)}`
                  : '—'} />
              <InfoRow icon={<Clock size={15} />}    label="Duration"
                value={course.durationMinutes ? `${course.durationMinutes} min / session` : '—'} />
              <InfoRow icon={<Globe size={15} />}    label="Timezone"       value={course.timezone || 'Asia/Kolkata'} />
              <InfoRow icon={<BookOpen size={15} />} label="Total Sessions" value={`${course.sessionCount} sessions`} />
            </div>
          </div>

          {/* Tutor */}
          {tutor && (
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#E4E7EF' }}>
              <h2 className="text-sm font-bold uppercase tracking-wide mb-4" style={{ color: '#0F1117' }}>
                Instructor
              </h2>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #1A3FD1, #6366F1)' }}>
                  {tutor.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: '#0F1117' }}>{tutor.name}</p>
                  {tutor.rating > 0 && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Star size={13} className="text-yellow-400 fill-yellow-400" />
                      <span className="text-xs font-medium" style={{ color: '#374151' }}>
                        {tutor.rating.toFixed(1)} rating
                      </span>
                    </div>
                  )}
                  {tutor.subjects && tutor.subjects.length > 0 && (
                    <p className="text-xs mt-0.5" style={{ color: '#8B93A5' }}>
                      {tutor.subjects.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: sticky price / action card ───────────────────────────── */}
        <div className="w-80 shrink-0">
          <div className="sticky top-6 bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E4E7EF' }}>

            {/* Price section */}
            <div className="p-6 border-b" style={{ borderColor: '#E4E7EF' }}>
              <div className="flex items-end gap-2 mb-1">
                <p className="text-3xl font-bold" style={{ color: '#0F1117' }}>
                  ₹{effectivePrice.toLocaleString('en-IN')}
                </p>
                {discountPct > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold mb-1"
                    style={{ background: '#DCFCE7', color: '#16A34A' }}>
                    {discountPct}% OFF
                  </span>
                )}
              </div>
              {course.discountedPrice && (
                <p className="text-sm line-through" style={{ color: '#8B93A5' }}>
                  ₹{course.price.toLocaleString('en-IN')}
                </p>
              )}
            </div>

            {/* ── Purchased state: review section ─────────────────────────── */}
            {hasPurchased ? (
              <div className="p-5 space-y-4">

                {/* Owned badge */}
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                  style={{ background: '#ECFDF5' }}>
                  <CheckCircle size={16} style={{ color: '#059669' }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#065F46' }}>You own this course</p>
                    <p className="text-xs" style={{ color: '#6EE7B7' }}>Enrolled and active</p>
                  </div>
                </div>

                {/* Review form */}
                <div className="border-t pt-4" style={{ borderColor: '#F3F4F6' }}>
                  <p className="text-xs font-bold uppercase tracking-wide mb-3 flex items-center gap-1.5"
                    style={{ color: '#0F1117' }}>
                    <MessageSquare size={13} /> Rate This Course
                  </p>

                  {reviewDone ? (
                    /* Already reviewed / just submitted */
                    <div className="flex flex-col items-center gap-2 py-4 rounded-xl"
                      style={{ background: '#F0FDF4' }}>
                      <CheckCircle size={28} style={{ color: '#22C55E' }} />
                      <p className="text-sm font-semibold" style={{ color: '#15803D' }}>
                        {alreadyReviewed ? 'Already Reviewed' : 'Review Submitted!'}
                      </p>
                      <p className="text-xs text-center" style={{ color: '#6B7280' }}>
                        {alreadyReviewed
                          ? 'You have already submitted a review for this course.'
                          : 'Thank you for your feedback.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Star picker */}
                      <div>
                        <p className="text-xs mb-1.5" style={{ color: '#6B7280' }}>Your rating</p>
                        <StarPicker value={reviewRating} onChange={setReviewRating} />
                      </div>

                      {/* Topic */}
                      <input
                        type="text"
                        value={reviewTopic}
                        onChange={(e) => setReviewTopic(e.target.value)}
                        placeholder="Topic (optional)"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-blue-400"
                        style={{ color: '#0F1117' }}
                      />

                      {/* Review text */}
                      <textarea
                        value={reviewText}
                        onChange={(e) => setReviewText(e.target.value)}
                        placeholder="Share your experience with this course…"
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs resize-none focus:outline-none focus:border-blue-400"
                        style={{ color: '#0F1117' }}
                      />

                      {/* Error */}
                      {reviewError && (
                        <p className="text-xs" style={{ color: '#EF4444' }}>{reviewError}</p>
                      )}

                      {/* Submit */}
                      <button
                        onClick={submitReview}
                        disabled={reviewLoading}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                        style={{ background: 'linear-gradient(135deg, #1A3FD1 0%, #4F46E5 100%)' }}>
                        {reviewLoading ? (
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <><Send size={13} /> Submit Review</>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ── Not purchased: buy actions ─────────────────────────────── */
              <div className="p-5 space-y-3">

                {/* Add to Cart */}
                <button
                  onClick={toggleCart}
                  disabled={cartLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all border-2"
                  style={inCart
                    ? { background: '#F0FDF4', color: '#16A34A', borderColor: '#86EFAC' }
                    : { background: '#fff',    color: '#1A3FD1', borderColor: '#1A3FD1' }}>
                  {cartLoading ? (
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : inCart ? (
                    <><Check size={15} /> Added to Cart</>
                  ) : (
                    <><ShoppingCart size={15} /> Add to Cart</>
                  )}
                </button>

                {/* Buy Now */}
                <button
                  onClick={handleBuyNow}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-opacity text-white"
                  style={{ background: 'linear-gradient(135deg, #1A3FD1 0%, #4F46E5 100%)' }}>
                  <Zap size={15} /> Buy Now
                </button>

                {/* Wishlist */}
                <button
                  onClick={toggleWishlist}
                  disabled={wishlistLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all border"
                  style={inWishlist
                    ? { background: '#FEF2F2', color: '#EF4444', borderColor: '#FCA5A5' }
                    : { background: '#F9FAFB', color: '#6B7280', borderColor: '#E5E7EB' }}>
                  {wishlistLoading ? (
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Heart size={14} style={{ fill: inWishlist ? '#EF4444' : 'none', color: inWishlist ? '#EF4444' : '#9CA3AF' }} />
                      {inWishlist ? 'Saved to Wishlist' : 'Add to Wishlist'}
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Course stats */}
            <div className="px-5 pb-5 space-y-3 border-t pt-4" style={{ borderColor: '#F3F4F6' }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#8B93A5' }}>
                Course Details
              </p>
              {[
                { icon: <BookOpen size={13} />,  label: 'Sessions',   value: `${course.sessionCount}` },
                { icon: <Users size={13} />,      label: 'Enrolled',   value: `${course.enrolledCount} students` },
                { icon: <Users size={13} />,      label: 'Slots Left', value: `${course.availableSlots ?? course.maxSlots ?? 50} / ${course.maxSlots ?? 50}` },
                { icon: <Clock size={13} />,      label: 'Duration',   value: course.durationMinutes ? `${course.durationMinutes} min / session` : '—' },
                { icon: <Award size={13} />,      label: 'Level',      value: <span className="capitalize">{course.level}</span> },
                { icon: <Globe size={13} />,      label: 'Type',       value: typeLabels[course.type] || course.type },
              ].map(({ icon, label, value }) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5" style={{ color: '#8B93A5' }}>
                    {icon} {label}
                  </div>
                  <div className="font-medium" style={{ color: '#374151' }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Date created */}
            <div className="px-5 pb-4">
              <p className="text-xs" style={{ color: '#C3C8D4' }}>
                Created {fmt(course.createdAt)}
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
