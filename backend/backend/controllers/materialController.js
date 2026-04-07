const StudyMaterial = require('../models/StudyMaterial');
const Subject = require('../models/Subject');
const Topic = require('../models/Topic');
const fs = require('fs');
const path = require('path');

// Upload Study Material
exports.uploadMaterial = async (req, res) => {
  try {
    const uploadedFile = req.file || (req.files?.file ? req.files.file[0] : null);
    const thumbnailFile = req.files?.thumbnail ? req.files.thumbnail[0] : null;

    if (!uploadedFile) {
      return res.status(400).json({ message: 'No file provided' });
    }

    if (thumbnailFile && !thumbnailFile.mimetype.startsWith('image/')) {
      return res.status(400).json({ message: 'Thumbnail must be an image file' });
    }

    const { subject, topic, title, description } = req.body;

    const materialData = {
      title,
      description,
      subject,
      thumbnailUrl: thumbnailFile ? `/uploads/${thumbnailFile.filename}` : '',
      fileUrl: `/uploads/${uploadedFile.filename}`,
      fileName: uploadedFile.originalname,
      fileType: uploadedFile.mimetype.split('/')[1],
      fileSize: uploadedFile.size,
      uploadedBy: req.user.id
    };

    // only include topic if provided
    if (topic) materialData.topic = topic;

    const material = new StudyMaterial(materialData);

    await material.save();

    // Add material to topic if topic provided
    if (topic) {
      await Topic.findByIdAndUpdate(
        topic,
        { $push: { materials: material._id } },
        { new: true }
      );
    }

    res.status(201).json({
      message: 'Material uploaded successfully',
      material
    });
  } catch (error) {
    // Delete uploaded file if error occurs
    const filesToCleanup = [];
    if (req.file) filesToCleanup.push(req.file.filename);
    if (req.files?.file?.[0]) filesToCleanup.push(req.files.file[0].filename);
    if (req.files?.thumbnail?.[0]) filesToCleanup.push(req.files.thumbnail[0].filename);

    filesToCleanup.forEach((fileName) => {
      const fullPath = path.join(__dirname, '../uploads/', fileName);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    });

    res.status(500).json({ message: error.message });
  }
};

// Get materials by subject
exports.getMaterialsBySubject = async (req, res) => {
  try {
    const materials = await StudyMaterial.find({ subject: req.params.subjectId })
      .populate('uploadedBy', 'name email');
    res.status(200).json(materials);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get materials by topic
exports.getMaterialsByTopic = async (req, res) => {
  try {
    const materials = await StudyMaterial.find({ topic: req.params.topicId })
      .populate('uploadedBy', 'name email');
    res.status(200).json(materials);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all materials
exports.getAllMaterials = async (req, res) => {
  try {
    const materials = await StudyMaterial.find({ isPublished: true })
      .populate('subject', 'name')
      .populate('topic', 'name')
      .populate('uploadedBy', 'name email');
    res.status(200).json(materials);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get material by ID
exports.getMaterialById = async (req, res) => {
  try {
    const material = await StudyMaterial.findByIdAndUpdate(
      req.params.id,
      { $inc: { downloads: 1 } },
      { new: true }
    )
    .populate('uploadedBy', 'name email')
    .populate('subject', 'name')
    .populate('topic', 'name');

    if (!material) {
      return res.status(404).json({ message: 'Material not found' });
    }

    res.status(200).json(material);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Material
exports.updateMaterial = async (req, res) => {
  try {
    const { title, description, isPublished } = req.body;

    const thumbnailFile = req.files?.thumbnail ? req.files.thumbnail[0] : null;
    if (thumbnailFile && !thumbnailFile.mimetype.startsWith('image/')) {
      return res.status(400).json({ message: 'Thumbnail must be an image file' });
    }

    const existing = await StudyMaterial.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: 'Material not found' });
    }

    const updateData = { updatedAt: Date.now() };
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (isPublished !== undefined) updateData.isPublished = isPublished;

    if (thumbnailFile) {
      updateData.thumbnailUrl = `/uploads/${thumbnailFile.filename}`;
    }

    const material = await StudyMaterial.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (thumbnailFile && existing.thumbnailUrl) {
      const oldThumbnailPath = path.join(__dirname, '../' + existing.thumbnailUrl);
      if (fs.existsSync(oldThumbnailPath)) {
        fs.unlinkSync(oldThumbnailPath);
      }
    }

    res.status(200).json({
      message: 'Material updated successfully',
      material
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete Material
exports.deleteMaterial = async (req, res) => {
  try {
    const material = await StudyMaterial.findById(req.params.id);

    if (!material) {
      return res.status(404).json({ message: 'Material not found' });
    }

    // Delete file from server
    const filePath = path.join(__dirname, '../' + material.fileUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    if (material.thumbnailUrl) {
      const thumbnailPath = path.join(__dirname, '../' + material.thumbnailUrl);
      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
      }
    }

    await StudyMaterial.findByIdAndDelete(req.params.id);

    // Remove material from topic if set
    if (material.topic) {
      await Topic.findByIdAndUpdate(
        material.topic,
        { $pull: { materials: req.params.id } }
      );
    }

    res.status(200).json({ message: 'Material deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Download Material (increment download count)
exports.downloadMaterial = async (req, res) => {
  try {
    const material = await StudyMaterial.findById(req.params.id);

    if (!material) {
      return res.status(404).json({ message: 'Material not found' });
    }

    const filePath = path.join(__dirname, '../' + material.fileUrl);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    res.download(filePath, material.fileName);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
