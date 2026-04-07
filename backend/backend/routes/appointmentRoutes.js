const express = require('express');
const router = express.Router();
const tutorSessionController = require('../controllers/tutorSessionController');
const { authMiddleware, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

// ========== STUDENT ROUTES ==========
// View available sessions
router.get('/sessions/available', authMiddleware, tutorSessionController.getAvailableSessions);

// View session details
router.get('/sessions/:sessionId', authMiddleware, tutorSessionController.getSessionDetails);

// Book a session
router.post('/book', authMiddleware, authorize(['student']), tutorSessionController.bookSession);

// Get student's booked sessions
router.get('/my/bookings', authMiddleware, authorize(['student']), tutorSessionController.getStudentSessions);

// Cancel booking
router.patch('/bookings/:appointmentId/cancel', authMiddleware, authorize(['student']), tutorSessionController.cancelBooking);

// Submit feedback after session
router.patch('/bookings/:appointmentId/feedback', authMiddleware, authorize(['student']), tutorSessionController.submitSessionFeedback);

// ========== TUTOR ROUTES ==========
// Create new session
router.post('/sessions/create', authMiddleware, authorize(['tutor']), upload.single('thumbnail'), tutorSessionController.createSession);

// Get tutor's sessions
router.get('/tutor/sessions', authMiddleware, authorize(['tutor']), tutorSessionController.getTutorSessions);

// Get session with student list
router.get('/tutor/sessions/:sessionId', authMiddleware, authorize(['tutor']), tutorSessionController.getSessionWithStudents);

// Update session details
router.patch('/tutor/sessions/:sessionId', authMiddleware, authorize(['tutor']), upload.single('thumbnail'), tutorSessionController.updateSession);

// Reschedule session
router.patch('/tutor/sessions/:sessionId/reschedule', authMiddleware, authorize(['tutor']), tutorSessionController.rescheduleSession);

// Complete session
router.patch('/tutor/sessions/:sessionId/complete', authMiddleware, authorize(['tutor']), tutorSessionController.completeSession);

// Cancel session
router.patch('/tutor/sessions/:sessionId/cancel', authMiddleware, authorize(['tutor']), tutorSessionController.cancelSession);

// Remove student from session
router.patch('/tutor/sessions/:sessionId/remove/:appointmentId', authMiddleware, authorize(['tutor']), tutorSessionController.removeStudentFromSession);

module.exports = router;
