const express = require('express');
const router = express.Router();
const examController = require('../controllers/examController');
const { authMiddleware, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Tutor: Create exam with 10 MCQs
router.post('/', authMiddleware, authorize(['tutor', 'admin']), upload.single('thumbnail'), examController.createExam);

// Get all exams (with filters)
router.get('/', authMiddleware, examController.getAllExams);

// Get specific exam by ID
router.get('/:id', authMiddleware, examController.getExamById);

// Get exam questions for student attempt (without answers)
router.get('/:id/questions', authMiddleware, examController.getExamQuestions);

// Tutor: Update exam
router.put('/:id', authMiddleware, authorize(['tutor', 'admin']), upload.single('thumbnail'), examController.updateExam);

// Tutor: Delete exam
router.delete('/:id', authMiddleware, authorize(['tutor', 'admin']), examController.deleteExam);

// Student: Submit exam attempt and auto-mark
router.post('/:id/submit', authMiddleware, authorize(['student']), examController.submitExamAttempt);

// Student: Get my exam attempts
router.get('/attempts/my', authMiddleware, authorize(['student']), examController.getStudentExamAttempts);

module.exports = router;
