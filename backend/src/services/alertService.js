const Alert = require('../models/Alert');
const Student = require('../models/Student');
const Tutor = require('../models/Tutor');

function computeAttendanceRate(sessions) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const month = sessions.filter(
    (s) => new Date(s.scheduledAt) >= startOfMonth &&
      ['present', 'partial', 'absent'].includes(s.studentAttendance)
  );
  const total = month.length;
  if (!total) return 100;
  const present = month.filter((s) => s.studentAttendance === 'present').length;
  const partial = month.filter((s) => s.studentAttendance === 'partial').length;
  return Math.round(((present + partial * 0.5) / total) * 100);
}

async function checkStudentAttendance() {
  const students = await Student.find({ isActive: true }).lean();
  for (const student of students) {
    const rate = computeAttendanceRate(student.sessions);
    if (rate < 70) {
      await Alert.findOneAndUpdate(
        { refModel: 'Student', refId: student._id, title: { $regex: 'attendance drops below 70%' }, status: 'unresolved' },
        {
          $setOnInsert: {
            type: 'student', priority: 'high',
            title: `${student.name}'s attendance drops below 70%`,
            description: `Current attendance rate: ${rate}%. Parent alert and admin flag required.`,
            refModel: 'Student', refId: student._id,
            actions: [{ label: 'Notify Parents', action: 'notify_parent', style: 'amber' }],
          },
        },
        { upsert: true }
      );
    }
  }
}

async function checkTutorPerformance() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const tutors = await Tutor.find({ status: 'active' });
  const allStudents = await Student.find({}).lean();

  for (const tutor of tutors) {
    const sessions = allStudents.flatMap((s) =>
      s.sessions.filter(
        (sess) =>
          sess.tutor?.toString() === tutor._id.toString() &&
          new Date(sess.scheduledAt) >= startOfMonth
      )
    );

    const noShows = sessions.filter((s) => s.tutorAttendance === 'no_show').length;
    const lates = sessions.filter((s) => s.tutorAttendance === 'late').length;
    const completed = sessions.filter((s) => ['present', 'late'].includes(s.tutorAttendance)).length;
    const total = sessions.filter((s) => s.tutorAttendance && s.tutorAttendance !== 'future').length;
    const completionRate = total ? (completed / total) * 100 : 100;

    if (noShows >= 3) {
      await Alert.findOneAndUpdate(
        { refModel: 'Tutor', refId: tutor._id, title: { $regex: '3 no-shows' }, status: 'unresolved' },
        {
          $setOnInsert: {
            type: 'tutor', priority: 'high',
            title: `${tutor.name} has 3+ no-shows this month`,
            description: `${noShows} no-shows recorded. Suspension review required.`,
            refModel: 'Tutor', refId: tutor._id,
            actions: [
              { label: 'Warn', action: 'warn_tutor', style: 'amber' },
              { label: 'Suspend', action: 'suspend_tutor', style: 'red' },
            ],
          },
        },
        { upsert: true }
      );
    }

    if (lates >= 3) {
      await Alert.findOneAndUpdate(
        { refModel: 'Tutor', refId: tutor._id, title: { $regex: 'late to 3' }, status: 'unresolved' },
        {
          $setOnInsert: {
            type: 'tutor', priority: 'medium',
            title: `${tutor.name} late to 3+ sessions`,
            description: `${lates} late starts this month. Warning banner active.`,
            refModel: 'Tutor', refId: tutor._id,
            actions: [{ label: 'Issue Warning', action: 'warn_tutor', style: 'amber' }],
          },
        },
        { upsert: true }
      );
    }

    if (completionRate < 75 && total >= 5) {
      await Alert.findOneAndUpdate(
        { refModel: 'Tutor', refId: tutor._id, title: { $regex: 'completion rate drops' }, status: 'unresolved' },
        {
          $setOnInsert: {
            type: 'tutor', priority: 'high',
            title: `${tutor.name}'s completion rate drops below 75%`,
            description: `Completion rate: ${completionRate.toFixed(1)}%. Admin review required.`,
            refModel: 'Tutor', refId: tutor._id,
            actions: [{ label: 'View Tutor', action: 'view_tutor', style: 'blue' }],
          },
        },
        { upsert: true }
      );
    }

    if (tutor.rating >= 5.0) {
      await Alert.findOneAndUpdate(
        { refModel: 'Tutor', refId: tutor._id, title: { $regex: 'perfect 5.0' }, status: 'unresolved' },
        {
          $setOnInsert: {
            type: 'tutor', priority: 'low',
            title: `${tutor.name} hits perfect 5.0 rating`,
            description: 'Consider featuring this tutor on the platform.',
            refModel: 'Tutor', refId: tutor._id,
            actions: [{ label: 'Feature Tutor', action: 'feature_tutor', style: 'green' }],
          },
        },
        { upsert: true }
      );
    }
  }
}

module.exports = { checkStudentAttendance, checkTutorPerformance };
