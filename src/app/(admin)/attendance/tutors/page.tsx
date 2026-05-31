'use client';
import { useEffect, useState, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { hasRole } from '@/lib/auth';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ADMIN_ROLES = ['super_admin', 'operations', 'finance', 'support_agent'] as const;

// ── Types ─────────────────────────────────────────────────────────────────────
interface TutorSessionItem {
  _id: string;
  courseId: string;
  courseName: string;
  courseImage?: string;
  sessionNumber: number;
  startDateTime: string;
  endDateTime: string;
  status: string;
  tutorId: { _id: string; name: string } | string | null;
}

interface TutorAttendanceRecord {
  _id: string;
  sessionId: { _id: string } | string;
  tutorId: { _id: string } | string | null;
  studentId: { _id: string } | string | null; // must be null for tutor records
  joinedAt: string;
  role: string;
}

interface TutorCourseGroup {
  courseId: string;
  courseName: string;
  courseImage?: string;
  sessions: TutorSessionItem[];
}

interface TutorRow {
  tutor: { _id: string; name: string };
  calendar: Record<string, string>;
  onTime: number;
  late: number;
  noShow: number;
  total: number;
  completionRate: string;
  belowThreshold: boolean;
}

interface AdminAttendanceData {
  tutors: TutorRow[];
  stats: { avgCompletion: number; onTimeRate: number; noShowCount: number };
  year: number;
  month: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getTutorSessionStatus(s: TutorSessionItem): 'upcoming' | 'ongoing' | 'completed' {
  if (s.status === 'completed' || s.status === 'cancelled') return 'completed';
  const now = new Date();
  if (new Date(s.endDateTime)   < now) return 'completed';
  if (new Date(s.startDateTime) <= now) return 'ongoing';
  return 'upcoming';
}

function getTutorId(v: { _id: string } | string | null | undefined): string {
  if (!v) return '';
  if (typeof v === 'object') return String(v._id);
  return String(v);
}

// ── Calendar (green = tutor joined that session) ──────────────────────────────
function TutorCalendar({ attendedDays, year, month }: { attendedDays: Set<string>; year: number; month: number }) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayKey = today.getFullYear() === year && today.getMonth() + 1 === month
    ? `${year}-${pad(month)}-${pad(today.getDate())}`
    : '';

  return (
    <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E4E7EF' }}>
      <h2 className="text-sm font-semibold mb-3" style={{ color: '#0F1117' }}>
        {MONTH_NAMES[month - 1]} {year} — Attendance Calendar
      </h2>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const key = `${year}-${pad(month)}-${pad(day)}`;
          const isToday  = key === todayKey;
          const attended = attendedDays.has(key);
          let bg = '#F3F4F6', color = '#9CA3AF';
          if (isToday)   { bg = '#1A3FD1'; color = '#fff'; }
          else if (attended) { bg = '#22C55E'; color = '#fff'; }
          return (
            <div key={day}
              className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-medium"
              style={{ background: bg, color }}
              title={attended ? 'Joined session' : isToday ? 'Today' : ''}>
              {day}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 text-xs" style={{ color: '#4B5263' }}>
        {[
          { color: '#22C55E', label: 'Joined' },
          { color: '#1A3FD1', label: 'Today' },
          { color: '#F3F4F6', label: 'No session', border: true },
        ].map(({ color: c, label, border }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded"
              style={{ background: c, border: border ? '1px solid #E4E7EF' : undefined }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Own attendance view (tutor role) ──────────────────────────────────────────
function MyTutorAttendance({ year, month }: { year: number; month: number }) {
  const [sessions,   setSessions]   = useState<TutorSessionItem[]>([]);
  const [attendance, setAttendance] = useState<TutorAttendanceRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded,   setExpanded]   = useState(true);
  const [search,     setSearch]     = useState('');
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/sessions', { params: { limit: 200 } }),
      api.get('/attendance'),   // auto-scoped to tutorId; returns records with studentId: null
    ])
      .then(([sessRes, attRes]) => {
        setSessions(sessRes.data.data ?? []);
        // Only keep tutor-role records (studentId is null)
        const records: TutorAttendanceRecord[] = (attRes.data.data ?? []).filter(
          (r: TutorAttendanceRecord) => !r.studentId
        );
        setAttendance(records);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [year, month]);

  const attendedDays = useMemo(() => {
    const days = new Set<string>();
    const pad  = (n: number) => String(n).padStart(2, '0');
    attendance.forEach((r) => {
      if (!r.joinedAt) return;
      const d = new Date(r.joinedAt);
      days.add(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    });
    return days;
  }, [attendance]);

  const courseGroups = useMemo((): TutorCourseGroup[] => {
    const map = new Map<string, TutorCourseGroup>();
    sessions.forEach((s) => {
      const cid = s.courseId;
      if (!cid) return;
      if (!map.has(cid)) {
        map.set(cid, { courseId: cid, courseName: s.courseName, courseImage: s.courseImage, sessions: [] });
      }
      map.get(cid)!.sessions.push(s);
    });
    return Array.from(map.values());
  }, [sessions]);

  // Auto-select first course when courses load
  useEffect(() => {
    if (courseGroups.length > 0 && !selectedId) {
      setSelectedId(courseGroups[0].courseId);
    }
  }, [courseGroups]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tutor attendance check — studentId MUST be null (guaranteed by filter above)
  const didJoin = (session: TutorSessionItem): boolean =>
    attendance.some((r) => {
      const recSessionId = getTutorId(r.sessionId as any);
      return recSessionId === session._id && !r.studentId;
    });

  const getCourseStats = (g: TutorCourseGroup) => {
    const total     = g.sessions.length;
    const completed = g.sessions.filter((s) => getTutorSessionStatus(s) !== 'upcoming');
    const joined    = completed.filter((s) => didJoin(s)).length;
    const rate = completed.length > 0 ? Math.round((joined / completed.length) * 100) : 0;
    return { total, joined, completedCount: completed.length, rate };
  };

  const filteredGroups = useMemo(() =>
    courseGroups.filter((g) =>
      !search || g.courseName.toLowerCase().includes(search.toLowerCase())
    ),
  [courseGroups, search]);

  const overallStats = useMemo(() => {
    let completedTotal = 0, joinedTotal = 0;
    courseGroups.forEach((g) => {
      const completed = g.sessions.filter((s) => getTutorSessionStatus(s) !== 'upcoming');
      completedTotal += completed.length;
      joinedTotal    += completed.filter((s) => didJoin(s)).length;
    });
    const rate = completedTotal > 0 ? parseFloat(((joinedTotal / completedTotal) * 100).toFixed(2)) : 0;
    return { joinedTotal, completedTotal, rate, totalCourses: courseGroups.length };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseGroups, attendance]);

  const selectedGroup = courseGroups.find((g) => g.courseId === selectedId) ?? null;
  const selectedStats = selectedGroup ? getCourseStats(selectedGroup) : null;

  if (loading) return <div className="p-8 text-sm" style={{ color: '#8B93A5' }}>Loading…</div>;

  return (
    <div>
      {/* Header */}
      <div className="px-8 py-6 sticky top-0 z-40" style={{ background: 'linear-gradient(135deg, #0F1117 0%, #1A3FD1 100%)' }}>
        <h1 className="text-2xl font-bold text-white">My Attendance</h1>
        <div className="flex gap-8 mt-2">
          {[
            { label: 'Courses Teaching',  val: overallStats.totalCourses.toString() },
            { label: 'Sessions Joined',   val: overallStats.joinedTotal.toString() },
            { label: 'Attendance Rate',   val: `${overallStats.rate}%` },
          ].map(({ label, val }) => (
            <div key={label}>
              <p className="text-xs" style={{ color: '#93C5FD' }}>{label}</p>
              <p className="text-base font-semibold text-white">{val}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Calendar */}
        <TutorCalendar attendedDays={attendedDays} year={year} month={month} />

        {/* Two-panel layout */}
        <div className="flex gap-4" style={{ minHeight: 520 }}>

          {/* Left: Course list */}
          <div className="w-96 shrink-0 bg-white rounded-xl border flex flex-col overflow-hidden"
            style={{ borderColor: '#E4E7EF' }}>
            <div className="px-4 py-2.5 border-b text-xs font-semibold"
              style={{ borderColor: '#E4E7EF', color: '#4B5263', background: '#F9FAFB' }}>
              {filteredGroups.length} Courses&nbsp;&nbsp;|&nbsp;&nbsp;{overallStats.rate}% Attendance
            </div>
            <div className="px-3 py-2.5 border-b" style={{ borderColor: '#E4E7EF' }}>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: '#F3F4F6' }}>
                <Search size={14} style={{ color: '#8B93A5' }} />
                <input
                  className="flex-1 text-xs bg-transparent outline-none"
                  placeholder="Search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredGroups.length === 0 ? (
                <p className="text-xs text-center py-12" style={{ color: '#8B93A5' }}>No courses found</p>
              ) : filteredGroups.map((g) => {
                const stats    = getCourseStats(g);
                const selected = selectedId === g.courseId;
                return (
                  <button key={g.courseId}
                    onClick={() => { setSelectedId(g.courseId); setExpanded(true); }}
                    className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors border-b"
                    style={{
                      borderColor: '#E4E7EF',
                      background:  selected ? '#EEF2FF' : undefined,
                      borderLeft:  selected ? '3px solid #1A3FD1' : '3px solid transparent',
                    }}>
                    <div className="w-10 h-10 rounded-lg shrink-0 overflow-hidden flex items-center justify-center"
                      style={{ background: '#E4E7EF' }}>
                      {g.courseImage
                        ? <img src={g.courseImage} alt="" className="w-full h-full object-cover" />
                        : <span className="text-sm font-bold" style={{ color: '#8B93A5' }}>{g.courseName[0]}</span>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold leading-snug line-clamp-2 mb-0.5" style={{ color: '#0F1117' }}>
                        {g.courseName}
                      </p>
                      <p className="text-xs" style={{ color: '#8B93A5' }}>
                        Sessions {stats.joined}/{stats.total}&nbsp;&nbsp;|&nbsp;&nbsp;{stats.rate}% Attendance
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Session details */}
          <div className="flex-1 min-w-0">
            {!selectedGroup ? (
              <div className="bg-white rounded-xl border h-full flex items-center justify-center"
                style={{ borderColor: '#E4E7EF' }}>
                <p className="text-sm" style={{ color: '#8B93A5' }}>Select a course to view attendance</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E4E7EF' }}>
                <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: '#E4E7EF' }}>
                  <div className="w-10 h-10 rounded-lg shrink-0 overflow-hidden flex items-center justify-center"
                    style={{ background: '#E4E7EF' }}>
                    {selectedGroup.courseImage
                      ? <img src={selectedGroup.courseImage} alt="" className="w-full h-full object-cover" />
                      : <span className="text-sm font-bold" style={{ color: '#8B93A5' }}>{selectedGroup.courseName[0]}</span>
                    }
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#0F1117' }}>{selectedGroup.courseName}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#8B93A5' }}>
                      Sessions {selectedStats!.joined}/{selectedStats!.total}&nbsp;&nbsp;|&nbsp;&nbsp;{selectedStats!.rate}% Attendance
                    </p>
                  </div>
                </div>

                <div>
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors border-b"
                    style={{ borderColor: '#E4E7EF' }}>
                    <span className="text-sm font-semibold" style={{ color: '#0F1117' }}>{selectedGroup.courseName}</span>
                    {expanded ? <ChevronUp size={16} style={{ color: '#4B5263' }} /> : <ChevronDown size={16} style={{ color: '#4B5263' }} />}
                  </button>

                  {expanded && (() => {
                    const sorted = [...selectedGroup.sessions].sort(
                      (a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
                    );
                    const allUpcoming = sorted.every((s) => getTutorSessionStatus(s) === 'upcoming');

                    if (allUpcoming) {
                      return (
                        <div className="px-5 py-8 flex flex-col items-center gap-2">
                          <span className="text-xs px-3 py-1 rounded-full font-semibold"
                            style={{ background: '#EEF2FF', color: '#1A3FD1' }}>All Upcoming</span>
                          <p className="text-sm" style={{ color: '#8B93A5' }}>Sessions haven't started yet.</p>
                        </div>
                      );
                    }

                    return (
                      <div className="px-5 pb-5 pt-2">
                        <div className="grid grid-cols-3 border-b py-2.5" style={{ borderColor: '#E4E7EF' }}>
                          {['Sessions', 'Schedule', 'Your Attendance'].map((h) => (
                            <span key={h} className="text-xs font-semibold" style={{ color: '#4B5263' }}>{h}</span>
                          ))}
                        </div>
                        {sorted.map((s, i) => {
                          const status  = getTutorSessionStatus(s);
                          const joined  = status !== 'upcoming' && didJoin(s);
                          const start   = new Date(s.startDateTime);
                          const end     = new Date(s.endDateTime);
                          const months  = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
                          const dateStr = `${String(start.getDate()).padStart(2,'0')} ${months[start.getMonth()]} ${start.getFullYear()}`;
                          const fmt = (d: Date) =>
                            d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
                          return (
                            <div key={s._id}
                              className="grid grid-cols-3 py-3 text-xs items-center"
                              style={{ borderBottom: i < sorted.length - 1 ? '1px solid #F3F4F6' : undefined }}>
                              <span className="font-medium" style={{ color: '#0F1117' }}>Session {s.sessionNumber || i + 1}</span>
                              <span style={{ color: '#4B5263' }}>{dateStr}, {fmt(start)} - {fmt(end)}</span>
                              {status === 'upcoming' ? (
                                <span className="inline-block w-fit px-2 py-0.5 rounded-full font-semibold"
                                  style={{ background: '#EEF2FF', color: '#1A3FD1' }}>Upcoming</span>
                              ) : joined ? (
                                <span className="font-semibold" style={{ color: '#16A34A' }}>Joined</span>
                              ) : (
                                <span className="font-semibold" style={{ color: '#EF4444' }}>Not Joined</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Admin helpers (dot grid + legend) ────────────────────────────────────────
const dotColors: Record<string, { bg: string; text: string; label: string }> = {
  present: { bg: '#22C55E', text: '#fff', label: 'P' },
  late:    { bg: '#F59E0B', text: '#fff', label: 'L' },
  no_show: { bg: '#EF4444', text: '#fff', label: 'A' },
  future:  { bg: '#E4E7EF', text: '#9CA3AF', label: 'F' },
};

function DotGrid({ calendar, daysInMonth }: { calendar: Record<string, string>; daysInMonth: number }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: daysInMonth }, (_, i) => {
        const day = (i + 1).toString();
        const status = calendar[day] || 'future';
        const s = dotColors[status] || dotColors.future;
        return (
          <div key={day}
            className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold"
            style={{ background: s.bg, color: s.text }}
            title={`Day ${day}: ${status}`}>
            {s.label}
          </div>
        );
      })}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs" style={{ color: '#4B5263' }}>
      {Object.entries(dotColors).map(([key, s]) => (
        <span key={key} className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold"
            style={{ background: s.bg, color: s.text }}>{s.label}</span>
          {key === 'present' ? 'On Time' : key === 'late' ? 'Late' : key === 'no_show' ? 'No-show' : 'Future'}
        </span>
      ))}
    </div>
  );
}

// ── Admin view: tutor list → course list → session details ───────────────────
interface TutorListItem {
  _id: string;
  name: string;
  rating?: number;
  status?: string;
}

function AdminTutorAttendance({ year, month }: { year: number; month: number }) {
  const [tutors,          setTutors]          = useState<TutorListItem[]>([]);
  const [selectedTutor,   setSelectedTutor]   = useState<TutorListItem | null>(null);
  const [courseGroups,    setCourseGroups]     = useState<TutorCourseGroup[]>([]);
  const [attRecords,      setAttRecords]       = useState<TutorAttendanceRecord[]>([]);
  const [selectedCourseId,setSelectedCourseId]= useState<string | null>(null);
  const [expanded,        setExpanded]         = useState(true);
  const [searchTutor,     setSearchTutor]      = useState('');
  const [searchCourse,    setSearchCourse]     = useState('');
  const [loadingList,     setLoadingList]      = useState(true);
  const [loadingDetails,  setLoadingDetails]   = useState(false);

  // Load all tutors on mount
  useEffect(() => {
    api.get('/tutors', { params: { limit: 200 } })
      .then((r) => setTutors(r.data.data ?? []))
      .catch(console.error)
      .finally(() => setLoadingList(false));
  }, []);

  // When a tutor is clicked: fetch their sessions + attendance records
  const handleSelectTutor = async (tutor: TutorListItem) => {
    setSelectedTutor(tutor);
    setSelectedCourseId(null);
    setExpanded(true);
    setLoadingDetails(true);
    try {
      const [sessRes, attRes] = await Promise.all([
        api.get('/sessions',    { params: { tutorId: tutor._id, limit: 200 } }),
        api.get('/attendance',  { params: { tutorId: tutor._id } }),
      ]);
      const sessData: TutorSessionItem[] = sessRes.data.data ?? [];
      // Group sessions by courseId
      const map = new Map<string, TutorCourseGroup>();
      sessData.forEach((s) => {
        if (!map.has(s.courseId)) {
          map.set(s.courseId, { courseId: s.courseId, courseName: s.courseName, courseImage: s.courseImage, sessions: [] });
        }
        map.get(s.courseId)!.sessions.push(s);
      });
      setCourseGroups(Array.from(map.values()));
      // Tutor attendance records: studentId must be null
      setAttRecords((attRes.data.data ?? []).filter((r: TutorAttendanceRecord) => !r.studentId));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Auto-select first tutor once list loads
  useEffect(() => {
    if (tutors.length > 0 && !selectedTutor) {
      handleSelectTutor(tutors[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutors]);

  // Auto-select first course whenever course list changes
  useEffect(() => {
    if (courseGroups.length > 0) {
      setSelectedCourseId(courseGroups[0].courseId);
    }
  }, [courseGroups]);

  // Check if tutor joined a session — studentId MUST be null
  const didJoin = (session: TutorSessionItem): boolean =>
    attRecords.some((r) => getTutorId(r.sessionId as any) === session._id && !r.studentId);

  const getCourseStats = (g: TutorCourseGroup) => {
    const total     = g.sessions.length;
    const completed = g.sessions.filter((s) => getTutorSessionStatus(s) !== 'upcoming');
    const joined    = completed.filter((s) => didJoin(s)).length;
    const rate = completed.length > 0 ? Math.round((joined / completed.length) * 100) : 0;
    return { total, joined, rate };
  };

  const overallRate = useMemo(() => {
    let c = 0, j = 0;
    courseGroups.forEach((g) => {
      const completed = g.sessions.filter((s) => getTutorSessionStatus(s) !== 'upcoming');
      c += completed.length;
      j += completed.filter((s) => didJoin(s)).length;
    });
    return c > 0 ? Math.round((j / c) * 100) : 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseGroups, attRecords]);

  const filteredTutors  = tutors.filter((t) => !searchTutor  || t.name.toLowerCase().includes(searchTutor.toLowerCase()));
  const filteredCourses = courseGroups.filter((g) => !searchCourse || g.courseName.toLowerCase().includes(searchCourse.toLowerCase()));
  const selectedGroup   = courseGroups.find((g) => g.courseId === selectedCourseId) ?? null;
  const selStats        = selectedGroup ? getCourseStats(selectedGroup) : null;

  return (
    <div>
      {/* Header */}
      <div className="px-8 py-6 sticky top-0 z-40" style={{ background: 'linear-gradient(135deg, #0F1117 0%, #1A3FD1 100%)' }}>
        <h1 className="text-2xl font-bold text-white">Tutor Attendance</h1>
        {selectedTutor && (
          <p className="text-sm mt-1" style={{ color: '#93C5FD' }}>
            Viewing: {selectedTutor.name}&nbsp;&nbsp;|&nbsp;&nbsp;{overallRate}% Attendance
          </p>
        )}
      </div>

      <div className="p-6">
        <div className="flex gap-4" style={{ minHeight: 620 }}>

          {/* ── Col 1: Tutor list ───────────────────────────────────────────── */}
          <div className="w-56 shrink-0 bg-white rounded-xl border flex flex-col overflow-hidden"
            style={{ borderColor: '#E4E7EF' }}>
            <div className="px-4 py-2.5 border-b text-xs font-semibold"
              style={{ borderColor: '#E4E7EF', color: '#4B5263', background: '#F9FAFB' }}>
              {filteredTutors.length} Tutors
            </div>
            <div className="px-3 py-2 border-b" style={{ borderColor: '#E4E7EF' }}>
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: '#F3F4F6' }}>
                <Search size={13} style={{ color: '#8B93A5' }} />
                <input className="flex-1 text-xs bg-transparent outline-none" placeholder="Search"
                  value={searchTutor} onChange={(e) => setSearchTutor(e.target.value)} />
              </div>
            </div>
            {loadingList ? (
              <div className="flex-1 flex items-center justify-center text-xs" style={{ color: '#8B93A5' }}>Loading…</div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {filteredTutors.map((t) => {
                  const isSelected = selectedTutor?._id === t._id;
                  const initials   = t.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <button key={t._id}
                      onClick={() => handleSelectTutor(t)}
                      className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-gray-50 transition-colors border-b"
                      style={{
                        borderColor: '#E4E7EF',
                        background:  isSelected ? '#EEF2FF' : undefined,
                        borderLeft:  isSelected ? '3px solid #1A3FD1' : '3px solid transparent',
                      }}>
                      <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
                        style={{ background: isSelected ? '#1A3FD1' : '#6B7280' }}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: '#0F1117' }}>{t.name}</p>
                        {t.rating != null && (
                          <p className="text-xs" style={{ color: '#8B93A5' }}>★ {t.rating.toFixed(1)}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Col 2: Course list for selected tutor ──────────────────────── */}
          <div className="w-80 shrink-0 bg-white rounded-xl border flex flex-col overflow-hidden"
            style={{ borderColor: '#E4E7EF' }}>
            {!selectedTutor ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xs" style={{ color: '#8B93A5' }}>Select a tutor</p>
              </div>
            ) : loadingDetails ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xs" style={{ color: '#8B93A5' }}>Loading…</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-2.5 border-b text-xs font-semibold"
                  style={{ borderColor: '#E4E7EF', color: '#4B5263', background: '#F9FAFB' }}>
                  {filteredCourses.length} Courses&nbsp;&nbsp;|&nbsp;&nbsp;{overallRate}% Attendance
                </div>
                <div className="px-3 py-2 border-b" style={{ borderColor: '#E4E7EF' }}>
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: '#F3F4F6' }}>
                    <Search size={13} style={{ color: '#8B93A5' }} />
                    <input className="flex-1 text-xs bg-transparent outline-none" placeholder="Search courses"
                      value={searchCourse} onChange={(e) => setSearchCourse(e.target.value)} />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredCourses.length === 0 ? (
                    <p className="text-xs text-center py-10" style={{ color: '#8B93A5' }}>No courses found</p>
                  ) : filteredCourses.map((g) => {
                    const stats      = getCourseStats(g);
                    const isSelected = selectedCourseId === g.courseId;
                    return (
                      <button key={g.courseId}
                        onClick={() => { setSelectedCourseId(g.courseId); setExpanded(true); }}
                        className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors border-b"
                        style={{
                          borderColor: '#E4E7EF',
                          background:  isSelected ? '#EEF2FF' : undefined,
                          borderLeft:  isSelected ? '3px solid #1A3FD1' : '3px solid transparent',
                        }}>
                        <div className="w-9 h-9 rounded-lg shrink-0 overflow-hidden flex items-center justify-center"
                          style={{ background: '#E4E7EF' }}>
                          {g.courseImage
                            ? <img src={g.courseImage} alt="" className="w-full h-full object-cover" />
                            : <span className="text-xs font-bold" style={{ color: '#8B93A5' }}>{g.courseName[0]}</span>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold leading-snug line-clamp-2 mb-0.5" style={{ color: '#0F1117' }}>
                            {g.courseName}
                          </p>
                          <p className="text-xs" style={{ color: '#8B93A5' }}>
                            Sessions {stats.joined}/{stats.total}&nbsp;&nbsp;|&nbsp;&nbsp;{stats.rate}% Attendance
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* ── Col 3: Session details ─────────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            {!selectedGroup ? (
              <div className="bg-white rounded-xl border h-full flex items-center justify-center"
                style={{ borderColor: '#E4E7EF' }}>
                <p className="text-sm" style={{ color: '#8B93A5' }}>
                  {!selectedTutor ? 'Select a tutor to view attendance' : 'Select a course to view sessions'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E4E7EF' }}>
                {/* Course header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: '#E4E7EF' }}>
                  <div className="w-10 h-10 rounded-lg shrink-0 overflow-hidden flex items-center justify-center"
                    style={{ background: '#E4E7EF' }}>
                    {selectedGroup.courseImage
                      ? <img src={selectedGroup.courseImage} alt="" className="w-full h-full object-cover" />
                      : <span className="text-sm font-bold" style={{ color: '#8B93A5' }}>{selectedGroup.courseName[0]}</span>
                    }
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#0F1117' }}>{selectedGroup.courseName}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#8B93A5' }}>
                      {selectedTutor?.name}&nbsp;&nbsp;|&nbsp;&nbsp;Sessions {selStats!.joined}/{selStats!.total}&nbsp;&nbsp;|&nbsp;&nbsp;{selStats!.rate}% Attendance
                    </p>
                  </div>
                </div>

                {/* Collapsible session table */}
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors border-b"
                  style={{ borderColor: '#E4E7EF' }}>
                  <span className="text-sm font-semibold" style={{ color: '#0F1117' }}>{selectedGroup.courseName}</span>
                  {expanded ? <ChevronUp size={16} style={{ color: '#4B5263' }} /> : <ChevronDown size={16} style={{ color: '#4B5263' }} />}
                </button>

                {expanded && (() => {
                  const sorted     = [...selectedGroup.sessions].sort(
                    (a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
                  );
                  const allUpcoming = sorted.every((s) => getTutorSessionStatus(s) === 'upcoming');

                  if (allUpcoming) {
                    return (
                      <div className="px-5 py-8 flex flex-col items-center gap-2">
                        <span className="text-xs px-3 py-1 rounded-full font-semibold"
                          style={{ background: '#EEF2FF', color: '#1A3FD1' }}>All Upcoming</span>
                        <p className="text-sm" style={{ color: '#8B93A5' }}>Sessions haven't started yet.</p>
                      </div>
                    );
                  }

                  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
                  const fmt = (d: Date) =>
                    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();

                  return (
                    <div className="px-5 pb-5 pt-2">
                      <div className="grid grid-cols-3 border-b py-2.5" style={{ borderColor: '#E4E7EF' }}>
                        {['Sessions', 'Schedule', 'Attendance'].map((h) => (
                          <span key={h} className="text-xs font-semibold" style={{ color: '#4B5263' }}>{h}</span>
                        ))}
                      </div>
                      {sorted.map((s, i) => {
                        const status  = getTutorSessionStatus(s);
                        const joined  = status !== 'upcoming' && didJoin(s);
                        const start   = new Date(s.startDateTime);
                        const end     = new Date(s.endDateTime);
                        const dateStr = `${String(start.getDate()).padStart(2,'0')} ${months[start.getMonth()]} ${start.getFullYear()}`;
                        return (
                          <div key={s._id}
                            className="grid grid-cols-3 py-3 text-xs items-center"
                            style={{ borderBottom: i < sorted.length - 1 ? '1px solid #F3F4F6' : undefined }}>
                            <span className="font-medium" style={{ color: '#0F1117' }}>Session {s.sessionNumber || i + 1}</span>
                            <span style={{ color: '#4B5263' }}>{dateStr}, {fmt(start)} - {fmt(end)}</span>
                            {status === 'upcoming' ? (
                              <span className="inline-block w-fit px-2 py-0.5 rounded-full font-semibold"
                                style={{ background: '#EEF2FF', color: '#1A3FD1' }}>Upcoming</span>
                            ) : joined ? (
                              <span className="font-semibold" style={{ color: '#16A34A' }}>Joined</span>
                            ) : (
                              <span className="font-semibold" style={{ color: '#EF4444' }}>Not Joined</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Entry point ────────────────────────────────────────────────────────────────
export default function TutorAttendancePage() {
  const { user } = useAuth();
  const year  = new Date().getFullYear();
  const month = new Date().getMonth() + 1;

  const isAdmin = hasRole(user, ...ADMIN_ROLES);
  const isTutor = user?.role === 'tutor';

  if (!isAdmin && !isTutor) {
    return (
      <div className="p-8 text-sm text-red-500">
        Access denied. This page is for tutors and admins only.
      </div>
    );
  }

  if (isTutor) return <MyTutorAttendance year={year} month={month} />;
  return <AdminTutorAttendance year={year} month={month} />;
}
