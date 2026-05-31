'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, Check, AlertCircle, Lock, Eye, EyeOff } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const ROLE_LABELS: Record<string, string> = {
  super_admin:    'Super Admin',
  operations:     'Operations',
  finance:        'Finance',
  support_agent:  'Support Agent',
  student:        'Student',
  tutor:          'Tutor',
};

const inputCls =
  'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100';
const labelCls = 'block text-xs font-semibold uppercase tracking-wide mb-1';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border p-6 space-y-4" style={{ borderColor: '#E4E7EF' }}>
      <h3 className="text-sm font-bold" style={{ color: '#0F1117' }}>{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls} style={{ color: '#8B93A5' }}>{label}</label>
      {children}
    </div>
  );
}

// ── Avatar upload component ────────────────────────────────────────────────────
function AvatarUpload({
  image, name, onChange,
}: { image: string; name: string; onChange: (b64: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');

  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      setErr('Image must be under 1.5 MB.');
      return;
    }
    setErr('');
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative w-24 h-24 rounded-full overflow-hidden cursor-pointer group"
        onClick={() => ref.current?.click()}
        style={{ background: '#EEF2FF', border: '3px solid #C7D2FE' }}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl font-bold"
            style={{ color: '#1A3FD1' }}>
            {initials || '?'}
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(26,63,209,0.55)' }}>
          <Camera size={22} className="text-white" />
        </div>
      </div>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-blue-50"
        style={{ color: '#1A3FD1', borderColor: '#C7D2FE' }}>
        Change Photo
      </button>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ── Change Password section ────────────────────────────────────────────────────
function ChangePasswordSection() {
  const [current, setCurrent]   = useState('');
  const [next,    setNext]      = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showCur, setShowCur]   = useState(false);
  const [showNew, setShowNew]   = useState(false);
  const [saving,  setSaving]    = useState(false);
  const [done,    setDone]      = useState(false);
  const [error,   setError]     = useState('');

  const handleSave = async () => {
    setError('');
    if (next !== confirm) { setError('New passwords do not match.'); return; }
    if (next.length < 6)  { setError('Password must be at least 6 characters.'); return; }
    setSaving(true);
    try {
      await api.patch('/auth/me/change-password', { currentPassword: current, newPassword: next });
      setDone(true);
      setCurrent(''); setNext(''); setConfirm('');
      setTimeout(() => setDone(false), 4000);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Change Password">
      <div className="grid grid-cols-1 gap-4 max-w-sm">
        <Field label="Current Password">
          <div className="relative">
            <input type={showCur ? 'text' : 'password'} value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={inputCls} placeholder="••••••" />
            <button type="button" onClick={() => setShowCur(!showCur)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              {showCur ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>
        <Field label="New Password">
          <div className="relative">
            <input type={showNew ? 'text' : 'password'} value={next}
              onChange={(e) => setNext(e.target.value)}
              className={inputCls} placeholder="Min 6 chars" />
            <button type="button" onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>
        <Field label="Confirm New Password">
          <input type="password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputCls} placeholder="Repeat new password" />
        </Field>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg"
          style={{ background: '#FEF2F2', color: '#DC2626' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {done && (
        <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg"
          style={{ background: '#ECFDF5', color: '#16A34A' }}>
          <Check size={14} /> Password changed successfully.
        </div>
      )}
      <button onClick={handleSave} disabled={saving || !current || !next || !confirm}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
        style={{ background: '#0F1117' }}>
        {saving
          ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
          : <><Lock size={14} /> Update Password</>}
      </button>
    </Section>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { user, updateUser } = useAuth();

  // ── Personal fields ────────────────────────────────────────────────────────
  const [firstName,   setFirstName]   = useState('');
  const [lastName,    setLastName]    = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone,       setPhone]       = useState('');
  const [dob,         setDob]         = useState('');
  const [gender,      setGender]      = useState('');
  const [profileImg,  setProfileImg]  = useState('');

  // ── Tutor-specific ─────────────────────────────────────────────────────────
  const [qualification, setQualification] = useState('');
  const [experience,    setExperience]    = useState('');
  const [subjects,      setSubjects]      = useState('');

  // ── Student-specific ───────────────────────────────────────────────────────
  const [grade,       setGrade]       = useState('');
  const [parentName,  setParentName]  = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [stuSubjects, setStuSubjects] = useState('');

  // ── UI state ───────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  const isTutor   = user?.role === 'tutor';
  const isStudent = user?.role === 'student';

  // ── Seed form from user + linked doc ──────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName || '');
    setLastName(user.lastName   || '');
    setDisplayName(user.displayName || '');
    setPhone(user.phone || '');
    setDob(user.dob ? user.dob.slice(0, 10) : '');
    setGender(user.gender || '');
    setProfileImg(user.profileImage || '');

    if (isTutor && user.linkedId) {
      api.get(`/tutors/${user.linkedId}`)
        .then((r) => {
          const t = r.data.data;
          setQualification(t.qualification || '');
          setExperience(t.experience?.toString() || '');
          setSubjects((t.subjects || []).join(', '));
        })
        .catch(console.error);
    }

    if (isStudent && user.linkedId) {
      api.get(`/students/${user.linkedId}`)
        .then((r) => {
          const s = r.data.data || r.data;
          setGrade(s.grade || '');
          setParentName(s.parentName   || '');
          setParentEmail(s.parentEmail || '');
          setParentPhone(s.parentPhone || '');
          setStuSubjects((s.subjects || []).join(', '));
        })
        .catch(console.error);
    }
  }, [user, isTutor, isStudent]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        firstName,
        lastName,
        displayName,
        phone:        phone || undefined,
        dob:          dob   || undefined,
        gender:       gender || undefined,
        profileImage: profileImg || undefined,
      };

      if (isTutor) {
        payload.qualification = qualification;
        payload.experience    = Number(experience) || 0;
        payload.subjects      = subjects.split(',').map((s) => s.trim()).filter(Boolean);
      }
      if (isStudent) {
        payload.grade       = grade;
        payload.parentName  = parentName;
        payload.parentEmail = parentEmail;
        payload.parentPhone = parentPhone;
        payload.subjects    = stuSubjects.split(',').map((s) => s.trim()).filter(Boolean);
      }

      const res = await api.patch('/auth/me', payload);
      updateUser(res.data.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Failed to save changes.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#F8F9FC' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-8 py-6 shrink-0 sticky top-0 z-40"
        style={{ background: 'linear-gradient(135deg, #0F1117 0%, #1A3FD1 100%)' }}>
        <h1 className="text-2xl font-bold text-white">My Profile</h1>
        <p className="text-sm mt-0.5" style={{ color: '#93C5FD' }}>
          Manage your personal information and account settings
        </p>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="p-8 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start max-w-5xl">

        {/* ── LEFT: avatar card ────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border p-6 flex flex-col items-center gap-4 text-center"
          style={{ borderColor: '#E4E7EF' }}>
          <AvatarUpload
            image={profileImg}
            name={user.name || user.displayName || 'User'}
            onChange={setProfileImg}
          />
          <div>
            <p className="text-base font-bold" style={{ color: '#0F1117' }}>
              {user.displayName || user.name}
            </p>
            <p className="text-xs mt-0.5 font-medium" style={{ color: '#8B93A5' }}>
              {user.email}
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold capitalize"
            style={{ background: '#EEF2FF', color: '#1A3FD1' }}>
            {ROLE_LABELS[user.role] || user.role}
          </span>
          {user.lastLogin && (
            <p className="text-xs" style={{ color: '#C3C8D4' }}>
              Last login{' '}
              {new Date(user.lastLogin).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
              })}
            </p>
          )}
        </div>

        {/* ── RIGHT: edit form ─────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Personal info */}
          <Section title="Personal Information">
            <div className="grid grid-cols-2 gap-4">
              <Field label="First Name">
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                  className={inputCls} placeholder="First name" style={{ color: '#0F1117' }} />
              </Field>
              <Field label="Last Name">
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                  className={inputCls} placeholder="Last name" style={{ color: '#0F1117' }} />
              </Field>
            </div>
            <Field label="Display Name">
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                className={inputCls} placeholder="Name shown to others" style={{ color: '#0F1117' }} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date of Birth">
                <input type="date" value={dob} onChange={(e) => setDob(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  className={inputCls} style={{ color: '#0F1117', colorScheme: 'light' }} />
              </Field>
              <Field label="Gender">
                <select value={gender} onChange={(e) => setGender(e.target.value)}
                  className={inputCls} style={{ color: gender ? '#0F1117' : '#9CA3AF' }}>
                  <option value="">Select…</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non_binary">Non-binary</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </Field>
            </div>
          </Section>

          {/* Contact */}
          <Section title="Contact Information">
            <Field label="Email">
              <input type="email" value={user.email} readOnly
                className={`${inputCls} opacity-60 cursor-not-allowed`}
                style={{ color: '#6B7280', background: '#F9FAFB' }} />
            </Field>
            <Field label="Phone">
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                className={inputCls} placeholder="+91 9876543210" style={{ color: '#0F1117' }} />
            </Field>
          </Section>

          {/* Tutor-specific */}
          {isTutor && (
            <Section title="Professional Details">
              <Field label="Qualification">
                <input type="text" value={qualification}
                  onChange={(e) => setQualification(e.target.value)}
                  className={inputCls} placeholder="e.g. B.Sc Mathematics" style={{ color: '#0F1117' }} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Experience (years)">
                  <input type="number" min="0" max="50" value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    className={inputCls} placeholder="0" style={{ color: '#0F1117' }} />
                </Field>
                <Field label="Subjects (comma-separated)">
                  <input type="text" value={subjects}
                    onChange={(e) => setSubjects(e.target.value)}
                    className={inputCls} placeholder="Algebra, Calculus, …" style={{ color: '#0F1117' }} />
                </Field>
              </div>
            </Section>
          )}

          {/* Student-specific */}
          {isStudent && (
            <Section title="Student Details">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Grade / Class">
                  <input type="text" value={grade} onChange={(e) => setGrade(e.target.value)}
                    className={inputCls} placeholder="e.g. Grade 10" style={{ color: '#0F1117' }} />
                </Field>
                <Field label="Subjects (comma-separated)">
                  <input type="text" value={stuSubjects}
                    onChange={(e) => setStuSubjects(e.target.value)}
                    className={inputCls} placeholder="Maths, Science, …" style={{ color: '#0F1117' }} />
                </Field>
              </div>
              <div className="border-t pt-4" style={{ borderColor: '#F3F4F6' }}>
                <p className="text-xs font-semibold uppercase tracking-wide mb-3"
                  style={{ color: '#8B93A5' }}>Parent / Guardian</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Parent Name">
                    <input type="text" value={parentName}
                      onChange={(e) => setParentName(e.target.value)}
                      className={inputCls} placeholder="Full name" style={{ color: '#0F1117' }} />
                  </Field>
                  <Field label="Parent Phone">
                    <input type="tel" value={parentPhone}
                      onChange={(e) => setParentPhone(e.target.value)}
                      className={inputCls} placeholder="+91 9876543210" style={{ color: '#0F1117' }} />
                  </Field>
                </div>
                <Field label="Parent Email">
                  <input type="email" value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    className={inputCls} placeholder="parent@example.com" style={{ color: '#0F1117' }} />
                </Field>
              </div>
            </Section>
          )}

          {/* Feedback + save */}
          {error && (
            <div className="flex items-center gap-2 text-sm px-4 py-3 rounded-xl"
              style={{ background: '#FEF2F2', color: '#DC2626' }}>
              <AlertCircle size={15} /> {error}
            </div>
          )}
          {saved && (
            <div className="flex items-center gap-2 text-sm px-4 py-3 rounded-xl"
              style={{ background: '#ECFDF5', color: '#16A34A' }}>
              <Check size={15} /> Profile saved successfully!
            </div>
          )}

          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #1A3FD1 0%, #4F46E5 100%)' }}>
            {saving
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
              : <><Check size={15} /> Save Changes</>}
          </button>

          {/* Change password */}
          <ChangePasswordSection />
        </div>
      </div>
    </div>
  );
}
