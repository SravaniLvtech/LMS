'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, BookOpen, Search, ShoppingCart, Heart, Check } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { hasRole } from '@/lib/auth';

interface Course {
  _id: string;
  courseName: string;
  courseImage?: string;
  category: string;
  subject: string;
  level: string;
  type: string;
  price: number;
  discountedPrice?: number;
  isActive: boolean;
  isPublished: boolean;
  startDate: string;
  endDate: string;
  sessionCount: number;
  enrolledCount: number;
  availableSlots: number;
  tutor?: { _id: string; name: string; rating: number };
}

const levelColors: Record<string, { bg: string; text: string }> = {
  beginner:     { bg: '#F0FDF4', text: '#16A34A' },
  intermediate: { bg: '#FFFBEB', text: '#D97706' },
  advanced:     { bg: '#FEF2F2', text: '#DC2626' },
};
const typeLabels: Record<string, string> = {
  live_single:  'Live 1:1',
  video_course: 'Video',
};

export default function CoursesPage() {
  const { user } = useAuth();
  const router   = useRouter();

  const [courses, setCourses]       = useState<Course[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Cart: courseId → cartItemId  (persisted in API)
  const [cart,     setCart]     = useState<Map<string, string>>(new Map());
  const [wishlist, setWishlist] = useState<Map<string, string>>(new Map());
  const [cartActionId,     setCartActionId]     = useState<string | null>(null);
  const [wishlistActionId, setWishlistActionId] = useState<string | null>(null);

  const canCreate = hasRole(user, 'super_admin', 'operations', 'support_agent');
  const isAdmin   = canCreate || hasRole(user, 'finance', 'support_agent');

  // ── Fetch courses ──────────────────────────────────────────────────────────
  const fetchCourses = useCallback(() => {
    setLoading(true);
    api.get('/courses', {
      params: {
        search:    search      || undefined,
        type:      typeFilter  || undefined,
        limit:     50,
        // non-admins only see courses that still have slots and haven't expired
        available: isAdmin ? undefined : 'true',
      },
    })
      .then((r) => { setCourses(r.data.data); setTotal(r.data.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, typeFilter, isAdmin]);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  // ── Fetch cart & wishlist for current user ─────────────────────────────────
  useEffect(() => {
    if (!user?._id) return;
    Promise.all([
      api.get('/cart',     { params: { studentId: user._id } }),
      api.get('/wishlist', { params: { studentId: user._id } }),
    ]).then(([cartRes, wishRes]) => {
      const cartMap = new Map<string, string>();
      cartRes.data.data.forEach((item: { courseId: { _id: string } | string; _id: string }) => {
        const cid = typeof item.courseId === 'object' ? item.courseId._id : item.courseId;
        cartMap.set(cid, item._id);
      });
      const wishMap = new Map<string, string>();
      wishRes.data.data.forEach((item: { courseId: { _id: string } | string; _id: string }) => {
        const cid = typeof item.courseId === 'object' ? item.courseId._id : item.courseId;
        wishMap.set(cid, item._id);
      });
      setCart(cartMap);
      setWishlist(wishMap);
    }).catch(console.error);
  }, [user?._id]);

  // ── Toggle cart ────────────────────────────────────────────────────────────
  const toggleCart = async (e: React.MouseEvent, course: Course) => {
    e.stopPropagation();
    if (!user?._id || cartActionId === course._id) return;
    setCartActionId(course._id);
    try {
      const itemId = cart.get(course._id);
      if (itemId) {
        await api.delete(`/cart/${itemId}`);
        setCart((prev) => { const n = new Map(prev); n.delete(course._id); return n; });
      } else {
        const { data } = await api.post('/cart', {
          courseId:  course._id,
          tutorId:   course.tutor?._id,
          studentId: user._id,
        });
        setCart((prev) => new Map(prev).set(course._id, data.data._id));
      }
    } catch (err: unknown) {
      const e2 = err as { response?: { status?: number; data?: { data?: { _id: string } } } };
      if (e2?.response?.status === 409 && e2?.response?.data?.data?._id) {
        setCart((prev) => new Map(prev).set(course._id, e2.response!.data!.data!._id));
      }
    } finally {
      setCartActionId(null);
    }
  };

  // ── Toggle wishlist ────────────────────────────────────────────────────────
  const toggleWishlist = async (e: React.MouseEvent, course: Course) => {
    e.stopPropagation();
    if (!user?._id || wishlistActionId === course._id) return;
    setWishlistActionId(course._id);
    try {
      const itemId = wishlist.get(course._id);
      if (itemId) {
        await api.delete(`/wishlist/${itemId}`);
        setWishlist((prev) => { const n = new Map(prev); n.delete(course._id); return n; });
      } else {
        const { data } = await api.post('/wishlist', {
          courseId:  course._id,
          tutorId:   course.tutor?._id,
          studentId: user._id,
        });
        setWishlist((prev) => new Map(prev).set(course._id, data.data._id));
      }
    } catch (err: unknown) {
      const e2 = err as { response?: { status?: number; data?: { data?: { _id: string } } } };
      if (e2?.response?.status === 409 && e2?.response?.data?.data?._id) {
        setWishlist((prev) => new Map(prev).set(course._id, e2.response!.data!.data!._id));
      }
    } finally {
      setWishlistActionId(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="px-8 py-6 sticky top-0 z-40" style={{ background: 'linear-gradient(135deg, #0F1117 0%, #1A3FD1 100%)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Courses</h1>
            <p className="text-sm mt-0.5" style={{ color: '#93C5FD' }}>
              {total} courses total
              {cart.size > 0 && (
                <button
                  onClick={() => router.push('/cart')}
                  className="ml-3 px-2 py-0.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
                  style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                  🛒 {cart.size} in cart
                </button>
              )}
            </p>
          </div>
          {canCreate && (
            <button onClick={() => router.push('/courses/new')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'rgba(255,255,255,0.2)' }}>
              <Plus size={16} /> Create Course
            </button>
          )}
        </div>
      </div>

      <div className="p-8 space-y-5">
        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search courses…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
          </div>
          {['', 'live_single', 'video_course'].map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={typeFilter === t
                ? { background: '#1A3FD1', color: '#fff' }
                : { background: '#EEF2FF', color: '#1A3FD1' }}>
              {t === '' ? 'All Types' : typeLabels[t]}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <p className="text-sm text-center py-12" style={{ color: '#8B93A5' }}>Loading…</p>
        ) : courses.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-400">No courses found</p>
            {canCreate && (
              <button onClick={() => router.push('/courses/new')}
                className="mt-4 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: '#1A3FD1' }}>
                Create your first course
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {courses.map((c) => {
              const lc             = levelColors[c.level] || levelColors.beginner;
              const effectivePrice = c.discountedPrice ?? c.price;
              const inCart         = cart.has(c._id);
              const inWishlist     = wishlist.has(c._id);
              const cartBusy       = cartActionId === c._id;
              const wishBusy       = wishlistActionId === c._id;

              return (
                <div key={c._id}
                  onClick={() => router.push(`/courses/${c._id}`)}
                  className="bg-white rounded-xl border cursor-pointer hover:shadow-md transition-shadow overflow-hidden flex"
                  style={{ borderColor: '#E4E7EF' }}>

                  {/* ── Left: course image ── */}
                  <div className="shrink-0 w-36 relative" style={{ background: '#EEF2FF' }}>
                    {c.courseImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.courseImage} alt={c.courseName}
                        className="w-full h-full object-cover" style={{ minHeight: '100%' }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ minHeight: '140px' }}>
                        <span className="text-4xl">📚</span>
                      </div>
                    )}
                    {/* Type badge */}
                    <span className="absolute top-2 left-2 text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'rgba(26,63,209,0.9)', color: '#fff' }}>
                      {typeLabels[c.type]}
                    </span>
                    {/* Wishlist button overlaid on image */}
                    <button
                      onClick={(e) => toggleWishlist(e, c)}
                      disabled={wishBusy}
                      className="absolute bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center shadow transition-all"
                      style={{
                        background: inWishlist ? '#FEE2E2' : 'rgba(255,255,255,0.9)',
                        border: `1.5px solid ${inWishlist ? '#FCA5A5' : '#E5E7EB'}`,
                      }}
                      title={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}>
                      {wishBusy
                        ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" style={{ color: inWishlist ? '#EF4444' : '#9CA3AF' }} />
                        : <Heart size={14} style={{ color: inWishlist ? '#EF4444' : '#9CA3AF', fill: inWishlist ? '#EF4444' : 'none' }} />
                      }
                    </button>
                  </div>

                  {/* ── Right: course data ── */}
                  <div className="flex-1 min-w-0 p-4 flex flex-col justify-between">
                    <div>
                      {/* Status badges */}
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                          style={{ background: lc.bg, color: lc.text }}>
                          {c.level}
                        </span>
                        {!c.isPublished && (
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: '#F3F4F6', color: '#6B7280' }}>Draft</span>
                        )}
                        {!c.isActive && (
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: '#FEF2F2', color: '#DC2626' }}>Inactive</span>
                        )}
                      </div>

                      {/* Name + price */}
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold leading-snug" style={{ color: '#0F1117' }}>
                          {c.courseName}
                        </h3>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold" style={{ color: '#0F1117' }}>
                            ₹{effectivePrice.toLocaleString('en-IN')}
                          </p>
                          {c.discountedPrice && (
                            <p className="text-xs line-through" style={{ color: '#8B93A5' }}>
                              ₹{c.price.toLocaleString('en-IN')}
                            </p>
                          )}
                        </div>
                      </div>

                      <p className="text-xs mt-0.5 capitalize" style={{ color: '#8B93A5' }}>
                        {c.category} · {c.subject}
                      </p>
                      {c.tutor && (
                        <p className="text-xs mt-1" style={{ color: '#4B5263' }}>
                          Tutor: <span className="font-medium">{c.tutor.name}</span>
                          {c.tutor.rating > 0 && (
                            <span className="ml-1 text-yellow-500">★ {c.tutor.rating.toFixed(1)}</span>
                          )}
                        </p>
                      )}
                    </div>

                    {/* ── Footer: stats + actions ── */}
                    <div className="mt-3 pt-2 border-t space-y-2" style={{ borderColor: '#E4E7EF' }}>
                      {/* Stats */}
                      <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: '#8B93A5' }}>
                        <span>{c.sessionCount} sessions</span>
                        <span>·</span>
                        <span>{c.enrolledCount} enrolled</span>
                        <span>·</span>
                        <span>
                          {c.startDate
                            ? new Date(c.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                        </span>
                        {!isAdmin && c.availableSlots != null && (
                          <>
                            <span>·</span>
                            <span style={{ color: c.availableSlots <= 3 ? '#DC2626' : '#16A34A', fontWeight: 600 }}>
                              {c.availableSlots} slot{c.availableSlots !== 1 ? 's' : ''} left
                            </span>
                          </>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        {/* Add to Cart */}
                        <button
                          onClick={(e) => toggleCart(e, c)}
                          disabled={cartBusy}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                          style={inCart
                            ? { background: '#F0FDF4', color: '#16A34A', border: '1.5px solid #86EFAC' }
                            : { background: '#1A3FD1', color: '#fff',    border: '1.5px solid #1A3FD1' }}>
                          {cartBusy
                            ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            : inCart
                              ? <><Check size={12} /> Added to Cart</>
                              : <><ShoppingCart size={12} /> Add to Cart</>
                          }
                        </button>

                        {/* Wishlist (text version) */}
                        <button
                          onClick={(e) => toggleWishlist(e, c)}
                          disabled={wishBusy}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                          style={inWishlist
                            ? { background: '#FEF2F2', color: '#EF4444', border: '1.5px solid #FCA5A5' }
                            : { background: '#F9FAFB', color: '#6B7280', border: '1.5px solid #E5E7EB' }}>
                          {wishBusy
                            ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                            : <Heart size={12} style={{ fill: inWishlist ? '#EF4444' : 'none', color: inWishlist ? '#EF4444' : '#9CA3AF' }} />
                          }
                          {inWishlist ? 'Saved' : 'Wishlist'}
                        </button>
                      </div>
                    </div>
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
