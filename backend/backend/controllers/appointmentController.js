const Appointment = require('../models/Appointment');
const User = require('../models/User');

// Create Appointment Request
exports.createAppointment = async (req, res) => {
  try {
    const { tutor, subject, topic, scheduledDate, duration, description } = req.body;

    // Check if tutor exists and is a tutor
    const tutorUser = await User.findById(tutor);
    if (!tutorUser || tutorUser.role !== 'tutor') {
      return res.status(400).json({ message: 'Invalid tutor selected' });
    }

    const appointment = new Appointment({
      student: req.user.id,
      tutor,
      subject,
      topic,
      scheduledDate,
      duration: duration || 60,
      description
    });

    await appointment.save();

    res.status(201).json({
      message: 'Appointment request created successfully',
      appointment
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get student appointments
exports.getStudentAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find({ student: req.user.id })
      .populate('tutor', 'name email phone specialization')
      .populate('subject', 'name')
      .populate('topic', 'name')
      .sort({ scheduledDate: 1 });

    res.status(200).json(appointments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get tutor appointments
exports.getTutorAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find({ tutor: req.user.id })
      .populate('student', 'name email phone university')
      .populate('subject', 'name')
      .populate('topic', 'name')
      .sort({ scheduledDate: 1 });

    res.status(200).json(appointments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get appointment by ID
exports.getAppointmentById = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate('student', 'name email phone university')
      .populate('tutor', 'name email phone specialization')
      .populate('subject', 'name')
      .populate('topic', 'name');

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    res.status(200).json(appointment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Approve Appointment (Tutor only)
exports.approveAppointment = async (req, res) => {
  try {
    const { meetingLink } = req.body;

    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      {
        status: 'approved',
        meetingLink,
        updatedAt: Date.now()
      },
      { new: true }
    )
    .populate('student', 'name email')
    .populate('subject', 'name');

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    res.status(200).json({
      message: 'Appointment approved successfully',
      appointment
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Reject Appointment (Tutor only)
exports.rejectAppointment = async (req, res) => {
  try {
    const { notes } = req.body;

    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      {
        status: 'rejected',
        notes,
        updatedAt: Date.now()
      },
      { new: true }
    );

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    res.status(200).json({
      message: 'Appointment rejected',
      appointment
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Cancel Appointment (Student or Tutor)
exports.cancelAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check authorization
    if (appointment.student.toString() !== req.user.id && appointment.tutor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized to cancel this appointment' });
    }

    appointment.status = 'cancelled';
    appointment.updatedAt = Date.now();
    await appointment.save();

    res.status(200).json({
      message: 'Appointment cancelled',
      appointment
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Complete Appointment (Tutor only)
exports.completeAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      {
        status: 'completed',
        updatedAt: Date.now()
      },
      { new: true }
    );

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    res.status(200).json({
      message: 'Appointment marked as completed',
      appointment
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get available time slots for tutor
exports.getAvailableSlots = async (req, res) => {
  try {
    const { tutorId, date } = req.query;

    // Get all appointments for tutor on that date
    const appointments = await Appointment.find({
      tutor: tutorId,
      scheduledDate: {
        $gte: new Date(date).setHours(0, 0, 0, 0),
        $lt: new Date(date).setHours(23, 59, 59, 999)
      },
      status: { $ne: 'cancelled', $ne: 'rejected' }
    });

    // Define available hours (9 AM to 6 PM)
    const availableSlots = [];
    for (let hour = 9; hour < 18; hour++) {
      const slotTime = new Date(date);
      slotTime.setHours(hour, 0, 0, 0);

      const isBooked = appointments.some(apt => {
        const aptStart = new Date(apt.scheduledDate);
        const aptEnd = new Date(aptStart.getTime() + apt.duration * 60000);
        return slotTime >= aptStart && slotTime < aptEnd;
      });

      if (!isBooked) {
        availableSlots.push({
          time: slotTime,
          hour: hour,
          period: hour < 12 ? 'AM' : 'PM'
        });
      }
    }

    res.status(200).json(availableSlots);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
