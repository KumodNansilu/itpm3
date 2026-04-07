const express = require('express');
const router = express.Router();
const subjectController = require('../controllers/subjectController');
const { authMiddleware, authorize } = require('../middleware/auth');

// Subject routes
router.post('/', authMiddleware, authorize(['tutor', 'admin']), subjectController.createSubject);
router.get('/', authMiddleware, subjectController.getAllSubjects);
router.get('/:id', authMiddleware, subjectController.getSubjectById);
router.put('/:id', authMiddleware, authorize(['tutor', 'admin']), subjectController.updateSubject);
router.delete('/:id', authMiddleware, authorize(['tutor', 'admin']), subjectController.deleteSubject);

// Topic routes
router.post('/topics/create', authMiddleware, authorize(['tutor', 'admin']), subjectController.createTopic);
router.get('/:subjectId/topics', authMiddleware, subjectController.getTopicsBySubject);
router.put('/topics/:id', authMiddleware, authorize(['tutor', 'admin']), subjectController.updateTopic);
router.delete('/topics/:id', authMiddleware, authorize(['tutor', 'admin']), subjectController.deleteTopic);

module.exports = router;
