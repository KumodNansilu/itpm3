const express = require('express');
const router = express.Router();
const planController = require('../controllers/planController');
const { authMiddleware } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Routes
router.post('/', authMiddleware, upload.single('thumbnail'), planController.createPlan);
router.get('/', authMiddleware, planController.getStudentPlans);
router.get('/range', authMiddleware, planController.getPlansByDateRange);
router.put('/:id', authMiddleware, planController.updatePlan);
router.patch('/:id/complete', authMiddleware, planController.completePlan);
router.delete('/:id', authMiddleware, planController.deletePlan);
router.get('/progress/summary', authMiddleware, planController.getLearningProgress);

module.exports = router;
