const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authMiddleware, authorize } = require('../middleware/auth');

// Routes
router.get('/:id', authMiddleware, userController.getUserProfile);
router.put('/profile/update', authMiddleware, userController.updateProfile);
router.get('/all/users', authMiddleware, authorize(['admin']), userController.getAllUsers);
router.get('/tutors/all', authMiddleware, userController.getAllTutors);
router.delete('/account/deactivate', authMiddleware, userController.deactivateAccount);

module.exports = router;
