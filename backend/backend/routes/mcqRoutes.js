const express = require('express');
const router = express.Router();
const mcqController = require('../controllers/mcqController');
const { authMiddleware, authorize } = require('../middleware/auth');

// MCQ routes
router.get('/', authMiddleware, mcqController.getAllMCQs);
router.post('/', authMiddleware, authorize(['tutor', 'admin']), mcqController.createMCQ);
router.get('/subject/:subjectId', authMiddleware, mcqController.getMCQsBySubject);
router.get('/topic/:topicId', authMiddleware, mcqController.getMCQsByTopic);
router.get('/exam/start', authMiddleware, authorize(['student']), mcqController.startMockExam);
router.post('/exam/submit', authMiddleware, authorize(['student']), mcqController.submitMockExam);
router.get('/exam/attempts/my', authMiddleware, authorize(['student']), mcqController.getMyMockExamAttempts);
router.get('/:id', authMiddleware, mcqController.getMCQById);
router.put('/:id', authMiddleware, authorize(['tutor', 'admin']), mcqController.updateMCQ);
router.delete('/:id', authMiddleware, authorize(['tutor', 'admin']), mcqController.deleteMCQ);

// Student submission routes
router.post('/:mcqId/submit', authMiddleware, mcqController.submitMCQAnswer);
router.get('/attempts/my', authMiddleware, mcqController.getUserMCQAttempts);
router.get('/score/summary', authMiddleware, mcqController.getQuizScore);

module.exports = router;
