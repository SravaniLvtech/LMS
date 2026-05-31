'use client';
import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, Info, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import { Alert } from '@/lib/types';
import { useRouter } from 'next/navigation';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'tutor', label: 'Tutors' },
  { key: 'student', label: 'Students' },
  { key: 'payment', label: 'Payments' },
  { key: 'system', label: 'System' },
];

const priorityStyles = {
  high:   { border: '#EF4444', bg: '#FFF5F5', icon: AlertCircle, iconColor: '#EF4444', badge: { bg: '#FEF2F2', text: '#DC2626' } },
  medium: { border: '#F59E0B', bg: '#FFFDF5', icon: AlertTriangle, iconColor: '#F59E0B', badge: { bg: '#FFFBEB', text: '#D97706' } },
  low:    { border: '#22C55E', bg: '#F8FFF8', icon: Info, iconColor: '#22C55E', badge: { bg: '#F0FDF4', text: '#16A34A' } },
};

const actionButtonStyles: Record<string, { bg: string; text: string }> = {
  red:    { bg: '#FEF2F2', text: '#DC2626' },
  amber:  { bg: '#FFFBEB', text: '#D97706' },
  blue:   { bg: '#EEF2FF', text: '#1A3FD1' },
  green:  { bg: '#F0FDF4', text: '#16A34A' },
};

function AlertCard({ alert, onResolve, onDismiss, onAction }: {
  alert: Alert;
  onResolve: (id: string) => void;
  onDismiss: (id: string) => void;
  onAction: (alert: Alert, action: string) => void;
}) {
  const p = priorityStyles[alert.priority];
  const Icon = p.icon;

  return (
    <div
      className="bg-white rounded-xl p-5 border"
      style={{ borderColor: '#E4E7EF', borderLeft: `4px solid ${p.border}`, background: p.bg }}
    >
      <div className="flex items-start gap-3">
        <Icon size={18} style={{ color: p.iconColor, marginTop: 2, flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <p className="text-sm font-semibold" style={{ color: '#0F1117' }}>{alert.title}</p>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize" style={{ background: p.badge.bg, color: p.badge.text }}>
                {alert.priority}
              </span>
              <span className="text-xs capitalize px-2 py-0.5 rounded-full" style={{ background: '#E4E7EF', color: '#4B5263' }}>
                {alert.type}
              </span>
            </div>
          </div>
          <p className="text-sm mt-1" style={{ color: '#4B5263' }}>{alert.description}</p>
          <p className="text-xs mt-1" style={{ color: '#8B93A5' }}>
            {new Date(alert.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mt-3">
            {alert.actions?.map((a) => {
              const style = actionButtonStyles[a.style] || actionButtonStyles.blue;
              return (
                <button
                  key={a.action}
                  onClick={() => onAction(alert, a.action)}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={{ background: style.bg, color: style.text }}
                >
                  {a.label}
                </button>
              );
            })}
            <button
              onClick={() => onResolve(alert._id)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium ml-auto"
              style={{ background: '#F3F4F6', color: '#6B7280' }}
            >
              Resolve
            </button>
            <button
              onClick={() => onDismiss(alert._id)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ color: '#9CA3AF' }}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AlertsPage() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(true);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await api.get('/alerts', { params: { type: tab === 'all' ? undefined : tab } });
      setAlerts(res.data.data);
      setUnresolvedCount(res.data.unresolvedCount);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAlerts(); }, [tab]);

  const handleResolve = async (id: string) => {
    await api.patch(`/alerts/${id}/resolve`);
    fetchAlerts();
  };

  const handleDismiss = async (id: string) => {
    await api.patch(`/alerts/${id}/dismiss`);
    fetchAlerts();
  };

  const handleAction = async (alert: Alert, action: string) => {
    switch (action) {
      case 'approve_tutor':
        try {
          await api.post(`/alerts/${alert._id}/approve-tutor`);
          fetchAlerts();
        } catch (err: unknown) {
          console.error('Approve failed:', (err as { response?: { data?: { message?: string } } })?.response?.data?.message);
        }
        break;
      case 'warn_tutor':
      case 'suspend_tutor':
      case 'view_tutor':
        if (alert.refId) router.push(`/tutors/${alert.refId}`);
        break;
      case 'notify_parent':
        if (alert.refId) {
          await api.post(`/students/${alert.refId}/notify`);
          await handleResolve(alert._id);
        }
        break;
      case 'feature_tutor':
        await api.post(`/alerts/${alert._id}/feature-tutor`);
        fetchAlerts();
        break;
      case 'retry_payments':
        router.push('/revenue');
        break;
      default:
        break;
    }
  };

  const high = alerts.filter((a) => a.priority === 'high');
  const medium = alerts.filter((a) => a.priority === 'medium');
  const low = alerts.filter((a) => a.priority === 'low');

  return (
    <div>
      {/* Header */}
      <div className="px-8 py-6 sticky top-0 z-40" style={{ background: 'linear-gradient(135deg, #0F1117 0%, #1A3FD1 100%)' }}>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Alerts & Flags</h1>
          {unresolvedCount > 0 && (
            <span className="px-3 py-1 rounded-full text-sm font-bold bg-red-500 text-white">
              {unresolvedCount} unresolved
            </span>
          )}
        </div>
        <p className="text-sm mt-1" style={{ color: '#93C5FD' }}>Auto-generated from platform events</p>
      </div>

      <div className="p-8 space-y-6">
        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-4 py-2 rounded-full text-sm font-medium transition-colors"
              style={tab === t.key ? { background: '#1A3FD1', color: '#fff' } : { background: '#EEF2FF', color: '#1A3FD1' }}
            >
              {t.label}
            </button>
          ))}
          <button
            onClick={fetchAlerts}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-full text-sm"
            style={{ background: '#F3F4F6', color: '#6B7280' }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-center py-12" style={{ color: '#8B93A5' }}>Loading…</div>
        ) : alerts.length === 0 ? (
          <div className="text-sm text-center py-12" style={{ color: '#8B93A5' }}>No alerts in this category</div>
        ) : (
          <div className="space-y-8">
            {high.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#EF4444' }}>
                  High Priority ({high.length})
                </h2>
                <div className="space-y-3">
                  {high.map((a) => (
                    <AlertCard key={a._id} alert={a} onResolve={handleResolve} onDismiss={handleDismiss} onAction={handleAction} />
                  ))}
                </div>
              </div>
            )}
            {medium.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#D97706' }}>
                  Medium Priority ({medium.length})
                </h2>
                <div className="space-y-3">
                  {medium.map((a) => (
                    <AlertCard key={a._id} alert={a} onResolve={handleResolve} onDismiss={handleDismiss} onAction={handleAction} />
                  ))}
                </div>
              </div>
            )}
            {low.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#16A34A' }}>
                  Low Priority ({low.length})
                </h2>
                <div className="space-y-3">
                  {low.map((a) => (
                    <AlertCard key={a._id} alert={a} onResolve={handleResolve} onDismiss={handleDismiss} onAction={handleAction} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
