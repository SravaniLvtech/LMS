'use client';
import { useEffect, useState, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { hasRole } from '@/lib/auth';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ADMIN_ROLES = ['super_admin','operations','finance','support_agent'] as const;

// ── Types ─────────────────────────────────────────────────────────────────────
interface SessionItem {
  _id: string;
  courseId: string;
  courseName: string;
  courseImage?: string;
  sessionNumber: number;
  totalSessions: number;
  startDateTime: string;
  endDateTime: string;
  status: string;
  tutorId: { _id: string; name: string } | string | null;
}

interface AttendanceRecord {
  _id: string;
  sessionId: { _id: string; startDateTime?: string; courseName?: string } | string;
  tutorId: { _id: string; name?: string } | string | null;
  studentId: { _id: string; name?: string } | string | null;
  joinedAt: string;
  role: string;
}

interface CourseGroup {
  courseId: string;
  courseName: string;
  courseImage?: string;
  sessions: SessionItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDisplayStatus(s: SessionItem): 'upcoming' | 'ongoing' | 'completed' {
  if (s.status === 'completed' || s.status === 'cancelled') return 'completed';
  const now = new Date();
  if (new Date(s.endDateTime)   < now) return 'completed';
  if (new Date(s.startDateTime) <= now) return 'ongoing';
  return 'upcoming';
}

function getId(v: { _id: string } | string | null | undefined): string {
  if (!v) return '';
  if (typeof v === 'object') return String(v._id);
  return String(v);
}

// ── Attendance Calendar (green = attended) ────────────────────────────────────
function AttendanceCalendar({
  attendedDays, year, month,
}: {
  attendedDays: Set<string>; year: number; month: number;
}) {
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
          const isToday = key === todayKey;
          const attended = attendedDays.has(key);
          let bg = '#F3F4F6', color = '#9CA3AF';
          if (isToday)   { bg = '#1A3FD1'; color = '#fff'; }
          else if (attended) { bg = '#22C55E'; color = '#fff'; }
          return (
            <div key={day}
              className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-medium"
              style={{ background: bg, color }}
              title={attended ? 'Attended' : isToday ? 'Today' : ''}>
              {day}
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs" style={{ color: '#4B5263' }}>
        {[
          { color: '#22C55E', label: 'Attended' },
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

// ── Student Attendance Bar ────────────────────────────────────────────────────
function AttendanceBar({ rate }: { rate: number }) {
  const color = rate >= 90 ? '#22C55E' : rate >= 70 ? '#F59E0B' : '#EF4444';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: '#E4E7EF' }}>
        <div className="h-1.5 rounded-full" style={{ width: `${rate}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold w-8 text-right" style={{ color }}>{rate}%</span>
    </div>
  );
}

// ── My Student Attendance (two-panel layout) ───────────────────────────────────
function MyStudentAttendance({ studentId }: { studentId: string }) {
  const year  = new Date().getFullYear();
  const month = new Date().getMonth() + 1;

  const [sessions,   setSessions]   = useState<SessionItem[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded,   setExpanded]   = useState(true);
  const [search,     setSearch]     = useState('');
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/sessions', { params: { limit: 200 } }),
      api.get('/attendance'),
    ])
      .then(([sessRes, attRes]) => {
        setSessions(sessRes.data.data ?? []);
        setAttendance(attRes.data.data ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [studentId]);

  // Days where attendance was recorded → green on calendar
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

  // Group sessions by course
  const courseGroups = useMemo((): CourseGroup[] => {
    const map = new Map<string, CourseGroup>();
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

  // tutorId MANDATORY: attendance only counts if tutorId matches session's tutorId
  const didAttend = (session: SessionItem): boolean => {
    const sessionTutorId = getId(session.tutorId as any);
    return attendance.some((r) => {
      const recSessionId = getId(r.sessionId as any);
      const recTutorId   = getId(r.tutorId   as any);
      if (recSessionId !== session._id) return false;
      // If session has a tutor, tutorId must match (mandatory check per requirement)
      if (sessionTutorId) return recTutorId === sessionTutorId;
      // Session has no tutor — match by sessionId alone
      return true;
    });
  };

  const getCourseStats = (g: CourseGroup) => {
    const total     = g.sessions.length;
    const completed = g.sessions.filter((s) => getDisplayStatus(s) !== 'upcoming');
    const attended  = completed.filter((s) => didAttend(s)).length;
    const rate = completed.length > 0 ? Math.round((attended / completed.length) * 100) : 0;
    return { total, attended, completedCount: completed.length, rate };
  };

  const filteredGroups = useMemo(() =>
    courseGroups.filter((g) =>
      !search || g.courseName.toLowerCase().includes(search.toLowerCase())
    ),
  [courseGroups, search]);

  // Overall stats
  const overallStats = useMemo(() => {
    let completedTotal = 0, attendedTotal = 0;
    courseGroups.forEach((g) => {
      const completed = g.sessions.filter((s) => getDisplayStatus(s) !== 'upcoming');
      completedTotal += completed.length;
      attendedTotal  += completed.filter((s) => didAttend(s)).length;
    });
    const rate = completedTotal > 0 ? parseFloat(((attendedTotal / completedTotal) * 100).toFixed(2)) : 0;
    return { attendedTotal, completedTotal, rate, totalCourses: courseGroups.length };
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
            { label: 'Courses Enrolled', val: overallStats.totalCourses.toString() },
            { label: 'Sessions Attended', val: overallStats.attendedTotal.toString() },
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
        {/* Calendar with green for attended days */}
        <AttendanceCalendar attendedDays={attendedDays} year={year} month={month} />

        {/* Two-panel layout */}
        <div className="flex gap-4" style={{ minHeight: 520 }}>

          {/* ── Left panel: course list ─────────────────────────────────────── */}
          <div className="w-96 shrink-0 bg-white rounded-xl border flex flex-col overflow-hidden"
            style={{ borderColor: '#E4E7EF' }}>

            {/* Stats bar */}
            <div className="px-4 py-2.5 border-b text-xs font-semibold"
              style={{ borderColor: '#E4E7EF', color: '#4B5263', background: '#F9FAFB' }}>
              {filteredGroups.length} Courses&nbsp;&nbsp;|&nbsp;&nbsp;{overallStats.rate}% Attendance
            </div>

            {/* Search */}
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

            {/* Course list */}
            <div className="flex-1 overflow-y-auto">
              {filteredGroups.length === 0 ? (
                <p className="text-xs text-center py-12" style={{ color: '#8B93A5' }}>No courses found</p>
              ) : (
                filteredGroups.map((g) => {
                  const stats    = getCourseStats(g);
                  const selected = selectedId === g.courseId;
                  return (
                    <button
                      key={g.courseId}
                      onClick={() => { setSelectedId(g.courseId); setExpanded(true); }}
                      className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors border-b"
                      style={{
                        borderColor: '#E4E7EF',
                        background:  selected ? '#EEF2FF' : undefined,
                        borderLeft:  selected ? '3px solid #1A3FD1' : '3px solid transparent',
                      }}>
                      {/* Course thumbnail */}
                      <div className="w-10 h-10 rounded-lg shrink-0 overflow-hidden flex items-center justify-center"
                        style={{ background: '#E4E7EF' }}>
                        {g.courseImage
                          ? <img src={g.courseImage} alt="" className="w-full h-full object-cover" />
                          : <span className="text-sm font-bold" style={{ color: '#8B93A5' }}>{g.courseName[0]}</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold leading-snug line-clamp-2 mb-0.5"
                          style={{ color: '#0F1117' }}>{g.courseName}</p>
                        <p className="text-xs" style={{ color: '#8B93A5' }}>
                          Sessions {stats.attended}/{stats.total}&nbsp;&nbsp;|&nbsp;&nbsp;{stats.rate}% Attendance
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Right panel: session details ────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            {!selectedGroup ? (
              <div className="bg-white rounded-xl border h-full flex items-center justify-center"
                style={{ borderColor: '#E4E7EF' }}>
                <p className="text-sm" style={{ color: '#8B93A5' }}>Select a course to view attendance</p>
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
                      Sessions {selectedStats!.attended}/{selectedStats!.total}&nbsp;&nbsp;|&nbsp;&nbsp;{selectedStats!.rate}% Attendance
                    </p>
                  </div>
                </div>

                {/* Collapsible session table */}
                <div>
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors border-b"
                    style={{ borderColor: '#E4E7EF' }}>
                    <span className="text-sm font-semibold" style={{ color: '#0F1117' }}>
                      {selectedGroup.courseName}
                    </span>
                    {expanded ? <ChevronUp size={16} style={{ color: '#4B5263' }} /> : <ChevronDown size={16} style={{ color: '#4B5263' }} />}
                  </button>

                  {expanded && (() => {
                    const sorted     = [...selectedGroup.sessions].sort(
                      (a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
                    );
                    const allUpcoming = sorted.every((s) => getDisplayStatus(s) === 'upcoming');

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
                        {/* Table header */}
                        <div className="grid grid-cols-3 border-b py-2.5"
                          style={{ borderColor: '#E4E7EF' }}>
                          {['Sessions', 'Schedule', 'Your Attendance'].map((h) => (
                            <span key={h} className="text-xs font-semibold" style={{ color: '#4B5263' }}>{h}</span>
                          ))}
                        </div>
                        {/* Rows */}
                        {sorted.map((s, i) => {
                          const status   = getDisplayStatus(s);
                          const attended = status !== 'upcoming' && didAttend(s);
                          const start    = new Date(s.startDateTime);
                          const end      = new Date(s.endDateTime);
                          const months   = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
                          const dateStr  = `${String(start.getDate()).padStart(2,'0')} ${months[start.getMonth()]} ${start.getFullYear()}`;
                          const fmt = (d: Date) =>
                            d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
                             .toUpperCase().replace(' AM', ' AM').replace(' PM', ' PM');
                          const timeStr = `${fmt(start)} - ${fmt(end)}`;
                          return (
                            <div key={s._id}
                              className="grid grid-cols-3 py-3 text-xs items-center"
                              style={{ borderBottom: i < sorted.length - 1 ? '1px solid #F3F4F6' : undefined }}>
                              <span className="font-medium" style={{ color: '#0F1117' }}>
                                Session {s.sessionNumber || i + 1}
                              </span>
                              <span style={{ color: '#4B5263' }}>
                                {dateStr}, {timeStr}
                              </span>
                              {status === 'upcoming' ? (
                                <span className="inline-block w-fit px-2 py-0.5 rounded-full font-semibold"
                                  style={{ background: '#EEF2FF', color: '#1A3FD1' }}>Upcoming</span>
                              ) : attended ? (
                                <span className="font-semibold" style={{ color: '#16A34A' }}>Attended</span>
                              ) : (
                                <span className="font-semibold" style={{ color: '#EF4444' }}>Not Attended</span>
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

// ── Admin attendance view: student list → courses → sessions ──────────────────
interface StudentListItem {
  _id: string;
  name: string;
  grade?: string | number;
  parentName?: string;
  attendanceRate?: number;
}

function AdminStudentAttendance({ year, month }: { year: number; month: number }) {
  const [students,         setStudents]         = useState<StudentListItem[]>([]);
  const [selectedStudent,  setSelectedStudent]  = useState<StudentListItem | null>(null);
  const [courseGroups,     setCourseGroups]      = useState<CourseGroup[]>([]);
  const [attRecords,       setAttRecords]        = useState<AttendanceRecord[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [expanded,         setExpanded]          = useState(true);
  const [searchStudent,    setSearchStudent]     = useState('');
  const [searchCourse,     setSearchCourse]      = useState('');
  const [loadingList,      setLoadingList]       = useState(true);
  const [loadingDetails,   setLoadingDetails]    = useState(false);

  // Load all students on mount
  useEffect(() => {
    api.get('/students', { params: { limit: 200 } })
      .then((r) => setStudents(r.data.data ?? []))
      .catch(console.error)
      .finally(() => setLoadingList(false));
  }, []);

  // When a student is clicked: fetch their sessions + attendance records using their ID
  const handleSelectStudent = async (student: StudentListItem) => {
    setSelectedStudent(student);
    setSelectedCourseId(null);
    setExpanded(true);
    setLoadingDetails(true);
    try {
      const [sessRes, attRes] = await Promise.all([
        api.get('/sessions',   { params: { studentId: student._id, limit: 200 } }),
        api.get('/attendance', { params: { studentId: student._id } }),
      ]);
      const sessData: SessionItem[] = sessRes.data.data ?? [];
      const map = new Map<string, CourseGroup>();
      sessData.forEach((s) => {
        if (!map.has(s.courseId)) {
          map.set(s.courseId, { courseId: s.courseId, courseName: s.courseName, courseImage: s.courseImage, sessions: [] });
        }
        map.get(s.courseId)!.sessions.push(s);
      });
      setCourseGroups(Array.from(map.values()));
      setAttRecords(attRes.data.data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Auto-select first student once list loads
  useEffect(() => {
    if (students.length > 0 && !selectedStudent) {
      handleSelectStudent(students[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students]);

  // Auto-select first course whenever course list changes
  useEffect(() => {
    if (courseGroups.length > 0) {
      setSelectedCourseId(courseGroups[0].courseId);
    }
  }, [courseGroups]);

  // tutorId MANDATORY check for student attendance
  const didAttend = (session: SessionItem): boolean => {
    const sessionTutorId = getId(session.tutorId as any);
    return attRecords.some((r) => {
      const recSessionId = getId(r.sessionId as any);
      const recTutorId   = getId(r.tutorId   as any);
      if (recSessionId !== session._id) return false;
      if (sessionTutorId) return recTutorId === sessionTutorId;
      return true;
    });
  };

  const getCourseStats = (g: CourseGroup) => {
    const total     = g.sessions.length;
    const completed = g.sessions.filter((s) => getDisplayStatus(s) !== 'upcoming');
    const attended  = completed.filter((s) => didAttend(s)).length;
    const rate = completed.length > 0 ? Math.round((attended / completed.length) * 100) : 0;
    return { total, attended, rate };
  };

  const overallRate = useMemo(() => {
    let c = 0, a = 0;
    courseGroups.forEach((g) => {
      const completed = g.sessions.filter((s) => getDisplayStatus(s) !== 'upcoming');
      c += completed.length;
      a += completed.filter((s) => didAttend(s)).length;
    });
    return c > 0 ? Math.round((a / c) * 100) : 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseGroups, attRecords]);

  const filteredStudents = students.filter((s) => !searchStudent || s.name.toLowerCase().includes(searchStudent.toLowerCase()));
  const filteredCourses  = courseGroups.filter((g) => !searchCourse  || g.courseName.toLowerCase().includes(searchCourse.toLowerCase()));
  const selectedGroup    = courseGroups.find((g) => g.courseId === selectedCourseId) ?? null;
  const selStats         = selectedGroup ? getCourseStats(selectedGroup) : null;

  return (
    <div>
      {/* Header */}
      <div className="px-8 py-6 sticky top-0 z-40" style={{ background: 'linear-gradient(135deg, #0F1117 0%, #1A3FD1 100%)' }}>
        <h1 className="text-2xl font-bold text-white">Student Attendance</h1>
        {selectedStudent && (
          <p className="text-sm mt-1" style={{ color: '#93C5FD' }}>
            Viewing: {selectedStudent.name}
            {selectedStudent.grade ? ` · Grade ${selectedStudent.grade}` : ''}
            &nbsp;&nbsp;|&nbsp;&nbsp;{overallRate}% Attendance
          </p>
        )}
      </div>

      <div className="p-6">
        <div className="flex gap-4" style={{ minHeight: 620 }}>

          {/* ── Col 1: Student list ─────────────────────────────────────────── */}
          <div className="w-56 shrink-0 bg-white rounded-xl border flex flex-col overflow-hidden"
            style={{ borderColor: '#E4E7EF' }}>
            <div className="px-4 py-2.5 border-b text-xs font-semibold"
              style={{ borderColor: '#E4E7EF', color: '#4B5263', background: '#F9FAFB' }}>
              {filteredStudents.length} Students
            </div>
            <div className="px-3 py-2 border-b" style={{ borderColor: '#E4E7EF' }}>
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: '#F3F4F6' }}>
                <Search size={13} style={{ color: '#8B93A5' }} />
                <input className="flex-1 text-xs bg-transparent outline-none" placeholder="Search"
                  value={searchStudent} onChange={(e) => setSearchStudent(e.target.value)} />
              </div>
            </div>
            {loadingList ? (
              <div className="flex-1 flex items-center justify-center text-xs" style={{ color: '#8B93A5' }}>Loading…</div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {filteredStudents.map((s) => {
                  const isSelected = selectedStudent?._id === s._id;
                  const initials   = s.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                  const rate       = s.attendanceRate ?? 0;
                  const rateColor  = rate >= 80 ? '#16A34A' : rate >= 60 ? '#D97706' : '#DC2626';
                  return (
                    <button key={s._id}
                      onClick={() => handleSelectStudent(s)}
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
                        <p className="text-xs font-semibold truncate" style={{ color: '#0F1117' }}>{s.name}</p>
                        <p className="text-xs" style={{ color: rateColor }}>
                          {s.grade ? `Grade ${s.grade}` : ''}
                          {s.grade && rate != null ? ' · ' : ''}
                          {rate}% att.
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Col 2: Course list for selected student ─────────────────────── */}
          <div className="w-80 shrink-0 bg-white rounded-xl border flex flex-col overflow-hidden"
            style={{ borderColor: '#E4E7EF' }}>
            {!selectedStudent ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xs" style={{ color: '#8B93A5' }}>Select a student</p>
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
                            Sessions {stats.attended}/{stats.total}&nbsp;&nbsp;|&nbsp;&nbsp;{stats.rate}% Attendance
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
                  {!selectedStudent ? 'Select a student to view attendance' : 'Select a course to view sessions'}
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
                      {selectedStudent?.name}&nbsp;&nbsp;|&nbsp;&nbsp;Sessions {selStats!.attended}/{selStats!.total}&nbsp;&nbsp;|&nbsp;&nbsp;{selStats!.rate}% Attendance
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
                  const allUpcoming = sorted.every((s) => getDisplayStatus(s) === 'upcoming');

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
                        {['Sessions', 'Schedule', 'Your Attendance'].map((h) => (
                          <span key={h} className="text-xs font-semibold" style={{ color: '#4B5263' }}>{h}</span>
                        ))}
                      </div>
                      {sorted.map((s, i) => {
                        const status   = getDisplayStatus(s);
                        const attended = status !== 'upcoming' && didAttend(s);
                        const start    = new Date(s.startDateTime);
                        const end      = new Date(s.endDateTime);
                        const dateStr  = `${String(start.getDate()).padStart(2,'0')} ${months[start.getMonth()]} ${start.getFullYear()}`;
                        return (
                          <div key={s._id}
                            className="grid grid-cols-3 py-3 text-xs items-center"
                            style={{ borderBottom: i < sorted.length - 1 ? '1px solid #F3F4F6' : undefined }}>
                            <span className="font-medium" style={{ color: '#0F1117' }}>Session {s.sessionNumber || i + 1}</span>
                            <span style={{ color: '#4B5263' }}>{dateStr}, {fmt(start)} - {fmt(end)}</span>
                            {status === 'upcoming' ? (
                              <span className="inline-block w-fit px-2 py-0.5 rounded-full font-semibold"
                                style={{ background: '#EEF2FF', color: '#1A3FD1' }}>Upcoming</span>
                            ) : attended ? (
                              <span className="font-semibold" style={{ color: '#16A34A' }}>Attended</span>
                            ) : (
                              <span className="font-semibold" style={{ color: '#EF4444' }}>Not Attended</span>
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
export default function StudentAttendancePage() {
  const { user } = useAuth();
  const year  = new Date().getFullYear();
  const month = new Date().getMonth() + 1;

  const isAdmin   = hasRole(user, ...ADMIN_ROLES);
  const isStudent = user?.role === 'student';

  if (!isAdmin && !isStudent) {
    return <div className="p-8 text-sm text-red-500">Access denied. This page is for students and admins only.</div>;
  }

  if (isStudent) {
    if (!user?.linkedId) return <div className="p-8 text-sm text-red-500">Student account not linked.</div>;
    return <MyStudentAttendance studentId={user.linkedId} />;
  }

  return <AdminStudentAttendance year={year} month={month} />;
}
