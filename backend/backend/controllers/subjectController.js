const Subject = require('../models/Subject');
const Topic = require('../models/Topic');

// Create Subject
exports.createSubject = async (req, res) => {
  try {
    const { name, description, code, academicFaculty, degreeName, year, semester } = req.body;

    const subject = new Subject({
      name,
      description,
      code,
      academicFaculty,
      degreeName,
      year,
      semester,
      createdBy: req.user.id
    });

    await subject.save();
    res.status(201).json({
      message: 'Subject created successfully',
      subject
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all subjects
exports.getAllSubjects = async (req, res) => {
  try {
    const subjects = await Subject.find().populate('topics').populate('createdBy', 'name email');
    res.status(200).json(subjects);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get subject by ID
exports.getSubjectById = async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id)
      .populate({
        path: 'topics',
        populate: { path: 'materials' }
      })
      .populate('createdBy', 'name email');
    
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }
    res.status(200).json(subject);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Subject
exports.updateSubject = async (req, res) => {
  try {
    const { name, description, code, academicFaculty, degreeName, year, semester } = req.body;

    const subject = await Subject.findByIdAndUpdate(
      req.params.id,
      { name, description, code, academicFaculty, degreeName, year, semester, updatedAt: Date.now() },
      { new: true }
    );

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    res.status(200).json({
      message: 'Subject updated successfully',
      subject
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete Subject
exports.deleteSubject = async (req, res) => {
  try {
    const subject = await Subject.findByIdAndDelete(req.params.id);
    
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    // Delete all topics in this subject
    await Topic.deleteMany({ subject: req.params.id });

    res.status(200).json({ message: 'Subject deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create Topic
exports.createTopic = async (req, res) => {
  try {
    const { name, description, subject } = req.body;

    const topic = new Topic({
      name,
      description,
      subject
    });

    await topic.save();

    // Add topic to subject
    await Subject.findByIdAndUpdate(
      subject,
      { $push: { topics: topic._id } },
      { new: true }
    );

    res.status(201).json({
      message: 'Topic created successfully',
      topic
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get topics by subject
exports.getTopicsBySubject = async (req, res) => {
  try {
    const topics = await Topic.find({ subject: req.params.subjectId })
      .populate('materials');
    res.status(200).json(topics);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Topic
exports.updateTopic = async (req, res) => {
  try {
    const { name, description } = req.body;

    const topic = await Topic.findByIdAndUpdate(
      req.params.id,
      { name, description, updatedAt: Date.now() },
      { new: true }
    );

    if (!topic) {
      return res.status(404).json({ message: 'Topic not found' });
    }

    res.status(200).json({
      message: 'Topic updated successfully',
      topic
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete Topic
exports.deleteTopic = async (req, res) => {
  try {
    const topic = await Topic.findByIdAndDelete(req.params.id);

    if (!topic) {
      return res.status(404).json({ message: 'Topic not found' });
    }

    // Remove topic from subject
    await Subject.findByIdAndUpdate(
      topic.subject,
      { $pull: { topics: req.params.id } }
    );

    res.status(200).json({ message: 'Topic deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
