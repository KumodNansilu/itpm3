const MCQ = require('../models/MCQ');
const MCQAttempt = require('../models/MCQAttempt');
const MockExamAttempt = require('../models/MockExamAttempt');

const validateMCQOptions = (options) => {
  if (!Array.isArray(options) || options.length !== 4) {
    return 'Exactly 4 options are required (A, B, C, D)';
  }

  const emptyOption = options.some(opt => !opt || typeof opt.text !== 'string' || !opt.text.trim());
  if (emptyOption) {
    return 'All options must include non-empty text';
  }

  const correctCount = options.filter(opt => opt.isCorrect).length;
  if (correctCount !== 1) {
    return 'Exactly one option must be marked as correct';
  }

  return null;
};

const buildFeedback = (percentage) => {
  if (percentage >= 80) return 'Excellent work. You have strong understanding of this topic.';
  if (percentage >= 60) return 'Good effort. Review incorrect answers to improve your score.';
  return 'Keep practicing. Focus on the explanations and retry the mock exam.';
};

// Get all MCQs (optional filters)
exports.getAllMCQs = async (req, res) => {
  try {
    const { subjectId, topicId, mine } = req.query;
    const filter = {};

    if (subjectId) filter.subject = subjectId;
    if (topicId) filter.topic = topicId;
    if (mine === 'true' && ['tutor', 'admin'].includes(req.user.role)) {
      filter.createdBy = req.user.id;
    }

    const mcqs = await MCQ.find(filter)
      .populate('createdBy', 'name email')
      .populate('subject', 'name')
      .populate('topic', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json(mcqs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create MCQ Question (Tutor Only)
exports.createMCQ = async (req, res) => {
  try {
    const { question, subject, topic, options, explanation, difficulty } = req.body;

    const optionError = validateMCQOptions(options);
    if (optionError) {
      return res.status(400).json({ message: optionError });
    }

    const mcqPayload = {
      question,
      subject,
      options,
      explanation,
      difficulty,
      createdBy: req.user.id
    };

    // Topic is optional for MCQs.
    if (topic) {
      mcqPayload.topic = topic;
    }

    const mcq = new MCQ(mcqPayload);

    await mcq.save();

    res.status(201).json({
      message: 'MCQ created successfully',
      mcq
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all MCQs by subject
exports.getMCQsBySubject = async (req, res) => {
  try {
    const mcqs = await MCQ.find({ subject: req.params.subjectId })
      .populate('createdBy', 'name email')
      .populate('topic', 'name');

    res.status(200).json(mcqs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all MCQs by topic
exports.getMCQsByTopic = async (req, res) => {
  try {
    const mcqs = await MCQ.find({ topic: req.params.topicId })
      .populate('createdBy', 'name email')
      .populate('subject', 'name');

    res.status(200).json(mcqs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get MCQ by ID (without showing correct answers)
exports.getMCQById = async (req, res) => {
  try {
    const mcq = await MCQ.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('subject', 'name')
      .populate('topic', 'name');

    if (!mcq) {
      return res.status(404).json({ message: 'MCQ not found' });
    }

    // Hide correct answer when fetching for students
    const mcqData = mcq.toObject();
    const hideAnswers = req.query.hideAnswers !== 'false';
    
    if (hideAnswers) {
      mcqData.options = mcqData.options.map(opt => ({
        text: opt.text,
        _id: opt._id
      }));
      mcqData.explanation = null;
    }

    res.status(200).json(mcqData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update MCQ
exports.updateMCQ = async (req, res) => {
  try {
    const { question, topic, options, explanation, difficulty } = req.body;

    const optionError = validateMCQOptions(options);
    if (optionError) {
      return res.status(400).json({ message: optionError });
    }

    const updatePayload = {
      question,
      options,
      explanation,
      difficulty,
      updatedAt: Date.now()
    };

    // Allow clearing topic explicitly by sending empty value.
    if (topic) {
      updatePayload.topic = topic;
    } else if (Object.prototype.hasOwnProperty.call(req.body, 'topic')) {
      updatePayload.topic = null;
    }

    const mcq = await MCQ.findByIdAndUpdate(req.params.id, updatePayload, { new: true });

    if (!mcq) {
      return res.status(404).json({ message: 'MCQ not found' });
    }

    res.status(200).json({
      message: 'MCQ updated successfully',
      mcq
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete MCQ
exports.deleteMCQ = async (req, res) => {
  try {
    const mcq = await MCQ.findByIdAndDelete(req.params.id);

    if (!mcq) {
      return res.status(404).json({ message: 'MCQ not found' });
    }

    // Delete all attempts
    await MCQAttempt.deleteMany({ mcq: req.params.id });

    res.status(200).json({ message: 'MCQ deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Submit MCQ Answer
exports.submitMCQAnswer = async (req, res) => {
  try {
    const { selectedOption } = req.body;
    const { mcqId } = req.params;

    const mcq = await MCQ.findById(mcqId);
    if (!mcq) {
      return res.status(404).json({ message: 'MCQ not found' });
    }

    const isCorrect = mcq.options[selectedOption]?.isCorrect || false;

    const attempt = new MCQAttempt({
      student: req.user.id,
      mcq: mcqId,
      selectedOption,
      isCorrect
    });

    await attempt.save();

    // Return result without revealing answer
    res.status(201).json({
      message: 'Answer submitted',
      attempt: {
        _id: attempt._id,
        isCorrect: attempt.isCorrect,
        selectedOption: attempt.selectedOption
      },
      feedback: {
        isCorrect,
        explanation: mcq.explanation,
        correctOption: mcq.options.findIndex(opt => opt.isCorrect)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get user's MCQ attempts
exports.getUserMCQAttempts = async (req, res) => {
  try {
    const { subject, topic } = req.query;
    let filter = { student: req.user.id };

    if (subject) {
      const mcqs = await MCQ.find({ subject });
      const mcqIds = mcqs.map(m => m._id);
      filter.mcq = { $in: mcqIds };
    }

    const attempts = await MCQAttempt.find(filter)
      .populate({
        path: 'mcq',
        populate: [
          { path: 'subject', select: 'name' },
          { path: 'topic', select: 'name' }
        ]
      })
      .sort({ attemptedAt: -1 });

    res.status(200).json(attempts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get quiz score
exports.getQuizScore = async (req, res) => {
  try {
    const { subjectId, topicId } = req.query;

    let filter = { student: req.user.id };

    if (subjectId || topicId) {
      const mcqFilter = {};
      if (subjectId) mcqFilter.subject = subjectId;
      if (topicId) mcqFilter.topic = topicId;

      const mcqs = await MCQ.find(mcqFilter);
      const mcqIds = mcqs.map(m => m._id);
      filter.mcq = { $in: mcqIds };
    }

    const attempts = await MCQAttempt.find(filter);

    const totalAttempts = attempts.length;
    const correctAttempts = attempts.filter(a => a.isCorrect).length;

    res.status(200).json({
      totalAttempts,
      correctAttempts,
      incorrectAttempts: totalAttempts - correctAttempts,
      scorePercentage: totalAttempts > 0 ? ((correctAttempts / totalAttempts) * 100).toFixed(2) : 0
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Start mock exam with up to 10 random MCQs
exports.startMockExam = async (req, res) => {
  try {
    const { subjectId, topicId } = req.query;

    if (!subjectId) {
      return res.status(400).json({ message: 'subjectId is required' });
    }

    const filter = { subject: subjectId };
    if (topicId) {
      filter.topic = topicId;
    }

    const totalAvailable = await MCQ.countDocuments(filter);
    if (totalAvailable === 0) {
      return res.status(404).json({ message: 'No MCQs available for selected subject/topic' });
    }

    const questionLimit = Math.min(10, totalAvailable);
    const allMcqs = await MCQ.find(filter).lean();
    const shuffled = allMcqs.sort(() => Math.random() - 0.5);
    const mcqs = shuffled.slice(0, questionLimit);

    const examQuestions = mcqs.map(mcq => ({
      _id: mcq._id,
      question: mcq.question,
      subject: mcq.subject,
      topic: mcq.topic,
      difficulty: mcq.difficulty,
      options: mcq.options.map(option => ({ text: option.text }))
    }));

    res.status(200).json({
      message: 'Mock exam ready',
      totalQuestions: examQuestions.length,
      questions: examQuestions
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Submit mock exam and auto-mark answers
exports.submitMockExam = async (req, res) => {
  try {
    const { subjectId, topicId, answers } = req.body;

    if (!subjectId || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ message: 'subjectId and answers are required' });
    }

    if (answers.length > 10) {
      return res.status(400).json({ message: 'Maximum 10 questions are allowed per mock exam' });
    }

    const mcqIds = answers.map(answer => answer.mcqId);
    const mcqs = await MCQ.find({ _id: { $in: mcqIds } });

    if (mcqs.length !== mcqIds.length) {
      return res.status(400).json({ message: 'Some questions are invalid or unavailable' });
    }

    const mcqMap = new Map(mcqs.map(mcq => [mcq._id.toString(), mcq]));
    let correctAnswers = 0;

    const detailedAnswers = answers.map(answer => {
      const mcq = mcqMap.get(answer.mcqId);
      const correctOption = mcq.options.findIndex(opt => opt.isCorrect);
      const selectedOption = Number.isInteger(answer.selectedOption) ? answer.selectedOption : -1;
      const isCorrect = selectedOption === correctOption;

      if (isCorrect) {
        correctAnswers += 1;
      }

      return {
        mcq: mcq._id,
        question: mcq.question,
        options: mcq.options.map(opt => opt.text),
        selectedOption,
        correctOption,
        isCorrect,
        explanation: mcq.explanation || ''
      };
    });

    const totalQuestions = detailedAnswers.length;
    const wrongAnswers = totalQuestions - correctAnswers;
    const scorePercentage = Number(((correctAnswers / totalQuestions) * 100).toFixed(2));
    const feedback = buildFeedback(scorePercentage);

    const attempt = await MockExamAttempt.create({
      student: req.user.id,
      subject: subjectId,
      topic: topicId || null,
      totalQuestions,
      correctAnswers,
      wrongAnswers,
      scorePercentage,
      feedback,
      answers: detailedAnswers
    });

    res.status(201).json({
      message: 'Mock exam submitted successfully',
      result: {
        attemptId: attempt._id,
        totalQuestions,
        correctAnswers,
        wrongAnswers,
        scorePercentage,
        feedback,
        answers: detailedAnswers
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get student's previous mock exam attempts
exports.getMyMockExamAttempts = async (req, res) => {
  try {
    const attempts = await MockExamAttempt.find({ student: req.user.id })
      .populate('subject', 'name')
      .populate('topic', 'name')
      .sort({ attemptedAt: -1 });

    res.status(200).json(attempts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
