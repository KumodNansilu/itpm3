const Appointment = require('../models/Appointment');
const TutorSession = require('../models/TutorSession');
const User = require('../models/User');
const mongoose = require('mongoose');

const recalculateTutorRating = async (tutorId) => {
  const aggregateResult = await Appointment.aggregate([
    {
      $match: {
        tutor: new mongoose.Types.ObjectId(tutorId),
        'feedback.rating': { $exists: true, $ne: null }
      }
    },
    {
      $group: {
        _id: '$tutor',
        ratingTotal: { $sum: '$feedback.rating' },
        ratingCount: { $sum: 1 }
      }
    }
  ]);

  const ratingSummary = aggregateResult[0] || { ratingTotal: 0, ratingCount: 0 };
  const ratingAverage = ratingSummary.ratingCount > 0
    ? Number((ratingSummary.ratingTotal / ratingSummary.ratingCount).toFixed(2))
    : 0;

  await User.findByIdAndUpdate(tutorId, {
    ratingTotal: ratingSummary.ratingTotal,
    ratingCount: ratingSummary.ratingCount,
    ratingAverage,
    updatedAt: Date.now()
  });

  return { ratingAverage, ratingCount: ratingSummary.ratingCount };
};

// ========== STUDENT: Book a session from available tutor sessions ==========

// Get available tutor sessions (students can view)
exports.getAvailableSessions = async (req, res) => {
  try {
    const { subject, date, topic } = req.query;

    const filter = {
      isAvailable: true,
      status: 'scheduled',
      sessionDate: {
        $gte: new Date(date || new Date())
      }
    };

    if (subject) {
      filter.subject = subject;
    }
    if (topic) {
      filter.topic = topic;
    }

    const sessions = await TutorSession.find(filter)
      .populate('tutor', 'name email specialization phone ratingAverage ratingCount')
      .populate('subject', 'name')
      .populate('topic', 'name')
      .sort({ sessionDate: 1 });

    // Add information about whether session is full
    const sessionsWithCapacity = await Promise.all(
      sessions.map(async (session) => {
        const bookedCount = await Appointment.countDocuments({
          tutorSession: session._id,
          status: 'booked'
        });

        return {
          ...session.toObject(),
          bookedCount,
          availableSlots: session.maxCapacity - bookedCount,
          isFull: bookedCount >= session.maxCapacity,
          slotStatus: bookedCount >= session.maxCapacity ? 'unavailable' : 'available'
        };
      })
    );

    sessionsWithCapacity.sort((a, b) => {
      const ratingDiff = (b.tutor?.ratingAverage || 0) - (a.tutor?.ratingAverage || 0);
      if (ratingDiff !== 0) return ratingDiff;
      return new Date(a.sessionDate) - new Date(b.sessionDate);
    });

    res.status(200).json(sessionsWithCapacity);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single session details
exports.getSessionDetails = async (req, res) => {
  try {
    const session = await TutorSession.findById(req.params.sessionId)
      .populate('tutor', 'name email specialization phone ratingAverage ratingCount')
      .populate('subject', 'name')
      .populate('topic', 'name');

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const bookedCount = await Appointment.countDocuments({
      tutorSession: session._id,
      status: 'booked'
    });

    res.status(200).json({
      ...session.toObject(),
      bookedCount,
      availableSlots: session.maxCapacity - bookedCount,
      isFull: bookedCount >= session.maxCapacity,
      slotStatus: bookedCount >= session.maxCapacity ? 'unavailable' : 'available'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Student: Book a session
exports.bookSession = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const studentId = req.user.id;

    // Check student not already booked
    const existingBooking = await Appointment.findOne({
      tutorSession: sessionId,
      student: studentId,
      status: 'booked'
    });

    if (existingBooking) {
      return res.status(400).json({ message: 'You already booked this session' });
    }

    // Atomically reserve a slot to prevent overbooking under concurrent requests.
    const session = await TutorSession.findOneAndUpdate(
      {
        _id: sessionId,
        isAvailable: true,
        status: 'scheduled',
        $expr: { $lt: ['$bookedCount', '$maxCapacity'] }
      },
      {
        $inc: { bookedCount: 1 },
        $set: { updatedAt: Date.now() }
      },
      { new: true }
    );

    if (!session) {
      return res.status(400).json({
        message: 'Session is not available or already full',
        type: 'capacity_full',
        maxCapacity: null,
        bookedCount: null
      });
    }

    let appointment;
    try {
      appointment = new Appointment({
        tutorSession: sessionId,
        student: studentId,
        tutor: session.tutor,
        subject: session.subject,
        topic: session.topic,
        scheduledDate: session.sessionDate,
        duration: session.duration,
        meetingLink: session.meetingLink,
        status: 'booked'
      });

      await appointment.save();
    } catch (createError) {
      await TutorSession.findByIdAndUpdate(sessionId, {
        $inc: { bookedCount: -1 },
        $set: { isAvailable: true, updatedAt: Date.now() }
      });
      throw createError;
    }

    if (session.bookedCount >= session.maxCapacity) {
      await TutorSession.findByIdAndUpdate(sessionId, {
        isAvailable: false,
        updatedAt: Date.now()
      });
    }

    res.status(201).json({
      message: 'Session booked successfully',
      appointment
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get student's booked sessions
exports.getStudentSessions = async (req, res) => {
  try {
    const appointments = await Appointment.find({
      student: req.user.id,
      status: { $in: ['booked', 'completed'] }
    })
      .populate('tutor', 'name email phone specialization ratingAverage ratingCount')
      .populate('subject', 'name')
      .populate('topic', 'name')
      .populate('tutorSession')
      .sort({ scheduledDate: 1 });

    res.status(200).json(appointments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Student: Cancel booking
exports.cancelBooking = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const studentId = req.user.id;

    const appointment = await Appointment.findById(appointmentId);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check authorization
    if (appointment.student.toString() !== studentId) {
      return res.status(403).json({ message: 'Unauthorized to cancel this appointment' });
    }

    // Check if can still cancel (e.g., not past session time)
    if (new Date() > new Date(appointment.scheduledDate)) {
      return res.status(400).json({ message: 'Cannot cancel past sessions' });
    }

    // Update appointment status
    appointment.status = 'cancelled';
    appointment.updatedAt = Date.now();
    await appointment.save();

    // Update session capacity
    const session = await TutorSession.findById(appointment.tutorSession);
    if (session) {
      session.bookedCount = Math.max(0, session.bookedCount - 1);
      session.isAvailable = true; // Re-open if was full
      await session.save();
    }

    res.status(200).json({
      message: 'Booking cancelled successfully',
      appointment
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ========== TUTOR: Create and manage sessions ==========

// Tutor: Create new session
exports.createSession = async (req, res) => {
  try {
    const { subject, topic, sessionDate, duration, maxCapacity, meetingLink, description } = req.body;
    const tutorId = req.user.id || req.user._id;

    if (!subject || !sessionDate || !maxCapacity) {
      return res.status(400).json({ message: 'Subject, date, and capacity are required' });
    }

    const sessionData = {
      tutor: tutorId,
      subject,
      sessionDate,
      duration: duration || 60,
      maxCapacity
    };

    // Only add optional fields if provided
    if (topic) sessionData.topic = topic;
    if (meetingLink) sessionData.meetingLink = meetingLink;
    if (description) sessionData.description = description;
    if (req.file) sessionData.thumbnailUrl = `/uploads/${req.file.filename}`;

    const session = new TutorSession(sessionData);
    await session.save();

    const populatedSession = await TutorSession.findById(session._id)
      .populate('subject', 'name')
      .populate('topic', 'name');

    res.status(201).json({
      message: 'Session created successfully',
      session: populatedSession
    });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Tutor: Get all their sessions
exports.getTutorSessions = async (req, res) => {
  try {
    const sessions = await TutorSession.find({ tutor: req.user.id })
      .populate('subject', 'name')
      .populate('topic', 'name')
      .sort({ sessionDate: 1 });

    res.status(200).json(sessions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Tutor: Get single session with student list
exports.getSessionWithStudents = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await TutorSession.findById(sessionId)
      .populate('subject', 'name')
      .populate('topic', 'name');

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Check tutor owns this session
    if (session.tutor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Get all booked students
    const bookings = await Appointment.find({
      tutorSession: sessionId,
      status: 'booked'
    }).populate('student', 'name email phone university');

    res.status(200).json({
      session,
      bookings,
      bookedCount: bookings.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Tutor: Update session
exports.updateSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { sessionDate, maxCapacity, meetingLink, description, status } = req.body;

    const session = await TutorSession.findById(sessionId);

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Check authorization
    if (session.tutor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Cannot reduce capacity below already booked count
    if (maxCapacity && maxCapacity < session.bookedCount) {
      return res.status(400).json({
        message: `Cannot reduce capacity below ${session.bookedCount} (current bookings)`
      });
    }

    if (sessionDate) session.sessionDate = sessionDate;
    if (maxCapacity !== undefined) {
      session.maxCapacity = maxCapacity;
      session.isAvailable = session.bookedCount < maxCapacity;
    }
    if (meetingLink) session.meetingLink = meetingLink;
    if (description) session.description = description;
    if (req.file) session.thumbnailUrl = `/uploads/${req.file.filename}`;
    if (status) session.status = status;

    session.updatedAt = Date.now();
    await session.save();

    res.status(200).json({
      message: 'Session updated successfully',
      session
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Tutor: Cancel session (cascades to all bookings)
exports.cancelSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await TutorSession.findById(sessionId);

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Check authorization
    if (session.tutor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Cancel all bookings for this session
    await Appointment.updateMany(
      { tutorSession: sessionId, status: 'booked' },
      { status: 'cancelled' }
    );

    // Mark session as cancelled
    session.status = 'cancelled';
    session.isAvailable = false;
    session.updatedAt = Date.now();
    await session.save();

    res.status(200).json({
      message: 'Session cancelled successfully',
      session
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Tutor: Mark session completed
exports.completeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await TutorSession.findById(sessionId);

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Check authorization
    if (session.tutor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    session.status = 'completed';
    session.isAvailable = false;
    session.updatedAt = Date.now();
    await session.save();

    // Mark all bookings as completed
    await Appointment.updateMany(
      { tutorSession: sessionId, status: 'booked' },
      { status: 'completed' }
    );

    res.status(200).json({
      message: 'Session marked as completed',
      session
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Tutor: Remove a student from session
exports.removeStudentFromSession = async (req, res) => {
  try {
    const { sessionId, appointmentId } = req.params;

    const appointment = await Appointment.findById(appointmentId);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check authorization
    if (appointment.tutor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Update appointment
    appointment.status = 'cancelled';
    await appointment.save();

    // Update session capacity
    const session = await TutorSession.findById(sessionId);
    if (session) {
      session.bookedCount = Math.max(0, session.bookedCount - 1);
      session.isAvailable = true;
      await session.save();
    }

    res.status(200).json({
      message: 'Student removed from session',
      appointment
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Tutor: Reschedule session
exports.rescheduleSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { newDate } = req.body;

    if (!newDate) {
      return res.status(400).json({ message: 'New date is required' });
    }

    const session = await TutorSession.findById(sessionId);

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Check authorization
    if (session.tutor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const oldDate = session.sessionDate;
    session.sessionDate = newDate;
    session.updatedAt = Date.now();
    await session.save();

    // Update all appointments
    await Appointment.updateMany(
      { tutorSession: sessionId },
      { scheduledDate: newDate }
    );

    res.status(200).json({
      message: 'Session rescheduled successfully',
      session,
      oldDate,
      newDate
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Student: Submit feedback for completed/past booking
exports.submitSessionFeedback = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { rating, comment } = req.body;
    const studentId = req.user.id;

    const parsedRating = Number(rating);
    if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({ message: 'Rating must be an integer between 1 and 5' });
    }

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.student.toString() !== studentId) {
      return res.status(403).json({ message: 'Unauthorized to submit feedback for this booking' });
    }

    const sessionHasEnded = new Date() > new Date(appointment.scheduledDate);
    if (appointment.status !== 'completed' && !sessionHasEnded) {
      return res.status(400).json({ message: 'Feedback can only be submitted after the session' });
    }

    appointment.feedback = {
      rating: parsedRating,
      comment: comment ? String(comment).trim() : '',
      submittedAt: new Date()
    };
    appointment.updatedAt = Date.now();
    await appointment.save();

    const ratingSummary = await recalculateTutorRating(appointment.tutor);

    res.status(200).json({
      message: 'Feedback submitted successfully',
      appointment,
      tutorRating: ratingSummary
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
