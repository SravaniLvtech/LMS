'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, Users, User,
  GraduationCap, Video, Lock, Calendar, BookOpen, Search, Clock, CheckCircle, ExternalLink,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { hasRole } from '@/lib/auth';

// ── Types ──────────────────────────────────────────────────────────────────────
interface SessionItem {
  _id: string;
  courseName: string;
  courseImage?: string;
  courseId: string | { _id: string };
  startDateTime: string;
  endDateTime: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  tutorId?: { _id: string; name: string } | null;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  availableSlots: number;
  maxSlots: number;
  groupMemberList: Array<{ _id: string; name: string } | string>;
  sessionNumber: number;
  totalSessions: number;
  meetingLink?: string;
}
interface TutorOption   { _id: string; name: string }
interface StudentOption { _id: string; name: string; email?: string }

// ── Constants ──────────────────────────────────────────────────────────────────
const ADMIN_ROLES = ['super_admin', 'operations', 'finance', 'support_agent'] as const;

const SS = {
  scheduled: { bg: '#EEF2FF', text: '#1A3FD1', dot: '#6366F1', border: '#C7D2FE' },
  ongoing:   { bg: '#ECFDF5', text: '#16A34A', dot: '#22C55E', border: '#86EFAC' },
  completed: { bg: '#F3F4F6', text: '#6B7280', dot: '#9CA3AF', border: '#E5E7EB' },
  cancelled: { bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444', border: '#FCA5A5' },
} as const;

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Helpers ────────────────────────────────────────────────────────────────────
// Use LOCAL date parts — toISOString() returns UTC and causes off-by-one in IST/any UTC+ zone
const getDayKey = (d: Date) => {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

function fmtTime(t?: string) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

type Mode = 'all' | 'tutor' | 'student';

// ── Join-state helper ──────────────────────────────────────────────────────────
// canJoin  → button is blue/green and clickable
// ended    → session is over (status completed OR endDateTime passed)
// label    → text on the button
function getJoinInfo(
  startDateTimeStr: string,
  endDateTimeStr: string,
  status: string,
  now: Date,
): { canJoin: boolean; ended: boolean; label: string; isOngoing: boolean } {

  const NOOP = (ended: boolean) => ({ canJoin: false, ended, label: '', isOngoing: false });

  // Explicitly completed or cancelled → done
  if (status === 'completed' || status === 'cancelled') return NOOP(true);

  // endDateTime has passed → treat as completed even if DB status not yet updated
  if (new Date(endDateTimeStr) <= now) return { canJoin: false, ended: true, label: 'Session ended', isOngoing: false };

  // Live right now
  if (status === 'ongoing') return { canJoin: true, ended: false, label: 'Join Now', isOngoing: true };

  // Scheduled — check the 30-min activation window
  if (status === 'scheduled') {
    const diffMins = Math.floor((new Date(startDateTimeStr).getTime() - now.getTime()) / 60_000);

    if (diffMins <= 30) return { canJoin: true, ended: false, label: 'Join Now', isOngoing: false };

    // Countdown until window opens
    const h = Math.floor(diffMins / 60);
    const m = diffMins % 60;
    const label = diffMins < 60 ? `Opens in ${diffMins}m` : m > 0 ? `Opens in ${h}h ${m}m` : `Opens in ${h}h`;
    return { canJoin: false, ended: false, label, isOngoing: false };
  }

  return NOOP(false);
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function SchedulePage() {
  const router   = useRouter();
  const { user } = useAuth();

  const isAdmin   = hasRole(user, ...ADMIN_ROLES);
  const isTutor   = user?.role === 'tutor';
  const isStudent = user?.role === 'student';

  // Helper: open the meeting for a session
  // meet.jit.si now requires a logged-in Jitsi account to act as moderator inside
  // an iframe, so we open the room in a new browser tab instead — this lets the
  // browser use the user's Jitsi session cookie and the first person to arrive
  // becomes the moderator without any extra login prompt.
  const openMeeting = (s: SessionItem) => {
    const url = s.meetingLink || `https://meet.jit.si/mathpath-session-${s._id}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Live clock — re-evaluates join eligibility every 30 s
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Calendar & selected date
  const [selectedDate,  setSelectedDate]  = useState<Date>(() => new Date());
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  });

  // Admin mode
  const [mode,            setMode]            = useState<Mode>('all');
  const [selectedTutor,   setSelectedTutor]   = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [searchQuery,     setSearchQuery]     = useState('');

  // Data
  const [monthSessions, setMonthSessions] = useState<SessionItem[]>([]);
  const [tutors,        setTutors]        = useState<TutorOption[]>([]);
  const [students,      setStudents]      = useState<StudentOption[]>([]);
  const [loading,       setLoading]       = useState(false);

  // Auto-lock non-admins to their own data
  useEffect(() => {
    if (isTutor   && user?.linkedId) { setMode('tutor');   setSelectedTutor(user.linkedId);   }
    if (isStudent && user?.linkedId) { setMode('student'); setSelectedStudent(user.linkedId); }
  }, [isTutor, isStudent, user?.linkedId]);

  // Fetch tutor / student lists (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    api.get('/tutors',   { params: { status: 'active', limit: 200 } }).then(r => setTutors(r.data.data   || [])).catch(console.error);
    api.get('/students', { params: { limit: 200 } })                  .then(r => setStudents(r.data.data || [])).catch(console.error);
  }, [isAdmin]);

  // Fetch all sessions in the displayed calendar month
  const fetchMonthSessions = useCallback(() => {
    const y = calendarMonth.getFullYear(), mo = calendarMonth.getMonth();
    const from = new Date(y, mo, 1).toISOString();
    const to   = new Date(y, mo + 1, 0, 23, 59, 59).toISOString();

    if (isAdmin) {
      if (mode === 'tutor'   && !selectedTutor)   { setMonthSessions([]); return; }
      if (mode === 'student' && !selectedStudent)  { setMonthSessions([]); return; }
    }

    const params: Record<string, string | number> = { from, to, limit: 500 };
    if (isAdmin && mode === 'tutor'   && selectedTutor)   params.tutorId   = selectedTutor;
    if (isAdmin && mode === 'student' && selectedStudent) params.studentId = selectedStudent;

    setLoading(true);
    api.get('/sessions', { params })
      .then(r => setMonthSessions(r.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [calendarMonth, mode, selectedTutor, selectedStudent, isAdmin]);

  useEffect(() => { fetchMonthSessions(); }, [fetchMonthSessions]);

  // Keep calendar month in sync when selectedDate moves outside it
  useEffect(() => {
    const sm = selectedDate.getMonth(), sy = selectedDate.getFullYear();
    const cm = calendarMonth.getMonth(), cy = calendarMonth.getFullYear();
    if (sm !== cm || sy !== cy) setCalendarMonth(new Date(sy, sm, 1));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const sessionDays = useMemo(() => {
    const s = new Set<string>();
    monthSessions.forEach(sess => s.add(getDayKey(new Date(sess.startDateTime))));
    return s;
  }, [monthSessions]);

  const daySessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return monthSessions
      .filter(s => getDayKey(new Date(s.startDateTime)) === getDayKey(selectedDate))
      .filter(s => {
        if (!q) return true;
        const course = (s.courseName || '').toLowerCase();
        const tutor  = (typeof s.tutorId === 'object' && s.tutorId ? s.tutorId.name : '').toLowerCase();
        return course.includes(q) || tutor.includes(q);
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [monthSessions, selectedDate, searchQuery]);

  const todayKey       = getDayKey(new Date());
  const selectedKey    = getDayKey(selectedDate);
  const isToday        = selectedKey === todayKey;
  const todayCount     = useMemo(() =>
    monthSessions.filter(s => getDayKey(new Date(s.startDateTime)) === todayKey).length,
    [monthSessions, todayKey]
  );

  // ── Mini calendar grid ────────────────────────────────────────────────────
  const calendarCells = useMemo(() => {
    const y = calendarMonth.getFullYear(), mo = calendarMonth.getMonth();
    const first  = new Date(y, mo, 1);
    const total  = new Date(y, mo + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;          // Mon-based
    const cells: (number | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarMonth]);

  const prevMonth = () => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const pickDay = (day: number) =>
    setSelectedDate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));

  const getCourseId = (s: SessionItem) =>
    typeof s.courseId === 'object' ? s.courseId._id : s.courseId;
  const getTutor    = (s: SessionItem) =>
    typeof s.tutorId === 'object' && s.tutorId ? s.tutorId.name : null;

  const needsSelection = isAdmin &&
    ((mode === 'tutor' && !selectedTutor) || (mode === 'student' && !selectedStudent));

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#F8F9FC' }}>

      {/* ── Gradient header ────────────────────────────────────────────────── */}
      <div className="px-8 py-6 shrink-0 sticky top-0 z-40"
        style={{ background: 'linear-gradient(135deg, #0F1117 0%, #1A3FD1 100%)' }}>
        <h1 className="text-2xl font-bold text-white">Schedule</h1>
        <p className="text-sm mt-0.5" style={{ color: '#93C5FD' }}>
          {!isAdmin && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold inline-flex items-center gap-1"
              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
              <Lock size={10} />
              {isTutor ? 'Your sessions only' : 'Your enrolled sessions'}
            </span>
          )}
        </p>
      </div>

      {/* ── Admin filter bar ──────────────────────────────────────────────── */}
      {isAdmin && (
        <div className="px-6 py-3 border-b flex items-center gap-3 flex-wrap shrink-0"
          style={{ background: '#fff', borderColor: '#E4E7EF' }}>

          {/* Left: tabs + dropdown + spinner */}
          <div className="flex items-center gap-3 flex-wrap flex-1">
            <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#F3F4F6' }}>
              {([
                { id: 'all',     label: 'All Sessions', icon: Calendar      },
                { id: 'tutor',   label: 'By Tutor',     icon: User          },
                { id: 'student', label: 'By Student',   icon: GraduationCap },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setMode(id)}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all"
                  style={mode === id
                    ? { background: '#fff', color: '#1A3FD1', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                    : { color: '#6B7280' }}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
            {mode === 'tutor' && (
              <select value={selectedTutor} onChange={e => setSelectedTutor(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 min-w-52"
                style={{ color: selectedTutor ? '#0F1117' : '#9CA3AF' }}>
                <option value="">— Select Tutor —</option>
                {tutors.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            )}
            {mode === 'student' && (
              <select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 min-w-52"
                style={{ color: selectedStudent ? '#0F1117' : '#9CA3AF' }}>
                <option value="">— Select Student —</option>
                {students.map(s => (
                  <option key={s._id} value={s._id}>{s.name}{s.email ? ` (${s.email})` : ''}</option>
                ))}
              </select>
            )}
            {loading && (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs" style={{ color: '#8B93A5' }}>Loading…</span>
              </div>
            )}
          </div>

          {/* Right: search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: '#9CA3AF' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search course or tutor…"
              className="pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 w-56"
              style={{ color: '#0F1117' }}
            />
          </div>
        </div>
      )}

      {/* ── Two-column body ───────────────────────────────────────────────── */}
      <div className="flex gap-6 p-6 flex-1 items-start">

        {/* ════════════ LEFT: Monthly calendar — sticky, fills viewport ════════════ */}
        <div className="shrink-0 sticky top-6" style={{ width: 'clamp(340px, 30vw, 460px)' }}>
          <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E4E7EF' }}>

            {/* Month navigator */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <button onClick={prevMonth}
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors hover:bg-gray-100">
                <ChevronLeft size={18} style={{ color: '#6B7280' }} />
              </button>
              <p className="text-lg font-bold" style={{ color: '#0F1117' }}>
                {MONTH_NAMES[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
              </p>
              <button onClick={nextMonth}
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors hover:bg-gray-100">
                <ChevronRight size={18} style={{ color: '#6B7280' }} />
              </button>
            </div>

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 px-4 mb-2">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, i) => (
                <div key={i} className="h-10 flex items-center justify-center">
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#C3C8D4' }}>{d}</span>
                </div>
              ))}
            </div>

            {/* Date grid — cells expand to fill available width */}
            <div className="grid grid-cols-7 px-4 pb-5 gap-y-2">
              {calendarCells.map((day, i) => {
                if (!day) return <div key={i} className="h-12" />;

                const key        = getDayKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
                const isTodayDay = key === todayKey;
                const isSelDay   = key === selectedKey;
                const hasSess    = sessionDays.has(key);

                return (
                  <button key={i} onClick={() => pickDay(day)}
                    className="relative h-12 w-12 mx-auto flex flex-col items-center justify-center rounded-full text-sm font-semibold transition-all hover:scale-110 active:scale-95"
                    style={
                      isSelDay
                        ? { background: '#1A3FD1', color: '#fff', boxShadow: '0 4px 12px rgba(26,63,209,0.35)' }
                        : isTodayDay
                          ? { background: '#EEF2FF', color: '#1A3FD1' }
                          : { color: '#374151' }
                    }>
                    {day}
                    {/* Session dot */}
                    {hasSess && !isSelDay && (
                      <span className="absolute bottom-1.5 w-1.5 h-1.5 rounded-full"
                        style={{ background: isTodayDay ? '#1A3FD1' : '#6366F1' }} />
                    )}
                    {hasSess && isSelDay && (
                      <span className="absolute bottom-1.5 w-1.5 h-1.5 rounded-full"
                        style={{ background: 'rgba(255,255,255,0.8)' }} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex items-center justify-between"
              style={{ borderColor: '#F3F4F6', background: '#FAFBFF' }}>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#6366F1' }} />
                <span className="text-sm" style={{ color: '#8B93A5' }}>Has sessions</span>
              </div>
              <span className="text-sm font-semibold" style={{ color: '#1A3FD1' }}>
                {sessionDays.size} day{sessionDays.size !== 1 ? 's' : ''} this month
              </span>
            </div>
          </div>
        </div>

        {/* ════════════ RIGHT: Selected day's sessions ════════════ */}
        <div className="flex-1 min-w-0">

          {/* Day header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {/* Day box */}
              <div className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0"
                style={isToday ? { background: '#1A3FD1' } : { background: '#fff', border: '1.5px solid #E4E7EF' }}>
                <p className="text-xs font-bold uppercase leading-none"
                  style={{ color: isToday ? '#93C5FD' : '#8B93A5' }}>
                  {SHORT_MONTHS[selectedDate.getMonth()]}
                </p>
                <p className="text-2xl font-bold leading-none mt-0.5"
                  style={{ color: isToday ? '#fff' : '#0F1117' }}>
                  {selectedDate.getDate()}
                </p>
              </div>
              <div>
                <p className="text-base font-bold" style={{ color: '#0F1117' }}>
                  {isToday ? 'Today' : selectedDate.toLocaleDateString('en-IN', { weekday: 'long' })}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#8B93A5' }}>
                  {selectedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                  {' · '}
                  {loading ? '…' : `${daySessions.length} session${daySessions.length !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
            {loading && (
              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {/* Admin: needs to pick */}
          {needsSelection ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed gap-3"
              style={{ borderColor: '#E4E7EF' }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#EEF2FF' }}>
                {mode === 'tutor' ? <User size={22} style={{ color: '#1A3FD1' }} /> : <GraduationCap size={22} style={{ color: '#1A3FD1' }} />}
              </div>
              <p className="text-sm font-semibold" style={{ color: '#0F1117' }}>
                Select a {mode === 'tutor' ? 'tutor' : 'student'} above to view sessions
              </p>
            </div>
          ) : daySessions.length === 0 && !loading ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed gap-3"
              style={{ borderColor: '#E4E7EF' }}>
              <Calendar size={36} className="text-gray-200" />
              <p className="text-sm font-semibold" style={{ color: '#8B93A5' }}>No sessions on this day</p>
              <p className="text-xs" style={{ color: '#C3C8D4' }}>Pick another date from the calendar</p>
            </div>
          ) : (
            /* Session cards */
            <div className="space-y-3">
              {daySessions.map(s => {
                const style    = SS[s.status] || SS.scheduled;
                const tutor    = getTutor(s);
                const enrolled = s.maxSlots - s.availableSlots;
                const join     = getJoinInfo(s.startDateTime, s.endDateTime, s.status, now);
                // Show join section for scheduled/ongoing sessions OR ones that just ended (ended=true)
                const showJoin = s.status === 'scheduled' || s.status === 'ongoing' || join.ended;

                return (
                  <div key={s._id}
                    className="bg-white rounded-2xl border flex overflow-hidden hover:shadow-md transition-shadow"
                    style={{ borderColor: '#E4E7EF' }}>

                    {/* Left colour stripe */}
                    <div className="w-1.5 shrink-0" style={{ background: style.dot }} />

                    {/* Card body */}
                    <div className="flex flex-1 items-center gap-5 p-5">

                      {/* Course image or placeholder */}
                      <div className="w-14 h-14 rounded-xl shrink-0 overflow-hidden flex items-center justify-center"
                        style={{ background: '#EEF2FF' }}>
                        {s.courseImage
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={s.courseImage} alt="" className="w-full h-full object-cover" />
                          : <BookOpen size={20} style={{ color: '#A5B4FC' }} />
                        }
                      </div>

                      {/* Time block */}
                      <div className="shrink-0 w-20 text-center">
                        <p className="text-sm font-bold" style={{ color: '#0F1117' }}>{fmtTime(s.startTime)}</p>
                        <div className="h-px my-1.5 mx-auto w-4" style={{ background: '#E4E7EF' }} />
                        <p className="text-xs" style={{ color: '#8B93A5' }}>{fmtTime(s.endTime)}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#C3C8D4' }}>{s.durationMinutes} min</p>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold capitalize"
                            style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}` }}>
                            {s.status}
                          </span>
                          <span className="text-xs" style={{ color: '#C3C8D4' }}>
                            Session {s.sessionNumber}/{s.totalSessions}
                          </span>
                        </div>
                        <p className="text-sm font-bold leading-snug" style={{ color: '#0F1117' }}>
                          {s.courseName}
                        </p>
                        {tutor && (
                          <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#8B93A5' }}>
                            <User size={11} /> {tutor}
                          </p>
                        )}
                        <div className="flex items-center gap-1 mt-1">
                          <Users size={11} style={{ color: '#8B93A5' }} />
                          <span className="text-xs" style={{ color: '#8B93A5' }}>
                            {enrolled} / {s.maxSlots} enrolled
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="shrink-0 flex flex-col items-end gap-2.5">
                        {/* Join Now / countdown / ended */}
                        {showJoin ? (
                          join.ended ? (
                            /* Session ended (DB status OR endDateTime passed) */
                            <span className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl font-semibold"
                              style={{ background: '#F3F4F6', color: '#6B7280' }}>
                              <CheckCircle size={13} style={{ color: '#9CA3AF' }} />
                              {s.status === 'completed' ? 'Completed' : 'Session ended'}
                            </span>
                          ) : (
                            <div className="flex flex-col items-end gap-1">
                              <button
                                disabled={!join.canJoin}
                                onClick={async () => {
                                  if (!join.canJoin) return;
                                  // Record attendance (fire-and-forget; don't block join on failure)
                                  try { await api.post('/attendance/join', { sessionId: s._id }); } catch {}
                                  openMeeting(s);
                                }}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
                                style={
                                  join.canJoin
                                    ? {
                                        background: join.isOngoing
                                          ? 'linear-gradient(135deg,#16A34A,#15803D)'
                                          : 'linear-gradient(135deg,#1A3FD1,#4F46E5)',
                                        boxShadow: join.isOngoing
                                          ? '0 4px 12px rgba(22,163,74,0.35)'
                                          : '0 4px 12px rgba(26,63,209,0.35)',
                                        color: '#fff',
                                        cursor: 'pointer',
                                      }
                                    : {
                                        background: '#F3F4F6',
                                        color: '#9CA3AF',
                                        cursor: 'not-allowed',
                                      }
                                }
                              >
                                {join.canJoin ? <ExternalLink size={14} /> : <Clock size={14} />}
                                {join.label}
                              </button>
                              {!join.canJoin && (
                                <p className="text-xs" style={{ color: '#C3C8D4' }}>
                                  Active 30 min before start
                                </p>
                              )}
                            </div>
                          )
                        ) : s.status === 'completed' ? (
                          <span className="text-xs px-3 py-2 rounded-xl font-semibold"
                            style={{ background: '#F3F4F6', color: '#6B7280' }}>
                            Completed
                          </span>
                        ) : (
                          <span className="text-xs px-3 py-2 rounded-xl font-semibold"
                            style={{ background: '#FEF2F2', color: '#DC2626' }}>
                            Cancelled
                          </span>
                        )}

                        {/* View course link */}
                        <button
                          onClick={() => router.push(`/courses/${getCourseId(s)}`)}
                          className="text-xs font-medium transition-colors hover:underline"
                          style={{ color: '#8B93A5' }}>
                          View course →
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
