const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    default: ''
  },
  code: {
    type: String,
    required: true,
    unique: true
  },
  academicFaculty: {
    type: String,
    default: ''
  },
  degreeName: {
    type: String,
    default: ''
  },
  year: {
    type: Number,
    min: 1,
    max: 10,
    default: null
  },
  semester: {
    type: Number,
    min: 1,
    max: 4,
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  topics: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Subject', subjectSchema);
