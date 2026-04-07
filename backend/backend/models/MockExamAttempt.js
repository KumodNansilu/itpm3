const mongoose = require('mongoose');

const examAnswerSchema = new mongoose.Schema({
  mcq: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MCQ',
    required: true
  },
  question: {
    type: String,
    required: true
  },
  options: [{
    type: String,
    required: true
  }],
  selectedOption: {
    type: Number,
    default: -1
  },
  correctOption: {
    type: Number,
    required: true
  },
  isCorrect: {
    type: Boolean,
    required: true
  },
  explanation: {
    type: String,
    default: ''
  }
}, { _id: false });

const mockExamAttemptSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  exam: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    default: null
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  topic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    default: null
  },
  totalQuestions: {
    type: Number,
    required: true
  },
  correctAnswers: {
    type: Number,
    required: true
  },
  wrongAnswers: {
    type: Number,
    required: true
  },
  scorePercentage: {
    type: Number,
    required: true
  },
  feedback: {
    type: String,
    required: true
  },
  isPassed: {
    type: Boolean,
    default: false
  },
  answers: [examAnswerSchema],
  attemptedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('MockExamAttempt', mockExamAttemptSchema);
