const express = require("express");
const Subscription = require("../models/Subscription");
const { protect } = require("../middleware/auth");
const mongoose = require("mongoose");

const router = express.Router();

const ADMIN_ROLES = ["super_admin", "operations", "finance", "support_agent"];

// GET /api/subscriptions?studentId=X&tutorId=Y&status=confirmed
router.get("/", protect, async (req, res) => {
  try {
    const {
      studentId,
      tutorId,
      courseId,
      status,
      page = 1,
      limit = 50,
    } = req.query;
    const role = req.user.role;
    const isAdmin = ADMIN_ROLES.includes(role);
    const query = {};

    // Auto-scope by role so students/tutors only see their own data
    if (role === "student") {
      if (!req.user.linkedId) {
        return res.status(403).json({ success: false, message: "Student account not linked" });
      }
      // Always use the authenticated student's own ID — ignore any studentId param
      query.studentId = req.user.linkedId;
    } else if (role === "tutor") {
      if (!req.user.linkedId) {
        return res.status(403).json({ success: false, message: "Tutor account not linked" });
      }
      // Tutors see subscriptions tied to their courses — ignore any tutorId param
      query.tutorId = req.user.linkedId;
    } else if (isAdmin) {
      // Admins can filter freely
      if (studentId) query.studentId = new mongoose.Types.ObjectId(studentId);
      if (tutorId)   query.tutorId   = new mongoose.Types.ObjectId(tutorId);
    } else {
      return res.status(403).json({ success: false, message: "Access forbidden" });
    }

    if (courseId) query.courseId = new mongoose.Types.ObjectId(courseId);
    if (status) query.status = status;

    const [subs, total] = await Promise.all([
      Subscription.find(query)
        .populate(
          "courseId",
          "courseName courseImage price discountedPrice category subject level enrolledCount",
        )
        .populate("studentId", "name email")
        .populate("tutorId", "name rating")
        .populate(
          "orderId",
          "amountBeforeTax amountAfterTax paymentStatus transactionId createdAt",
        )
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean(),
      Subscription.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: subs,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/subscriptions/:id
router.get("/:id", protect, async (req, res) => {
  try {
    const sub = await Subscription.findById(req.params.id)
      .populate(
        "courseId",
        "courseName courseImage price discountedPrice category subject level enrolledCount",
      )
      .populate("studentId", "name email phone")
      .populate("tutorId", "name rating")
      .populate(
        "orderId",
        "amountAfterTax paymentStatus transactionId createdAt",
      );
    if (!sub)
      return res
        .status(404)
        .json({ success: false, message: "Subscription not found" });
    res.json({ success: true, data: sub });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/subscriptions/:id  (update status)
router.patch("/:id", protect, async (req, res) => {
  try {
    const { status } = req.body;
    const sub = await Subscription.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true },
    );
    if (!sub)
      return res
        .status(404)
        .json({ success: false, message: "Subscription not found" });
    res.json({ success: true, data: sub });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
