'use client';
import { useEffect, useState } from 'react';
import { Star, BookOpen, Users, X, GraduationCap, CheckCircle, Video, Radio, CalendarDays, Users2, Clock, ShoppingCart, Heart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface Instructor {
  _id: string;
  name: string;
  profileImage?: string | null;
  rating: number;
  subjects: string[];
  courseCount: number;
  studentsEnrolled: number;
}

interface Course {
  _id: string;
  courseName: string;
  courseImage?: string;
  level?: string;
  subject?: string;
  category?: string;
  type?: string;
  endDate?: string;
  startDateTime?: string;
  endDateTime?: string;
  startTime?: string;
  endTime?: string;
  availableSlots?: number;
  maxSlots?: number;
  tutor?: { _id: string } | string;
}

const RANK_COLORS = ['#F59E0B', '#9CA3AF', '#CD7C2F']; // gold, silver, bronze

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

function isExpired(endDate?: string) {
  if (!endDate) return false;
  return new Date(endDate) < new Date();
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(t?: string) {
  if (!t) return null;
  // t is "HH:mm" — convert to 12-hour
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function typeLabel(type?: string) {
  if (!type) return null;
  if (type.includes('live'))  return { label: 'Live',  icon: Radio,  bg: '#FEF2F2', color: '#DC2626' };
  if (type.includes('video')) return { label: 'Video', icon: Video,  bg: '#EEF2FF', color: '#1A3FD1' };
  return { label: type, icon: BookOpen, bg: '#F8F9FC', color: '#4B5263' };
}

export default function TopInstructors() {
  const router = useRouter();
  const { user } = useAuth();
  // For students linkedId = Student doc ID; for admins fall back to their own user _id
  const studentId = (user?.linkedId || user?._id) as string | undefined;

  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading]         = useState(true);

  // Modal
  const [selected, setSelected]             = useState<Instructor | null>(null);
  const [courses, setCourses]               = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);

  // Per-course action state: { [courseId]: 'cart' | 'wishlist' | null }
  const [cartAdded,     setCartAdded]     = useState<Record<string, boolean>>({});
  const [wishlistAdded, setWishlistAdded] = useState<Record<string, boolean>>({});
  const [actionBusy,    setActionBusy]    = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.get('/tutors/top-instructors', { params: { limit: 5 } })
      .then((r) => setInstructors(r.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function openModal(inst: Instructor) {
    setSelected(inst);
    setCourses([]);
    setCoursesLoading(true);
    api.get('/courses', { params: { tutor: inst._id, available: 'false', limit: 50 } })
      .then((r) => setCourses(r.data.data || []))
      .catch(console.error)
      .finally(() => setCoursesLoading(false));
  }

  function closeModal() {
    setSelected(null);
    setCourses([]);
  }

  async function handleAddToCart(e: React.MouseEvent, course: Course) {
    e.stopPropagation();
    if (!studentId || actionBusy[course._id] || cartAdded[course._id]) return;
    const tutorId = typeof course.tutor === 'object' ? course.tutor?._id : course.tutor;
    setActionBusy((p) => ({ ...p, [course._id]: true }));
    try {
      await api.post('/cart', { courseId: course._id, tutorId, studentId });
      setCartAdded((p) => ({ ...p, [course._id]: true }));
    } catch {
      // already in cart or error — still mark as added
      setCartAdded((p) => ({ ...p, [course._id]: true }));
    } finally {
      setActionBusy((p) => ({ ...p, [course._id]: false }));
    }
  }

  async function handleAddToWishlist(e: React.MouseEvent, course: Course) {
    e.stopPropagation();
    if (!studentId || actionBusy[course._id + '_w'] || wishlistAdded[course._id]) return;
    const tutorId = typeof course.tutor === 'object' ? course.tutor?._id : course.tutor;
    setActionBusy((p) => ({ ...p, [course._id + '_w']: true }));
    try {
      await api.post('/wishlist', { courseId: course._id, tutorId, studentId });
      setWishlistAdded((p) => ({ ...p, [course._id]: true }));
    } catch {
      setWishlistAdded((p) => ({ ...p, [course._id]: true }));
    } finally {
      setActionBusy((p) => ({ ...p, [course._id + '_w']: false }));
    }
  }

  return (
    <>
      {/* ── List card ── */}
      <div className="bg-white rounded-lg border" style={{ borderColor: '#E4E7EF' }}>
        {/* Header */}
        <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between border-b" style={{ borderColor: '#F3F4F6' }}>
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8B93A5' }}>Top Instructors</h2>
          <div className="flex items-center gap-3 text-xs" style={{ color: '#8B93A5' }}>
            <span className="flex items-center gap-1"><BookOpen size={10} /> Courses</span>
            <span className="flex items-center gap-1"><Users size={10} /> Students</span>
            <span className="flex items-center gap-1"><Star size={10} /> Rating</span>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-5 h-5 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : instructors.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: '#8B93A5' }}>No active instructors yet</p>
          ) : (
            <div className="divide-y" style={{ borderColor: '#F3F4F6' }}>
              {instructors.map((inst, idx) => {
                const rankColor = RANK_COLORS[idx] ?? '#E4E7EF';
                return (
                  <button
                    key={inst._id}
                    onClick={() => openModal(inst)}
                    className="flex items-center gap-2.5 py-2 w-full text-left hover:bg-gray-50 rounded-lg px-1 transition-colors"
                  >
                    {/* Rank badge */}
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: rankColor + '22', color: rankColor }}
                    >
                      {idx + 1}
                    </div>

                    {/* Avatar */}
                    {inst.profileImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={inst.profileImage}
                        alt={inst.name}
                        className="w-7 h-7 rounded-full object-cover shrink-0"
                        style={{ border: '2px solid #E4E7EF' }}
                      />
                    ) : (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ background: '#1A3FD1' }}
                      >
                        {getInitials(inst.name)}
                      </div>
                    )}

                    {/* Name + subjects */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: '#0F1117' }}>{inst.name}</p>
                      {inst.subjects.length > 0 && (
                        <p className="text-xs truncate" style={{ color: '#8B93A5' }}>
                          {inst.subjects.slice(0, 2).join(' · ')}
                          {inst.subjects.length > 2 && ` +${inst.subjects.length - 2}`}
                        </p>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-center min-w-[28px]">
                        <p className="text-xs font-bold" style={{ color: '#0F1117' }}>{inst.courseCount}</p>
                        <p className="text-xs" style={{ color: '#8B93A5' }}>courses</p>
                      </div>
                      <div className="text-center min-w-[36px]">
                        <p className="text-xs font-bold" style={{ color: '#0F1117' }}>{inst.studentsEnrolled}</p>
                        <p className="text-xs" style={{ color: '#8B93A5' }}>students</p>
                      </div>
                      <div className="flex items-center gap-1 min-w-[32px]">
                        <Star size={11} fill="#F59E0B" style={{ color: '#F59E0B' }} />
                        <span className="text-xs font-bold" style={{ color: '#0F1117' }}>
                          {inst.rating > 0 ? inst.rating.toFixed(1) : '—'}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Modal ── */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl w-full flex flex-col overflow-hidden"
            style={{ maxWidth: '680px', maxHeight: '88vh', boxShadow: '0 24px 80px rgba(0,0,0,0.22)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header — instructor info */}
            <div className="px-7 pt-6 pb-5 border-b shrink-0" style={{ borderColor: '#E4E7EF' }}>
              <div className="flex items-start justify-between gap-4">
                {/* Avatar + name */}
                <div className="flex items-center gap-4">
                  {selected.profileImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selected.profileImage}
                      alt={selected.name}
                      className="w-16 h-16 rounded-full object-cover shrink-0"
                      style={{ border: '3px solid #E4E7EF' }}
                    />
                  ) : (
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0"
                      style={{ background: '#1A3FD1' }}
                    >
                      {getInitials(selected.name)}
                    </div>
                  )}
                  <div>
                    <p className="text-base font-bold" style={{ color: '#0F1117' }}>{selected.name}</p>
                    {selected.subjects.length > 0 && (
                      <p className="text-sm mt-0.5" style={{ color: '#8B93A5' }}>
                        {selected.subjects.join(' · ')}
                      </p>
                    )}
                    {/* Stats row */}
                    <div className="flex items-center gap-4 mt-2">
                      <span className="flex items-center gap-1.5 text-sm" style={{ color: '#4B5263' }}>
                        <BookOpen size={13} />{selected.courseCount} courses
                      </span>
                      <span className="flex items-center gap-1.5 text-sm" style={{ color: '#4B5263' }}>
                        <Users size={13} />{selected.studentsEnrolled} students
                      </span>
                      <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: '#F59E0B' }}>
                        <Star size={13} fill="#F59E0B" />
                        {selected.rating > 0 ? selected.rating.toFixed(1) : '—'}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Close */}
                <button
                  onClick={closeModal}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
                >
                  <X size={18} style={{ color: '#8B93A5' }} />
                </button>
              </div>
            </div>

            {/* Course list */}
            <div className="flex-1 overflow-y-auto px-7 py-5">
              <p className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: '#8B93A5' }}>Courses</p>

              {coursesLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : courses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <GraduationCap size={28} style={{ color: '#E4E7EF' }} />
                  <p className="text-xs" style={{ color: '#8B93A5' }}>No courses found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {courses.map((course) => {
                    const completed = isExpired(course.endDate);
                    const type      = typeLabel(course.type);
                    const TypeIcon  = type?.icon ?? BookOpen;
                    const slots     = course.maxSlots ?? 0;
                    const available = course.availableSlots ?? 0;
                    const slotPct   = slots > 0 ? Math.round(((slots - available) / slots) * 100) : 0;
                    const inCart    = cartAdded[course._id];
                    const inWish    = wishlistAdded[course._id];

                    return (
                      <div
                        key={course._id}
                        onClick={() => { closeModal(); router.push(`/courses/${course._id}`); }}
                        className="flex gap-4 w-full text-left rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer"
                        style={{ borderColor: '#E4E7EF' }}
                      >
                        {/* Thumbnail */}
                        {course.courseImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={course.courseImage}
                            alt={course.courseName}
                            className="w-16 h-16 rounded-xl object-cover shrink-0"
                          />
                        ) : (
                          <div
                            className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: '#EEF2FF' }}
                          >
                            <BookOpen size={24} style={{ color: '#1A3FD1' }} />
                          </div>
                        )}

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          {/* Row 1 — name + badges + action icons */}
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold truncate" style={{ color: '#0F1117' }}>
                              {course.courseName}
                            </p>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Type badge */}
                              {type && (
                                <span
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                                  style={{ background: type.bg, color: type.color }}
                                >
                                  <TypeIcon size={10} />
                                  {type.label}
                                </span>
                              )}
                              {/* Cart icon */}
                              <button
                                onClick={(e) => handleAddToCart(e, course)}
                                disabled={actionBusy[course._id]}
                                className="p-1 rounded-lg hover:bg-blue-50 transition-colors"
                                title={inCart ? 'Added to cart' : 'Add to cart'}
                              >
                                <ShoppingCart
                                  size={14}
                                  style={{ color: inCart ? '#1A3FD1' : '#4B5263' }}
                                  fill={inCart ? '#1A3FD1' : 'none'}
                                />
                              </button>
                              {/* Wishlist icon */}
                              <button
                                onClick={(e) => handleAddToWishlist(e, course)}
                                disabled={actionBusy[course._id + '_w']}
                                className="p-1 rounded-lg hover:bg-red-50 transition-colors"
                                title={inWish ? 'Added to wishlist' : 'Add to wishlist'}
                              >
                                <Heart
                                  size={14}
                                  style={{ color: inWish ? '#EF4444' : '#4B5263' }}
                                  fill={inWish ? '#EF4444' : 'none'}
                                />
                              </button>
                              {/* Completed badge */}
                              {completed && (
                                <span
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                                  style={{ background: '#F0FDF4', color: '#16A34A' }}
                                >
                                  <CheckCircle size={10} />
                                  Completed
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Row 2 — subject · level */}
                          <p className="text-xs mt-0.5" style={{ color: '#8B93A5' }}>
                            {[course.subject, course.level].filter(Boolean).join(' · ')}
                          </p>

                          {/* Row 3 — date range + time + slots */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                            <span className="flex items-center gap-1 text-xs" style={{ color: '#4B5263' }}>
                              <CalendarDays size={11} />
                              {fmtDate(course.startDateTime)} → {fmtDate(course.endDateTime)}
                            </span>
                            {(course.startTime || course.endTime) && (
                              <span className="flex items-center gap-1 text-xs" style={{ color: '#4B5263' }}>
                                <Clock size={11} />
                                {fmtTime(course.startTime)}{course.endTime ? ` – ${fmtTime(course.endTime)}` : ''}
                              </span>
                            )}
                            {slots > 0 && (
                              <span className="flex items-center gap-1 text-xs" style={{ color: '#4B5263' }}>
                                <Users2 size={11} />
                                {slots - available}/{slots} slots filled
                              </span>
                            )}
                          </div>

                          {/* Slot fill bar */}
                          {slots > 0 && (
                            <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: '#E4E7EF' }}>
                              <div
                                className="h-1 rounded-full"
                                style={{
                                  width: `${slotPct}%`,
                                  background: slotPct >= 90 ? '#EF4444' : slotPct >= 60 ? '#F59E0B' : '#22C55E',
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
