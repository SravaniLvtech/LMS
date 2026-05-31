export type UserRole = 'super_admin' | 'operations' | 'finance' | 'support_agent' | 'student' | 'tutor';

export interface User {
  _id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  linkedId?: string;
  lastLogin?: string;
  profileImage?: string;
  phone?: string;
  dialCode?: string;
  countryCode?: string;
  dob?: string;
  gender?: string;
}

export interface Tutor {
  _id: string;
  name: string;
  email: string;
  qualification: string;
  experience: number;
  subjects: string[];
  status: 'active' | 'pending_approval' | 'suspended' | 'flagged';
  rating: number;
  totalSessions: number;
  totalRevenue: number;
  pendingPayout: number;
  warningCount: number;
  performance: {
    teachingQuality: number;
    punctuality: number;
    communication: number;
    studentProgress: number;
    rebookRate: number;
    completionRate: number;
    noShowRate: number;
  };
}

export interface Student {
  _id: string;
  name: string;
  email: string;
  parentName: string;
  parentEmail: string;
  grade: string;
  subjects: string[];
  isActive: boolean;
  attendanceRate: number;
  currentStreak: number;
  totalSessions: number;
}

export interface Alert {
  _id: string;
  type: 'tutor' | 'student' | 'payment' | 'system';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  status: 'unresolved' | 'resolved' | 'dismissed';
  actions: { label: string; action: string; style: string }[];
  createdAt: string;
  refId?: string;
}

export interface RevenueChartPoint {
  date: string;
  label: string;
  revenue: number;
  orders: number;
}

export interface DashboardData {
  kpis: {
    monthlyRevenue: number;
    revenueChange: number;
    activeStudents: number;
    activeTutors: number;
    totalSessions: number;
    sessionsThisMonth: number;
    completedSessions: number;
  };
  revenue?: {
    last30Days: number;
    today: number;
    prevPeriod: number;
    change: number;
    totalOrders: number;
    ordersToday: number;
    chart: RevenueChartPoint[];
  };
  health: {
    sessionCompletion: number;
    avgTutorRating: number;
    paymentSuccessRate: number;
    complaintRate: number;
    studentRetention: number;
  };
  pendingActions: { label: string; count: number; severity: string; action: string }[];
  alertCount: number;
}
