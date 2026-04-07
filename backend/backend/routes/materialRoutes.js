const express = require('express');
const router = express.Router();
const materialController = require('../controllers/materialController');
const { authMiddleware, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Routes
router.post('/upload', authMiddleware, authorize(['tutor', 'admin']), upload.fields([{ name: 'file', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), materialController.uploadMaterial);
router.get('/', authMiddleware, materialController.getAllMaterials);
router.get('/subject/:subjectId', authMiddleware, materialController.getMaterialsBySubject);
router.get('/topic/:topicId', authMiddleware, materialController.getMaterialsByTopic);
router.get('/:id', authMiddleware, materialController.getMaterialById);
router.put('/:id', authMiddleware, authorize(['tutor', 'admin']), upload.fields([{ name: 'thumbnail', maxCount: 1 }]), materialController.updateMaterial);
router.delete('/:id', authMiddleware, authorize(['tutor', 'admin']), materialController.deleteMaterial);
router.get('/:id/download', authMiddleware, materialController.downloadMaterial);

module.exports = router;
