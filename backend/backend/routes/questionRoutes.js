const express = require('express');
const router = express.Router();
const questionController = require('../controllers/questionController');
const { authMiddleware } = require('../middleware/auth');
const upload = require('../middleware/upload');

const maybeUploadImage = (req, res, next) => {
	const contentType = req.headers['content-type'] || '';
	if (contentType.includes('multipart/form-data')) {
		return upload.single('image')(req, res, next);
	}
	return next();
};

// Question routes
router.post('/', authMiddleware, maybeUploadImage, questionController.createQuestion);
router.get('/', authMiddleware, questionController.getAllQuestions);
router.get('/:id', authMiddleware, questionController.getQuestionById);
router.put('/:id', authMiddleware, questionController.updateQuestion);
router.delete('/:id', authMiddleware, questionController.deleteQuestion);

// Answer routes
router.post('/:questionId/answers', authMiddleware, questionController.createAnswer);
router.put('/answers/:id', authMiddleware, questionController.updateAnswer);
router.delete('/answers/:id', authMiddleware, questionController.deleteAnswer);
router.patch('/answers/:id/helpful', authMiddleware, questionController.markAnswerHelpful);
router.patch('/answers/:id/accept', authMiddleware, questionController.markAnswerAccepted);

module.exports = router;
