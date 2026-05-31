'use client';
import React from 'react';
import { Video } from 'lucide-react';

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500';
const labelCls = 'block text-xs font-semibold uppercase tracking-wide mb-1';

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const GRADES = [
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6',
  'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12',
  'JEE', 'NEET', 'Olympiad', 'College',
];
const TYPES = [
  { value: 'live_single',  label: 'Live 1:1' },
  { value: 'video_course', label: 'Video Course' },
];

interface CategoryOption { _id: string; name: string; slug: string; icon?: string }

interface Props {
  form: {
    courseName: string; description: string; courseImage: string;
    topics: string; category: string; subject: string; level: string;
    type: string; grades: string[];
  };
  set: (k: string, v: unknown) => void;
  toggleGrade: (g: string) => void;
  categories: CategoryOption[];
  // image
  imgTab: 'url' | 'ai';
  setImgTab: (t: 'url' | 'ai') => void;
  aiPrompt: string;
  setAiPrompt: (v: string) => void;
  imgLoading: boolean;
  imgError: string;
  generateImage: () => void;
  clearImage: () => void;
  // video (video_course type only)
  videoFile: File | null;
  setVideoFile: (f: File | null) => void;
  // navigation
  onNext: () => void;
}

export default function CourseInfoStep({
  form, set, toggleGrade, categories,
  imgTab, setImgTab, aiPrompt, setAiPrompt,
  imgLoading, imgError, generateImage, clearImage,
  videoFile, setVideoFile,
  onNext,
}: Props) {

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    onNext();
  };

  return (
    <form onSubmit={handleNext} className="bg-white rounded-2xl border p-8 space-y-6" style={{ borderColor: '#E4E7EF' }}>

      {/* Course Name */}
      <div>
        <label className={labelCls} style={{ color: '#8B93A5' }}>Course Name <span className="text-red-500">*</span></label>
        <input className={inputCls} value={form.courseName}
          onChange={(e) => set('courseName', e.target.value)}
          placeholder="e.g. Algebra Fundamentals" required />
      </div>

      {/* Description */}
      <div>
        <label className={labelCls} style={{ color: '#8B93A5' }}>Description</label>
        <textarea className={inputCls} rows={3} value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="What will students learn in this course?" style={{ resize: 'vertical' }} />
      </div>

      {/* ── Course Image ── */}
      <div>
        <label className={labelCls} style={{ color: '#8B93A5' }}>Course Image</label>

        <div className="flex gap-1 mb-3 p-1 rounded-lg w-fit" style={{ background: '#F3F4F6' }}>
          {(['url', 'ai'] as const).map((tab) => (
            <button key={tab} type="button"
              onClick={() => { setImgTab(tab); }}
              className="px-3 py-1 rounded-md text-xs font-medium transition-all"
              style={imgTab === tab
                ? { background: '#fff', color: '#1A3FD1', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                : { color: '#6B7280' }}>
              {tab === 'url' ? 'Enter URL' : '✨ Generate with AI'}
            </button>
          ))}
        </div>

        {imgTab === 'url' && (
          <input className={inputCls} value={form.courseImage}
            onChange={(e) => set('courseImage', e.target.value)}
            placeholder="https://example.com/image.jpg" />
        )}

        {imgTab === 'ai' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input className={inputCls} value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); generateImage(); } }}
                placeholder={`e.g. ${form.courseName || 'algebra'} math colorful illustration`}
                disabled={imgLoading} />
              <button type="button" onClick={generateImage} disabled={imgLoading}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white whitespace-nowrap transition-opacity flex items-center gap-1.5"
                style={{ background: '#1A3FD1', opacity: imgLoading ? 0.7 : 1 }}>
                {imgLoading
                  ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Generating…</>
                  : '✨ Generate'}
              </button>
            </div>
            <p className="text-xs" style={{ color: '#8B93A5' }}>
              Powered by <span className="font-medium">Pollinations AI</span> — free · may take 15–30 s
            </p>
          </div>
        )}

        {imgTab === 'ai' && imgLoading && (
          <div className="mt-3 rounded-xl border flex flex-col items-center justify-center gap-3"
            style={{ height: '160px', borderColor: '#E4E7EF', background: '#F9FAFB' }}>
            <div className="w-7 h-7 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs" style={{ color: '#8B93A5' }}>Generating image…</span>
          </div>
        )}

        {imgError && !imgLoading && (
          <div className="mt-3 rounded-xl border px-4 py-3 flex items-center justify-between gap-3"
            style={{ borderColor: '#FCA5A5', background: '#FEF2F2' }}>
            <span className="text-xs text-red-600">{imgError}</span>
            {imgTab === 'ai' && (
              <button type="button" onClick={generateImage}
                className="text-xs font-semibold px-3 py-1 rounded-lg text-white"
                style={{ background: '#DC2626' }}>Retry</button>
            )}
          </div>
        )}

        {form.courseImage && !imgLoading && !imgError && (
          <div className="mt-3 relative rounded-xl overflow-hidden border"
            style={{ borderColor: '#E4E7EF', height: '160px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={form.courseImage} alt="preview" className="w-full h-full object-cover" />
            <button type="button" onClick={clearImage}
              className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shadow"
              style={{ background: 'rgba(0,0,0,0.5)' }}>✕</button>
            {imgTab === 'ai' && (
              <button type="button" onClick={generateImage}
                className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg text-xs font-medium text-white shadow"
                style={{ background: 'rgba(0,0,0,0.5)' }}>↻ Regenerate</button>
            )}
          </div>
        )}
      </div>

      {/* Topics */}
      <div>
        <label className={labelCls} style={{ color: '#8B93A5' }}>
          Topics Covered <span className="text-xs font-normal normal-case text-gray-400">(comma-separated)</span>
        </label>
        <input className={inputCls} value={form.topics} onChange={(e) => set('topics', e.target.value)}
          placeholder="Linear equations, Quadratic, Polynomials" />
      </div>

      {/* Category · Subject · Level */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelCls} style={{ color: '#8B93A5' }}>Category <span className="text-red-500">*</span></label>
          <select className={inputCls} value={form.category} onChange={(e) => set('category', e.target.value)} required>
            <option value="">— Select —</option>
            {categories.map((c) => (
              <option key={c._id} value={c.slug}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} style={{ color: '#8B93A5' }}>Subject <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.subject} onChange={(e) => set('subject', e.target.value)}
            placeholder="Mathematics" required />
        </div>
        <div>
          <label className={labelCls} style={{ color: '#8B93A5' }}>Level</label>
          <select className={inputCls} value={form.level} onChange={(e) => set('level', e.target.value)}>
            {LEVELS.map((l) => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
          </select>
        </div>
      </div>

      {/* Course Type */}
      <div>
        <label className={labelCls} style={{ color: '#8B93A5' }}>Course Type</label>
        <div className="flex gap-2">
          {TYPES.map((t) => (
            <button key={t.value} type="button" onClick={() => set('type', t.value)}
              className="flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all"
              style={{
                borderColor: form.type === t.value ? '#1A3FD1' : '#E5E7EB',
                background:  form.type === t.value ? '#EEF2FF' : '#fff',
                color:       form.type === t.value ? '#1A3FD1' : '#6B7280',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Video Upload (video_course only) ── */}
      {form.type === 'video_course' && (
        <div>
          <label className={labelCls} style={{ color: '#8B93A5' }}>
            Course Video <span className="text-xs font-normal normal-case text-gray-400">(upload after creation, or skip and upload later)</span>
          </label>
          {videoFile ? (
            <div className="flex items-center gap-4 p-4 rounded-xl border mt-1" style={{ borderColor: '#C7D2FE', background: '#EEF2FF' }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#fff' }}>
                <Video size={20} style={{ color: '#1A3FD1' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: '#0F1117' }}>{videoFile.name}</p>
                <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>
                  {(videoFile.size / (1024 * 1024)).toFixed(1)} MB · {videoFile.type.replace('video/', '').toUpperCase()}
                </p>
              </div>
              <button type="button" onClick={() => setVideoFile(null)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 transition-colors"
                style={{ background: '#FEF2F2', color: '#DC2626' }}>
                Remove
              </button>
            </div>
          ) : (
            <label
              className="flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors mt-1"
              style={{ borderColor: '#C7D2FE', background: '#F8F9FF' }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file && file.type.startsWith('video/')) setVideoFile(file);
              }}
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#EEF2FF' }}>
                <Video size={22} style={{ color: '#1A3FD1' }} />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold" style={{ color: '#0F1117' }}>
                  Click to upload or drag & drop
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#8B93A5' }}>
                  MP4, WebM or MOV · up to 500 MB
                </p>
              </div>
              <input
                type="file"
                accept="video/mp4,video/webm,video/ogg,video/quicktime"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) setVideoFile(e.target.files[0]); }}
              />
            </label>
          )}
        </div>
      )}

      {/* Grades */}
      <div>
        <label className={labelCls} style={{ color: '#8B93A5' }}>
          Target Grades
          {form.grades.length > 0 && (
            <span className="ml-2 normal-case font-normal text-xs" style={{ color: '#1A3FD1' }}>
              {form.grades.length} selected
            </span>
          )}
        </label>
        <div className="flex flex-wrap gap-2 mt-1">
          {GRADES.map((g) => {
            const selected = form.grades.includes(g);
            return (
              <button key={g} type="button" onClick={() => toggleGrade(g)}
                className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
                style={{
                  borderColor: selected ? '#1A3FD1' : '#E5E7EB',
                  background:  selected ? '#EEF2FF' : '#F9FAFB',
                  color:       selected ? '#1A3FD1' : '#6B7280',
                }}>
                {g}
              </button>
            );
          })}
        </div>
      </div>

      {/* Next */}
      <div className="flex justify-end pt-2">
        <button type="submit"
          className="px-8 py-2.5 rounded-xl text-white text-sm font-semibold flex items-center gap-2"
          style={{ background: '#1A3FD1' }}>
          Next — Schedule & Publish
          <span>→</span>
        </button>
      </div>

    </form>
  );
}
