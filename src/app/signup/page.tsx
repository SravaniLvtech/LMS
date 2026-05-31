'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Camera } from 'lucide-react';
import api from '@/lib/api';
import { setAuth } from '@/lib/auth';
import PhoneInput, { DEFAULT_COUNTRY } from '@/components/ui/PhoneInput';
import PasswordInput from '@/components/ui/PasswordInput';
import { Country } from '@/lib/countries';

type Role = 'student' | 'tutor' | 'admin';

const inputCls =
  'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500';
const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

const ROLES: { value: Role; label: string; icon: string }[] = [
  { value: 'student', icon: '🎓', label: 'Student' },
  { value: 'tutor',   icon: '📚', label: 'Tutor'   },
  { value: 'admin',   icon: '🛡️', label: 'Admin'   },
];

export default function SignupPage() {
  const router = useRouter();

  const [role, setRole] = useState<Role>('student');

  const [firstName,      setFirstName]      = useState('');
  const [lastName,       setLastName]       = useState('');
  const [displayName,    setDisplayName]    = useState('');
  const [displayTouched, setDisplayTouched] = useState(false);
  const [dob,            setDob]            = useState('');
  const [gender,         setGender]         = useState('');

  const [email,   setEmail]   = useState('');
  const [phone,   setPhone]   = useState('');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);

  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');

  const [profileImage, setProfileImage] = useState('');
  const [imgError,     setImgError]     = useState('');
  const imgRef = useRef<HTMLInputElement>(null);

  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) { setImgError('Image must be under 1.5 MB'); return; }
    setImgError('');
    const reader = new FileReader();
    reader.onload = () => setProfileImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!displayTouched) {
      setDisplayName([firstName, lastName].filter(Boolean).join(' '));
    }
  }, [firstName, lastName, displayTouched]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (phone.length < 7) { setError('Enter a valid mobile number'); return; }

    const name = [firstName, lastName].filter(Boolean).join(' ');
    const payload = {
      role,
      firstName, lastName, name,
      displayName: displayName || name,
      dob:         dob     || undefined,
      gender:      gender  || undefined,
      email,
      phone,
      dialCode:    country.dialCode,
      countryCode: country.iso,
      password,
      profileImage: profileImage || undefined,
    };

    setLoading(true);
    try {
      const res = await api.post('/auth/signup', payload);
      if (res.data.pending) {
        setPending(true);
      } else {
        setAuth(res.data.token, res.data.user);
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Signup failed. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Pending approval screen ───────────────────────────────────────────────────
  if (pending) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #0F1117 0%, #1A3FD1 100%)' }}>
        <div className="w-full max-w-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl"
              style={{ background: '#FEF3C7' }}>⏳</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Application Submitted!</h2>
            <p className="text-sm text-gray-500 mb-1">Your tutor registration is under review.</p>
            <p className="text-sm text-gray-500 mb-6">
              An admin will verify your profile and activate your account.
              You'll be able to sign in once approved.
            </p>
            <div className="p-3 rounded-xl mb-6 text-sm font-medium"
              style={{ background: '#FEF3C7', color: '#92400E' }}>
              Status: <span className="font-bold">Pending Approval</span>
            </div>
            <Link href="/login"
              className="block w-full py-2.5 rounded-lg text-white text-sm font-semibold text-center"
              style={{ background: '#1A3FD1' }}>
              Back to Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center py-8"
      style={{ background: 'linear-gradient(135deg, #0F1117 0%, #1A3FD1 100%)' }}>
      <div className="w-full max-w-3xl px-4">

        {/* Brand */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white mb-0.5">MathPath</h1>
          <p className="text-blue-200 text-sm">Admin Panel</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-5">Create account</h2>

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-x-8">

              {/* ── LEFT: identity ───────────────────────────────────────── */}
              <div className="space-y-4">

                {/* Profile photo */}
                <div className="flex items-center gap-4">
                  <div
                    className="relative w-16 h-16 rounded-full overflow-hidden cursor-pointer group shrink-0"
                    onClick={() => imgRef.current?.click()}
                    style={{ background: '#EEF2FF', border: '2px solid #C7D2FE' }}>
                    {profileImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profileImage} alt="Profile preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-0.5">
                        <Camera size={18} style={{ color: '#1A3FD1' }} />
                        <span className="text-xs font-medium" style={{ color: '#1A3FD1' }}>Photo</span>
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'rgba(26,63,209,0.5)' }}>
                      <Camera size={16} className="text-white" />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-600">Profile photo</p>
                    <p className="text-xs text-gray-400">Optional · max 1.5 MB</p>
                    {imgError && <p className="text-xs text-red-500 mt-0.5">{imgError}</p>}
                  </div>
                  <input ref={imgRef} type="file" accept="image/*" className="hidden"
                    onChange={handleImageFile} />
                </div>

                {/* First + Last name */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>First name <span className="text-red-500">*</span></label>
                    <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John" required className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Last name</label>
                    <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe" className={inputCls} />
                  </div>
                </div>

                {/* Display name */}
                <div>
                  <label className={labelCls}>
                    Display name
                    <span className="ml-1 text-xs font-normal text-gray-400">(shown to others)</span>
                  </label>
                  <input type="text" value={displayName}
                    onChange={(e) => { setDisplayTouched(true); setDisplayName(e.target.value); }}
                    placeholder="John Doe" className={inputCls} />
                </div>

                {/* DOB + Gender */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Date of birth</label>
                    <input type="date" value={dob} onChange={(e) => setDob(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className={inputCls} style={{ colorScheme: 'light' }} />
                  </div>
                  <div>
                    <label className={labelCls}>Gender</label>
                    <select value={gender} onChange={(e) => setGender(e.target.value)}
                      className={inputCls} style={{ color: gender ? '#111827' : '#9CA3AF' }}>
                      <option value="">Select…</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="non_binary">Non-binary</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                  </div>
                </div>

              </div>

              {/* ── RIGHT: role + contact + password ─────────────────────── */}
              <div className="space-y-4">

                {/* Role */}
                <div>
                  <label className={labelCls}>I am a…</label>
                  <div className="flex gap-2">
                    {ROLES.map((r) => (
                      <button key={r.value} type="button" onClick={() => setRole(r.value)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border-2 text-xs font-semibold transition-all"
                        style={{
                          borderColor: role === r.value ? '#1A3FD1' : '#E5E7EB',
                          background:  role === r.value ? '#EEF2FF' : '#fff',
                          color:       role === r.value ? '#1A3FD1' : '#6B7280',
                        }}>
                        <span>{r.icon}</span>{r.label}
                      </button>
                    ))}
                  </div>
                  {role === 'tutor' && (
                    <p className="text-xs mt-1.5" style={{ color: '#D97706' }}>
                      ⚠ Tutor accounts require admin approval before you can sign in.
                    </p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className={labelCls}>Email <span className="text-red-500">*</span></label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com" required className={inputCls} />
                </div>

                {/* Mobile */}
                <div>
                  <label className={labelCls}>Mobile number <span className="text-red-500">*</span></label>
                  <PhoneInput value={phone} country={country} onChange={setPhone}
                    onCountryChange={setCountry} placeholder="9876543210" />
                </div>

                {/* Password + Confirm */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Password <span className="text-red-500">*</span></label>
                    <PasswordInput value={password} onChange={setPassword}
                      placeholder="Min 6 chars" required minLength={6} />
                  </div>
                  <div>
                    <label className={labelCls}>Confirm <span className="text-red-500">*</span></label>
                    <PasswordInput value={confirm} onChange={setConfirm} required />
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
                )}

                {/* Submit */}
                <button type="submit" disabled={loading}
                  className="w-full py-2.5 rounded-lg text-white text-sm font-semibold transition-opacity"
                  style={{ background: '#1A3FD1', opacity: loading ? 0.7 : 1 }}>
                  {loading ? 'Creating account…' : 'Sign up'}
                </button>

                <p className="text-xs text-center text-gray-400">
                  Already have an account?{' '}
                  <Link href="/login" className="text-blue-600 font-medium hover:underline">Sign in</Link>
                </p>

              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
