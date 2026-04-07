const StudyPlan = require('../models/StudyPlan');
const Topic = require('../models/Topic');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Create Study Plan
exports.createPlan = async (req, res) => {
  try {
    const { subject, topic, topicName, plannedDate, duration, notes } = req.body;

    if (!subject || !plannedDate || !duration) {
      return res.status(400).json({ message: 'Subject, planned date, and duration are required' });
    }

    if (req.file && !req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ message: 'Thumbnail must be an image file' });
    }

    const planData = {
      student: req.user.id,
      subject,
      plannedDate,
      duration,
      notes: notes || '',
      thumbnailUrl: req.file ? `/uploads/${req.file.filename}` : ''
    };

    let resolvedTopicId = null;

    if (topic) {
      resolvedTopicId = topic;
    } else if (topicName && String(topicName).trim()) {
      const normalizedTopicName = String(topicName).trim();
      const existingTopic = await Topic.findOne({
        subject,
        name: { $regex: `^${escapeRegex(normalizedTopicName)}$`, $options: 'i' }
      });

      if (existingTopic) {
        resolvedTopicId = existingTopic._id;
      } else {
        const createdTopic = await Topic.create({
          name: normalizedTopicName,
          subject
        });
        resolvedTopicId = createdTopic._id;
      }
    }

    if (resolvedTopicId) {
      planData.topic = resolvedTopicId;
    }

    const plan = new StudyPlan(planData);
    await plan.save();

    // Populate and return
    const populatedPlan = await StudyPlan.findById(plan._id)
      .populate('subject', 'name')
      .populate('topic', 'name');

    res.status(201).json({
      message: 'Study plan created successfully',
      plan: populatedPlan
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all plans for a student
exports.getStudentPlans = async (req, res) => {
  try {
    const plans = await StudyPlan.find({ student: req.user.id })
      .populate('subject', 'name')
      .populate('topic', 'name')
      .sort({ plannedDate: 1 });

    res.status(200).json(plans);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get plans by date range
exports.getPlansByDateRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const plans = await StudyPlan.find({
      student: req.user.id,
      plannedDate: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    })
    .populate('subject', 'name')
    .populate('topic', 'name')
    .sort({ plannedDate: 1 });

    res.status(200).json(plans);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark plan as completed
exports.completePlan = async (req, res) => {
  try {
    const plan = await StudyPlan.findByIdAndUpdate(
      req.params.id,
      {
        status: 'completed',
        completedAt: Date.now(),
        updatedAt: Date.now()
      },
      { new: true }
    ).populate('subject', 'name').populate('topic', 'name');

    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    res.status(200).json({
      message: 'Plan marked as completed',
      plan
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Study Plan
exports.updatePlan = async (req, res) => {
  try {
    const { subject, topic, plannedDate, duration, notes, status } = req.body;

    const plan = await StudyPlan.findByIdAndUpdate(
      req.params.id,
      {
        subject,
        topic,
        plannedDate,
        duration,
        notes,
        status,
        updatedAt: Date.now()
      },
      { new: true }
    );

    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    res.status(200).json({
      message: 'Plan updated successfully',
      plan
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete Study Plan
exports.deletePlan = async (req, res) => {
  try {
    const plan = await StudyPlan.findByIdAndDelete(req.params.id);

    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    res.status(200).json({ message: 'Plan deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get learning progress
exports.getLearningProgress = async (req, res) => {
  try {
    const totalPlans = await StudyPlan.countDocuments({ student: req.user.id });
    const completedPlans = await StudyPlan.countDocuments({
      student: req.user.id,
      status: 'completed'
    });

    const plansBySubject = await StudyPlan.aggregate([
      { $match: { student: req.user.id } },
      {
        $group: {
          _id: '$subject',
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          }
        }
      }
    ]);

    res.status(200).json({
      totalPlans,
      completedPlans,
      progressPercentage: totalPlans > 0 ? (completedPlans / totalPlans * 100).toFixed(2) : 0,
      plansBySubject
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
