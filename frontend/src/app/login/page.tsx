'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import PhoneInput, { DEFAULT_COUNTRY } from '@/components/ui/PhoneInput';
import { Country } from '@/lib/countries';
import api from '@/lib/api';
import PasswordInput from '@/components/ui/PasswordInput';

type Mode = 'email' | 'mobile';

const inputCls =
  'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('email');

  // email mode
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // mobile mode
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [sendingOtp, setSendingOtp] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setOtpSent(false);
    setOtp(['', '', '', '', '', '']);
  };

  const handleSendOtp = async () => {
    if (phone.length < 7) { setError('Enter a valid mobile number'); return; }
    setError('');
    setSendingOtp(true);
    try {
      await api.post('/auth/send-otp', { phone, dialCode: country.dialCode });
      setOtpSent(true);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Failed to send OTP',
      );
    } finally {
      setSendingOtp(false);
    }
  };

  const handleOtpChange = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
  };

  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'mobile') {
      const otpValue = otp.join('');
      if (otpValue.length < 6) { setError('Enter the 6-digit OTP'); return; }
      setLoading(true);
      try {
        await login({ phone, dialCode: country.dialCode, otp: otpValue }, '');
        router.push('/dashboard');
      } catch (err: unknown) {
        setError(
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
            'Invalid OTP',
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      await login({ email }, password);
      router.push('/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid credentials';
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message || msg,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #0F1117 0%, #1A3FD1 100%)' }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-1">MathPath</h1>
          <p className="text-blue-200 text-sm">Admin Panel</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-5">Sign in</h2>

          {/* Toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-200 mb-5">
            {(['email', 'mobile'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className="flex-1 py-2 text-sm font-medium transition-colors"
                style={{
                  background: mode === m ? '#1A3FD1' : 'transparent',
                  color: mode === m ? '#fff' : '#6B7280',
                }}
              >
                {m === 'email' ? '✉ Email' : '📱 Mobile'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'email' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@mathpath.in"
                    required
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <PasswordInput value={password} onChange={setPassword} required />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mobile number</label>
                  <PhoneInput
                    value={phone}
                    country={country}
                    onChange={setPhone}
                    onCountryChange={(c) => { setCountry(c); setOtpSent(false); setOtp(['','','','','','']); }}
                    placeholder="9876543210"
                    disabled={otpSent}
                  />
                  {otpSent ? (
                    <p className="text-xs text-green-600 mt-1.5">
                      OTP sent to {country.dialCode} {phone} ·{' '}
                      <button type="button" onClick={() => { setOtpSent(false); setOtp(['','','','','','']); }} className="underline">
                        Change
                      </button>
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={sendingOtp || phone.length < 7}
                      className="mt-2 w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity"
                      style={{ background: '#1A3FD1', opacity: sendingOtp || phone.length < 7 ? 0.5 : 1 }}
                    >
                      {sendingOtp ? 'Sending…' : 'Send OTP'}
                    </button>
                  )}
                </div>

                {otpSent && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Enter OTP</label>
                    <div className="flex gap-1.5 justify-between">
                      {otp.map((digit, idx) => (
                        <input
                          key={idx}
                          ref={(el) => { otpRefs.current[idx] = el; }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleOtpChange(idx, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                          className="w-10 h-10 text-center text-base font-bold border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                        />
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">
                      Default OTP for dev: <span className="font-mono font-semibold text-gray-600">123456</span>
                    </p>
                  </div>
                )}
              </>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            {(mode === 'email' || otpSent) && (
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg text-white text-sm font-semibold transition-opacity"
                style={{ background: '#1A3FD1', opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            )}
          </form>

          <div className="mt-6 pt-4 border-t border-gray-100 space-y-3">
            <div>
              <p className="text-xs text-gray-400 mb-2">Demo accounts:</p>
              <div className="space-y-1 text-xs text-gray-500">
                <p>admin@mathpath.in / admin123 (Super Admin)</p>
                <p>finance@mathpath.in / fin1234 (Finance)</p>
              </div>
            </div>
            <p className="text-xs text-center text-gray-400">
              No account?{' '}
              <Link href="/signup" className="text-blue-600 font-medium hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
