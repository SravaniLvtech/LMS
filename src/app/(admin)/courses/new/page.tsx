'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import api from '@/lib/api';
import CourseInfoStep     from './CourseInfoStep';
import CourseScheduleStep from './CourseScheduleStep';

interface TutorOption    { _id: string; name: string }
interface CategoryOption { _id: string; name: string; slug: string; icon?: string; color?: string }
interface TimezoneOption { _id: string; value: string; label: string; offset: string; region: string }

const STEPS = [
  { n: 1, label: 'Course Info'          },
  { n: 2, label: 'Schedule & Publish'   },
];

export default function CreateCoursePage() {
  const router = useRouter();

  // ── Step ────────────────────────────────────────────────────────────────────
  const [step, setStep] = useState(1);

  // ── API data ────────────────────────────────────────────────────────────────
  const [tutors,      setTutors]      = useState<TutorOption[]>([]);
  const [categories,  setCategories]  = useState<CategoryOption[]>([]);
  const [timezones,   setTimezones]   = useState<TimezoneOption[]>([]);

  // ── UI ──────────────────────────────────────────────────────────────────────
  const [error,          setError]          = useState('');
  const [loading,        setLoading]        = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);   // 0-100 during video upload

  // ── Video upload ────────────────────────────────────────────────────────────
  const [videoFile, setVideoFile] = useState<File | null>(null);

  // ── Image (AI generator) ────────────────────────────────────────────────────
  const [imgTab,        setImgTab]        = useState<'url' | 'ai'>('url');
  const [aiPrompt,      setAiPrompt]      = useState('');
  const [imgLoading,    setImgLoading]    = useState(false);
  const [imgError,      setImgError]      = useState('');
  const [pendingAiUrl,  setPendingAiUrl]  = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  // ── Form state (shared across both steps) ──────────────────────────────────
  const [form, setForm] = useState({
    courseName: '', description: '', courseImage: '',
    category: '', subject: '', level: 'beginner',
    type: 'live_single', topics: '', tags: '',
    grades:          [] as string[],
    tutor:           '',
    maxStudents:     1,
    maxSlots:        50,
    timezone:        'Asia/Kolkata',
    startDate:       '', startTime: '09:00',
    endDate:         '', endTime:   '10:00',
    durationMinutes: 60,
    sessionCount:    1,
    price:           '',
    discountedPrice: '',
    isActive:        true,
    isPublished:     false,
  });

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const toggleGrade = (grade: string) =>
    setForm((f) => ({
      ...f,
      grades: f.grades.includes(grade)
        ? f.grades.filter((g) => g !== grade)
        : [...f.grades, grade],
    }));

  // ── AI image (hidden preloader avoids CORS) ─────────────────────────────────
  const generateImage = () => {
    const prompt = aiPrompt.trim() ||
      `${form.courseName || 'math'} education colorful modern illustration for students`;
    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
      `?width=800&height=450&nologo=true&seed=${Date.now()}`;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setImgError('');
    setImgLoading(true);
    set('courseImage', '');
    setPendingAiUrl(url);
    timeoutRef.current = setTimeout(() => {
      setPendingAiUrl('');
      setImgLoading(false);
      setImgError('Generation is taking too long — try again.');
    }, 90_000);
  };

  const clearImage = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setPendingAiUrl('');
    set('courseImage', '');
    setImgError('');
    setImgLoading(false);
  };

  // ── Fetch reference data ───────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get('/tutors',    { params: { status: 'active', limit: 100 } }),
      api.get('/categories'),
      api.get('/timezones', { params: { isActive: true } }),
    ]).then(([tRes, cRes, tzRes]) => {
      setTutors(tRes.data.data);

      const cats: CategoryOption[] = cRes.data.data;
      setCategories(cats);
      if (cats.length > 0) setForm((f) => ({ ...f, category: cats[0].slug }));

      const tzs: TimezoneOption[] = tzRes.data.data;
      setTimezones(tzs);
      const ist = tzs.find((t) => t.value === 'Asia/Kolkata');
      if (ist) setForm((f) => ({ ...f, timezone: ist.value }));
      else if (tzs.length > 0) setForm((f) => ({ ...f, timezone: tzs[0].value }));
    }).catch(console.error);
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setUploadProgress(0);
    try {
      const payload = {
        ...form,
        tags: [
          ...(form.tags   ? form.tags.split(',').map((t) => t.trim()).filter(Boolean)   : []),
          ...(form.topics ? form.topics.split(',').map((t) => t.trim()).filter(Boolean) : []),
        ],
        price:           Number(form.price),
        discountedPrice: form.discountedPrice ? Number(form.discountedPrice) : undefined,
        tutor:           form.tutor || undefined,
      };
      const { data: courseRes } = await api.post('/courses', payload);
      const courseId = courseRes.data._id;

      // If video_course and a file was selected, upload the video
      if (form.type === 'video_course' && videoFile && courseId) {
        const fd = new FormData();
        fd.append('video', videoFile);
        await api.post(`/courses/${courseId}/upload-video`, fd, {
          timeout: 0, // no timeout for large video uploads
          onUploadProgress: (evt) => {
            if (evt.total) setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
          },
        });
      }

      router.push('/courses');
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to create course');
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Hidden AI image preloader */}
      {pendingAiUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={pendingAiUrl} src={pendingAiUrl} alt="" style={{ display: 'none' }}
          onLoad={() => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            set('courseImage', pendingAiUrl);
            setPendingAiUrl('');
            setImgLoading(false);
          }}
          onError={() => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            setPendingAiUrl('');
            setImgLoading(false);
            setImgError('Generation failed — Pollinations AI may be busy. Try again or use a different prompt.');
          }}
        />
      )}

      {/* Header */}
      <div className="px-8 py-6 sticky top-0 z-40" style={{ background: 'linear-gradient(135deg, #0F1117 0%, #1A3FD1 100%)' }}>
        <button onClick={() => step === 1 ? router.push('/courses') : setStep(1)}
          className="flex items-center gap-2 mb-4 text-sm" style={{ color: '#93C5FD' }}>
          <ArrowLeft size={16} />
          {step === 1 ? 'Back to Courses' : 'Back to Course Info'}
        </button>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Create Course</h1>

          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s.n} className="flex items-center gap-2">
                {i > 0 && (
                  <div className="w-8 h-px" style={{ background: step > s.n - 1 ? '#60A5FA' : 'rgba(255,255,255,0.2)' }} />
                )}
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                    style={{
                      background: step === s.n ? '#fff' : step > s.n ? '#60A5FA' : 'rgba(255,255,255,0.2)',
                      color:      step === s.n ? '#1A3FD1' : step > s.n ? '#fff' : 'rgba(255,255,255,0.6)',
                    }}>
                    {step > s.n ? '✓' : s.n}
                  </div>
                  <span className="text-xs hidden sm:block"
                    style={{ color: step >= s.n ? '#fff' : 'rgba(255,255,255,0.5)' }}>
                    {s.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-8 max-w-3xl">
        {step === 1 && (
          <CourseInfoStep
            form={form}
            set={set}
            toggleGrade={toggleGrade}
            categories={categories}
            imgTab={imgTab}
            setImgTab={setImgTab}
            aiPrompt={aiPrompt}
            setAiPrompt={setAiPrompt}
            imgLoading={imgLoading}
            imgError={imgError}
            generateImage={generateImage}
            clearImage={clearImage}
            videoFile={videoFile}
            setVideoFile={setVideoFile}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <CourseScheduleStep
            form={form}
            set={set}
            tutors={tutors}
            timezones={timezones}
            loading={loading}
            error={error}
            uploadProgress={uploadProgress}
            onBack={() => { setError(''); setStep(1); }}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}
