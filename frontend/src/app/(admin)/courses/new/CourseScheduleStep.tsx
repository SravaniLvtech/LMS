'use client';
import React from 'react';

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500';
const labelCls = 'block text-xs font-semibold uppercase tracking-wide mb-1';

interface TutorOption    { _id: string; name: string }
interface TimezoneOption { _id: string; value: string; label: string; region: string }

interface Props {
  form: {
    type: string;
    startDate: string; startTime: string;
    endDate: string;   endTime: string;
    durationMinutes: number; sessionCount: number;
    tutor: string; maxSlots: number; timezone: string;
    price: string; discountedPrice: string;
    tags: string;
    isActive: boolean; isPublished: boolean;
  };
  set: (k: string, v: unknown) => void;
  tutors: TutorOption[];
  timezones: TimezoneOption[];
  loading: boolean;
  error: string;
  uploadProgress?: number;   // 0-100 while uploading video
  onBack: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function CourseScheduleStep({
  form, set, tutors, timezones, loading, error, uploadProgress = 0, onBack, onSubmit,
}: Props) {

  return (
    <form onSubmit={onSubmit} className="bg-white rounded-2xl border p-8 space-y-6" style={{ borderColor: '#E4E7EF' }}>

      {/* Dates — live only */}
      {form.type === 'live_single' && (
        <>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#8B93A5' }}>
              Schedule
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls} style={{ color: '#8B93A5' }}>Start Date <span className="text-red-500">*</span></label>
                <input type="date" className={inputCls} value={form.startDate}
                  onChange={(e) => set('startDate', e.target.value)} required style={{ colorScheme: 'light' }} />
              </div>
              <div>
                <label className={labelCls} style={{ color: '#8B93A5' }}>Start Time <span className="text-red-500">*</span></label>
                <input type="time" className={inputCls} value={form.startTime}
                  onChange={(e) => set('startTime', e.target.value)} required />
              </div>
              <div>
                <label className={labelCls} style={{ color: '#8B93A5' }}>End Date <span className="text-red-500">*</span></label>
                <input type="date" className={inputCls} value={form.endDate}
                  onChange={(e) => set('endDate', e.target.value)} required style={{ colorScheme: 'light' }} />
              </div>
              <div>
                <label className={labelCls} style={{ color: '#8B93A5' }}>End Time <span className="text-red-500">*</span></label>
                <input type="time" className={inputCls} value={form.endTime}
                  onChange={(e) => set('endTime', e.target.value)} required />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: '#8B93A5' }}>Duration (minutes)</label>
              <input type="number" className={inputCls} value={form.durationMinutes} min={15}
                onChange={(e) => set('durationMinutes', Number(e.target.value))} />
            </div>
            <div>
              <label className={labelCls} style={{ color: '#8B93A5' }}>Total Sessions</label>
              <input type="number" className={inputCls} value={form.sessionCount} min={1}
                onChange={(e) => set('sessionCount', Number(e.target.value))} />
            </div>
          </div>

          {/* Timezone */}
          <div>
            <label className={labelCls} style={{ color: '#8B93A5' }}>Timezone</label>
            <select className={inputCls} value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {timezones.length === 0 ? (
                <option value="Asia/Kolkata">IST — India (UTC+5:30)</option>
              ) : (
                (() => {
                  const regions = [...new Set(timezones.map((t) => t.region))];
                  return regions.map((region) => (
                    <optgroup key={region} label={region}>
                      {timezones.filter((t) => t.region === region).map((tz) => (
                        <option key={tz._id} value={tz.value}>{tz.label}</option>
                      ))}
                    </optgroup>
                  ));
                })()
              )}
            </select>
            <p className="text-xs mt-1" style={{ color: '#8B93A5' }}>
              Sessions will be created with these times in this timezone.
            </p>
          </div>
        </>
      )}

      {/* Instructor & Slots */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#8B93A5' }}>
          Instructor & Capacity
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls} style={{ color: '#8B93A5' }}>Assign Tutor</label>
            <select className={inputCls} value={form.tutor} onChange={(e) => set('tutor', e.target.value)}>
              <option value="">— Select tutor —</option>
              {tutors.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} style={{ color: '#8B93A5' }}>
              Max Slots <span className="ml-1 normal-case font-normal text-xs text-gray-400">(max 50)</span>
            </label>
            <input type="number" className={inputCls} value={form.maxSlots} min={1} max={50}
              onChange={(e) => set('maxSlots', Math.min(50, Math.max(1, Number(e.target.value))))} />
            <p className="text-xs mt-1" style={{ color: '#8B93A5' }}>Decreases on each purchase</p>
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#8B93A5' }}>
          Pricing
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls} style={{ color: '#8B93A5' }}>Price (₹) <span className="text-red-500">*</span></label>
            <input type="number" className={inputCls} value={form.price} min={0}
              onChange={(e) => set('price', e.target.value)} placeholder="2499" required />
          </div>
          <div>
            <label className={labelCls} style={{ color: '#8B93A5' }}>Discount Amount (₹)</label>
            <input type="number" className={inputCls} value={form.discountedPrice} min={0}
              onChange={(e) => set('discountedPrice', e.target.value)} placeholder="1999" />
          </div>
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className={labelCls} style={{ color: '#8B93A5' }}>
          Tags <span className="text-xs font-normal normal-case text-gray-400">(comma-separated)</span>
        </label>
        <input className={inputCls} value={form.tags} onChange={(e) => set('tags', e.target.value)}
          placeholder="cbse, grade-8, exam-prep" />
      </div>

      {/* Active / Published */}
      <div className="flex gap-8 pt-2">
        {[{ key: 'isActive', label: 'Active' }, { key: 'isPublished', label: 'Published' }].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2.5 cursor-pointer select-none">
            <div onClick={() => set(key, !form[key as keyof typeof form])}
              className="w-10 h-5 rounded-full relative transition-colors"
              style={{ background: form[key as keyof typeof form] ? '#1A3FD1' : '#D1D5DB' }}>
              <div className="absolute w-4 h-4 bg-white rounded-full top-0.5 transition-all shadow"
                style={{ left: form[key as keyof typeof form] ? '1.25rem' : '0.125rem' }} />
            </div>
            <span className="text-sm font-medium" style={{ color: '#374151' }}>{label}</span>
          </label>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>}

      {/* Video upload progress bar */}
      {uploadProgress > 0 && uploadProgress < 100 && (
        <div className="rounded-xl p-4 space-y-2" style={{ background: '#EEF2FF' }}>
          <div className="flex items-center justify-between text-xs font-semibold" style={{ color: '#1A3FD1' }}>
            <span>Uploading video…</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-2 rounded-full" style={{ background: '#C7D2FE' }}>
            <div
              className="h-2 rounded-full transition-all"
              style={{ width: `${uploadProgress}%`, background: '#1A3FD1' }}
            />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-2">
        <button type="button" onClick={onBack}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold border flex items-center gap-2"
          style={{ borderColor: '#E4E7EF', color: '#6B7280' }}>
          <span>←</span> Back
        </button>

        <button type="submit" disabled={loading}
          className="px-8 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity flex items-center gap-2"
          style={{ background: '#1A3FD1', opacity: loading ? 0.7 : 1 }}>
          {loading
            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                {uploadProgress > 0 ? 'Uploading video…' : 'Creating…'}</>
            : '✓ Create Course'}
        </button>
      </div>

    </form>
  );
}
