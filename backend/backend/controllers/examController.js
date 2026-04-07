const Exam = require('../models/Exam');
const MCQ = require('../models/MCQ');
const MockExamAttempt = require('../models/MockExamAttempt');
const fs = require('fs');
const path = require('path');

const parseQuestionsInput = (questions) => {
  if (Array.isArray(questions)) {
    return questions;
  }

  if (typeof questions === 'string') {
    try {
      const parsed = JSON.parse(questions);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  return [];
};

const removeUploadedFileIfExists = (relativePath) => {
  if (!relativePath) return;
  const absolutePath = path.join(__dirname, '..', relativePath.replace(/^\//, ''));
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
};

// Create exam with exactly 10 MCQs
exports.createExam = async (req, res) => {
  try {
    const { name, description, subject, topic, difficulty } = req.body;
    const questions = parseQuestionsInput(req.body.questions);
    const duration = Number(req.body.duration);
    const passingPercentage = Number(req.body.passingPercentage);

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Exam name is required' });
    }

    if (!subject) {
      return res.status(400).json({ message: 'Subject is required' });
    }

    if (req.file && !req.file.mimetype.startsWith('image/')) {
      removeUploadedFileIfExists(`/uploads/${req.file.filename}`);
      return res.status(400).json({ message: 'Thumbnail must be an image file' });
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ message: 'Questions array is required and must not be empty' });
    }

    if (questions.length !== 10) {
      return res.status(400).json({ message: `Exactly 10 MCQ questions are required. You provided ${questions.length}` });
    }

    // Validate all question IDs exist
    const mcqs = await MCQ.find({ _id: { $in: questions } });
    if (mcqs.length !== 10) {
      return res.status(400).json({ message: `${10 - mcqs.length} question(s) do not exist or are invalid` });
    }

    const exam = new Exam({
      name,
      description,
      thumbnailUrl: req.file ? `/uploads/${req.file.filename}` : '',
      subject,
      topic: topic || null,
      questions,
      totalQuestions: 10,
      difficulty: difficulty || 'mixed',
      duration: Number.isFinite(duration) ? duration : 30,
      passingPercentage: Number.isFinite(passingPercentage) ? passingPercentage : 60,
      createdBy: req.user.id
    });

    await exam.save();
    await exam.populate('subject', 'name');
    await exam.populate('topic', 'name');
    await exam.populate('createdBy', 'name email');

    res.status(201).json({
      message: 'Exam created successfully with 10 MCQs',
      exam
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all exams with optional filters
exports.getAllExams = async (req, res) => {
  try {
    const { subject, topic, mine, isPublished } = req.query;
    const filter = {};

    if (subject) filter.subject = subject;
    if (topic) filter.topic = topic;
    if (mine === 'true' && ['tutor', 'admin'].includes(req.user.role)) {
      filter.createdBy = req.user.id;
    }
    if (isPublished === 'true' || isPublished === 'false') {
      filter.isPublished = isPublished === 'true';
    }

    const exams = await Exam.find(filter)
      .populate('subject', 'name')
      .populate('topic', 'name')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json(exams);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get exam by ID with question count (without question details)
exports.getExamById = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('subject', 'name')
      .populate('topic', 'name')
      .populate('createdBy', 'name email');

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    res.status(200).json(exam);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get exam questions for student attempt (without revealing answers)
exports.getExamQuestions = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id).populate({
      path: 'questions',
      select: 'question difficulty options'
    });

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const questionsForStudent = exam.questions.map(mcq => ({
      _id: mcq._id,
      question: mcq.question,
      difficulty: mcq.difficulty,
      options: mcq.options.map(opt => ({ text: opt.text }))
    }));

    res.status(200).json({
      examId: exam._id,
      examName: exam.name,
      totalQuestions: exam.totalQuestions,
      duration: exam.duration,
      questions: questionsForStudent
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update exam (tutor only)
exports.updateExam = async (req, res) => {
  try {
    const { name, description, difficulty } = req.body;
    const questions = parseQuestionsInput(req.body.questions);
    const duration = Number(req.body.duration);
    const passingPercentage = Number(req.body.passingPercentage);

    const exam = await Exam.findById(req.params.id);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    if (req.user.id !== exam.createdBy.toString()) {
      return res.status(403).json({ message: 'You can only edit exams you created' });
    }

    if (req.file && !req.file.mimetype.startsWith('image/')) {
      removeUploadedFileIfExists(`/uploads/${req.file.filename}`);
      return res.status(400).json({ message: 'Thumbnail must be an image file' });
    }

    if (name) exam.name = name;
    if (description !== undefined) exam.description = description;
    if (difficulty) exam.difficulty = difficulty;
    if (Number.isFinite(duration)) exam.duration = duration;
    if (Number.isFinite(passingPercentage)) exam.passingPercentage = passingPercentage;

    if (req.file) {
      removeUploadedFileIfExists(exam.thumbnailUrl);
      exam.thumbnailUrl = `/uploads/${req.file.filename}`;
    }

    // If questions provided, validate exactly 10
    if (questions.length > 0) {
      if (questions.length !== 10) {
        return res.status(400).json({ message: 'Exactly 10 MCQ questions are required' });
      }

      const mcqs = await MCQ.find({ _id: { $in: questions } });
      if (mcqs.length !== 10) {
        return res.status(400).json({ message: 'Some questions do not exist or are invalid' });
      }

      exam.questions = questions;
    }

    exam.updatedAt = Date.now();
    await exam.save();
    await exam.populate('subject', 'name');
    await exam.populate('topic', 'name');
    await exam.populate('createdBy', 'name email');

    res.status(200).json({
      message: 'Exam updated successfully',
      exam
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete exam (tutor only)
exports.deleteExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    if (req.user.id !== exam.createdBy.toString()) {
      return res.status(403).json({ message: 'You can only delete exams you created' });
    }

    removeUploadedFileIfExists(exam.thumbnailUrl);
    await Exam.findByIdAndDelete(req.params.id);

    // Delete all attempt records for this exam
    await MockExamAttempt.deleteMany({ exam: req.params.id });

    res.status(200).json({ message: 'Exam deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Submit exam attempt
exports.submitExamAttempt = async (req, res) => {
  try {
    const examId = req.params.id || req.body.examId;
    const { answers } = req.body;

    if (!examId || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ message: 'examId and answers are required' });
    }

    const exam = await Exam.findById(examId).populate('questions');

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    if (exam.questions.length !== answers.length) {
      return res.status(400).json({ message: 'Answer count does not match question count' });
    }

    const mcqMap = new Map(exam.questions.map(mcq => [mcq._id.toString(), mcq]));
    let correctAnswers = 0;

    const detailedAnswers = answers.map(answer => {
      const mcq = mcqMap.get(answer.mcqId);
      if (!mcq) {
        throw new Error(`Question ${answer.mcqId} not found in exam`);
      }

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

    const totalQuestions = exam.totalQuestions;
    const wrongAnswers = totalQuestions - correctAnswers;
    const scorePercentage = Number(((correctAnswers / totalQuestions) * 100).toFixed(2));
    const isPassed = scorePercentage >= exam.passingPercentage;

    let feedback = 'Review your answers and try again.';
    if (scorePercentage >= 80) {
      feedback = 'Excellent work. You have strong understanding.';
    } else if (scorePercentage >= 60) {
      feedback = 'Good effort. Review incorrect answers to improve.';
    }

    const attempt = await MockExamAttempt.create({
      student: req.user.id,
      subject: exam.subject,
      topic: exam.topic || null,
      exam: examId,
      totalQuestions,
      correctAnswers,
      wrongAnswers,
      scorePercentage,
      feedback,
      isPassed,
      answers: detailedAnswers
    });

    res.status(201).json({
      message: 'Exam submitted successfully',
      result: {
        attemptId: attempt._id,
        examName: exam.name,
        totalQuestions,
        correctAnswers,
        wrongAnswers,
        scorePercentage,
        isPassed,
        passingPercentage: exam.passingPercentage,
        feedback,
        answers: detailedAnswers
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get student's exam attempts
exports.getStudentExamAttempts = async (req, res) => {
  try {
    const attempts = await MockExamAttempt.find({ student: req.user.id, exam: { $exists: true, $ne: null } })
      .populate('exam', 'name')
      .populate('subject', 'name')
      .populate('topic', 'name')
      .sort({ attemptedAt: -1 });

    res.status(200).json(attempts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
