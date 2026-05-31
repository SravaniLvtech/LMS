'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Trash2, ArrowLeft, CheckCircle, BookOpen, Tag, BadgeCheck } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────
interface CartCourse {
  _id: string;
  courseName: string;
  courseImage?: string;
  price: number;
  discountedPrice?: number;
  level: string;
  type: string;
  category: string;
  subject: string;
}
interface CartTutor   { _id: string; name: string; rating?: number }
interface CartItem {
  _id: string;
  courseId: CartCourse;
  tutorId?: CartTutor;
  pricing: { basePrice: number; taxRate: number; taxAmount: number; total: number };
}
interface CartSummary { cartSubtotal: number; cartTax: number; taxRate: number; cartTotal: number }

const levelColors: Record<string, { bg: string; text: string }> = {
  beginner:     { bg: '#F0FDF4', text: '#16A34A' },
  intermediate: { bg: '#FFFBEB', text: '#D97706' },
  advanced:     { bg: '#FEF2F2', text: '#DC2626' },
};
const typeLabels: Record<string, string> = {
  live_single:  'Live 1:1',
  video_course: 'Video',
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function CartPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [items,           setItems]           = useState<CartItem[]>([]);
  const [summary,         setSummary]         = useState<CartSummary | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [removing,        setRemoving]        = useState<string | null>(null);
  const [checking,        setChecking]        = useState(false);
  const [success,         setSuccess]         = useState(false);
  const [error,           setError]           = useState('');
  const [purchasedIds,    setPurchasedIds]    = useState<Set<string>>(new Set());

  // ── Fetch cart + purchased course IDs ──────────────────────────────────────
  const fetchCart = useCallback(() => {
    if (!user?._id) return;
    const sid = user.linkedId || user._id;
    setLoading(true);
    Promise.all([
      api.get('/cart', { params: { studentId: user._id } }),
      api.get('/orders', { params: { studentId: sid, paymentStatus: 'paid', limit: 200 } }),
    ])
      .then(([cartRes, ordersRes]) => {
        setItems(cartRes.data.data || []);
        setSummary(cartRes.data.summary || null);
        const ids = new Set<string>(
          (ordersRes.data.data || [])
            .map((o: { courseId?: string | { _id: string } }) =>
              typeof o.courseId === 'object' ? o.courseId?._id : o.courseId
            )
            .filter(Boolean)
        );
        setPurchasedIds(ids);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user?._id, user?.linkedId]);

  useEffect(() => { fetchCart(); }, [fetchCart]);

  // ── Remove item ─────────────────────────────────────────────────────────────
  const removeItem = async (itemId: string) => {
    if (removing) return;
    setRemoving(itemId);
    try {
      await api.delete(`/cart/${itemId}`);
      fetchCart();
    } catch (err) {
      console.error(err);
    } finally {
      setRemoving(null);
    }
  };

  // ── Checkout ────────────────────────────────────────────────────────────────
  const handleCheckout = async () => {
    if (!user?._id || checking || !items.length) return;
    setChecking(true);
    setError('');
    try {
      await api.post('/cart/checkout', { studentId: user._id });
      setSuccess(true);
      // Redirect to my-orders so student can see their new purchase
      setTimeout(() => router.push('/my-orders'), 2500);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e?.response?.data?.message || 'Checkout failed. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4"
        style={{ background: '#F8F9FC' }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{ background: '#ECFDF5' }}>
          <CheckCircle size={44} style={{ color: '#16A34A' }} />
        </div>
        <h2 className="text-2xl font-bold" style={{ color: '#0F1117' }}>Purchase Successful!</h2>
        <p className="text-sm" style={{ color: '#6B7280' }}>
          You are now enrolled in {items.length} course{items.length !== 1 ? 's' : ''}.
          Redirecting to your orders…
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#F8F9FC' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-8 py-6 shrink-0 sticky top-0 z-40"
        style={{ background: 'linear-gradient(135deg, #0F1117 0%, #1A3FD1 100%)' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:bg-white/10">
            <ArrowLeft size={18} className="text-white" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <ShoppingCart size={22} /> My Cart
            </h1>
            {!loading && (
              <p className="text-sm mt-0.5" style={{ color: '#93C5FD' }}>
                {items.length} item{items.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex gap-6 p-8 flex-1 items-start">

        {/* ── Left: items ──────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="bg-white rounded-2xl border flex flex-col items-center justify-center py-20 gap-4"
              style={{ borderColor: '#E4E7EF' }}>
              <BookOpen size={44} className="text-gray-300" />
              <p className="text-sm font-medium" style={{ color: '#6B7280' }}>Your cart is empty</p>
              <button onClick={() => router.push('/courses')}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: '#1A3FD1' }}>
                Browse Courses
              </button>
            </div>
          ) : (
            items.map((item) => {
              const c           = item.courseId;
              const lc          = levelColors[c.level] || levelColors.beginner;
              const busy        = removing === item._id;
              const isPurchased = purchasedIds.has(c._id);

              return (
                <div key={item._id}
                  className="bg-white rounded-2xl border overflow-hidden flex gap-4 p-4"
                  style={{ borderColor: isPurchased ? '#86EFAC' : '#E4E7EF' }}>

                  {/* Course image */}
                  <div className="shrink-0 w-28 h-28 rounded-xl overflow-hidden"
                    style={{ background: '#EEF2FF' }}>
                    {c.courseImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.courseImage} alt={c.courseName}
                        className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl">📚</div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                            style={{ background: lc.bg, color: lc.text }}>
                            {c.level}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background: '#EEF2FF', color: '#1A3FD1' }}>
                            {typeLabels[c.type] || c.type}
                          </span>
                          {isPurchased && (
                            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: '#DCFCE7', color: '#16A34A' }}>
                              <BadgeCheck size={11} />
                              Already Purchased
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-semibold leading-snug" style={{ color: '#0F1117' }}>
                          {c.courseName}
                        </h3>
                        <p className="text-xs mt-0.5 capitalize" style={{ color: '#8B93A5' }}>
                          {c.category} · {c.subject}
                        </p>
                        {item.tutorId && (
                          <p className="text-xs mt-1" style={{ color: '#4B5263' }}>
                            Tutor: <span className="font-medium">{item.tutorId.name}</span>
                            {item.tutorId.rating && item.tutorId.rating > 0 && (
                              <span className="ml-1 text-yellow-500">★ {item.tutorId.rating.toFixed(1)}</span>
                            )}
                          </p>
                        )}
                      </div>

                      {/* Remove button */}
                      <button onClick={() => removeItem(item._id)} disabled={busy}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-red-50 shrink-0"
                        title="Remove from cart">
                        {busy
                          ? <span className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          : <Trash2 size={16} style={{ color: '#EF4444' }} />
                        }
                      </button>
                    </div>

                    {/* Pricing row */}
                    <div className="mt-3 pt-3 border-t flex items-center justify-between"
                      style={{ borderColor: '#E4E7EF' }}>
                      <div className="flex items-center gap-2 text-xs" style={{ color: '#8B93A5' }}>
                        <Tag size={12} />
                        <span>
                          ₹{item.pricing.basePrice.toLocaleString('en-IN')} + {item.pricing.taxRate}% tax
                          (₹{item.pricing.taxAmount.toLocaleString('en-IN')})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isPurchased && (
                          <span className="text-xs" style={{ color: '#16A34A' }}>You own this</span>
                        )}
                        <p className="text-base font-bold" style={{ color: isPurchased ? '#16A34A' : '#0F1117' }}>
                          ₹{item.pricing.total.toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Right: order summary ──────────────────────────────────────────── */}
        {!loading && items.length > 0 && summary && (
          <div className="shrink-0 sticky top-6" style={{ width: '320px' }}>
            <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E4E7EF' }}>

              {/* Header */}
              <div className="px-5 py-4 border-b" style={{ borderColor: '#E4E7EF' }}>
                <h3 className="font-bold text-base" style={{ color: '#0F1117' }}>Order Summary</h3>
              </div>

              <div className="px-5 py-4 space-y-3">
                {/* Subtotal */}
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#6B7280' }}>
                    Subtotal ({items.length} item{items.length !== 1 ? 's' : ''})
                  </span>
                  <span className="font-medium" style={{ color: '#0F1117' }}>
                    ₹{summary.cartSubtotal.toLocaleString('en-IN')}
                  </span>
                </div>

                {/* Tax */}
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#6B7280' }}>
                    Platform Tax ({summary.taxRate}%)
                  </span>
                  <span className="font-medium" style={{ color: '#0F1117' }}>
                    ₹{summary.cartTax.toLocaleString('en-IN')}
                  </span>
                </div>

                {/* Divider */}
                <div className="border-t pt-3" style={{ borderColor: '#E4E7EF' }}>
                  <div className="flex justify-between">
                    <span className="font-bold" style={{ color: '#0F1117' }}>Total</span>
                    <span className="text-xl font-bold" style={{ color: '#1A3FD1' }}>
                      ₹{summary.cartTotal.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                )}

                {/* Proceed to Buy */}
                <button
                  onClick={handleCheckout}
                  disabled={checking}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all flex items-center justify-center gap-2 mt-2"
                  style={{
                    background: checking ? '#6B7280' : '#1A3FD1',
                    cursor: checking ? 'not-allowed' : 'pointer',
                  }}>
                  {checking
                    ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing…</>
                    : '✓ Proceed to Buy'
                  }
                </button>

                <button onClick={() => router.push('/courses')}
                  className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-gray-50"
                  style={{ color: '#6B7280', border: '1.5px solid #E5E7EB' }}>
                  Continue Shopping
                </button>
              </div>

              {/* Trust note */}
              <div className="px-5 pb-4 text-xs text-center" style={{ color: '#9CA3AF' }}>
                🔒 Secure checkout · Instant enrollment
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
