const Question = require('../models/Question');
const Answer = require('../models/Answer');

// Create Question
exports.createQuestion = async (req, res) => {
  try {
    const { subject, topic, title, description, questionType } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (!title || !description || !subject) {
      return res.status(400).json({ message: 'Title, description, and subject are required' });
    }

    const normalizedTopic = topic && topic.trim() ? topic : undefined;

    const question = new Question({
      asker: req.user.id,
      subject,
      topic: normalizedTopic,
      title,
      description,
      imageUrl,
      questionType: questionType || 'text'
    });

    await question.save();

    res.status(201).json({
      message: 'Question created successfully',
      question
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all questions
exports.getAllQuestions = async (req, res) => {
  try {
    const { subject, status } = req.query;
    let filter = {};

    if (subject) filter.subject = subject;
    if (status) filter.status = status;

    const questions = await Question.find(filter)
      .populate('asker', 'name profilePicture')
      .populate('subject', 'name')
      .populate('topic', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json(questions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get question by ID
exports.getQuestionById = async (req, res) => {
  try {
    const question = await Question.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    )
    .populate('asker', 'name profilePicture email')
    .populate('subject', 'name')
    .populate('topic', 'name');

    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    // Get answers for this question
    const answers = await Answer.find({ question: req.params.id })
      .populate('answerer', 'name profilePicture role')
      .sort({ isAccepted: -1, helpfulCount: -1 });

    res.status(200).json({
      question,
      answers
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Question
exports.updateQuestion = async (req, res) => {
  try {
    const { title, description } = req.body;
    const question = await Question.findById(req.params.id);

    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    if (question.asker.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only the asker can update this question' });
    }

    question.title = title ?? question.title;
    question.description = description ?? question.description;
    question.updatedAt = Date.now();

    await question.save();

    res.status(200).json({
      message: 'Question updated successfully',
      question
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete Question
exports.deleteQuestion = async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);

    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    if (question.asker.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only the asker can delete this question' });
    }

    await Question.findByIdAndDelete(req.params.id);

    // Delete all answers
    await Answer.deleteMany({ question: req.params.id });

    res.status(200).json({ message: 'Question deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create Answer
exports.createAnswer = async (req, res) => {
  try {
    const { content } = req.body;
    const { questionId } = req.params;

    const answer = new Answer({
      question: questionId,
      answerer: req.user.id,
      content
    });

    await answer.save();

    // Update question status
    await Question.findByIdAndUpdate(questionId, { status: 'answered' });

    res.status(201).json({
      message: 'Answer created successfully',
      answer
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Answer
exports.updateAnswer = async (req, res) => {
  try {
    const { content } = req.body;
    const answer = await Answer.findById(req.params.id);

    if (!answer) {
      return res.status(404).json({ message: 'Answer not found' });
    }

    if (answer.answerer.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only the answerer can update this answer' });
    }

    answer.content = content ?? answer.content;
    answer.updatedAt = Date.now();
    await answer.save();

    res.status(200).json({
      message: 'Answer updated successfully',
      answer
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete Answer
exports.deleteAnswer = async (req, res) => {
  try {
    const answer = await Answer.findById(req.params.id);

    if (!answer) {
      return res.status(404).json({ message: 'Answer not found' });
    }

    if (answer.answerer.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only the answerer can delete this answer' });
    }

    await Answer.findByIdAndDelete(req.params.id);

    res.status(200).json({ message: 'Answer deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark answer as helpful
exports.markAnswerHelpful = async (req, res) => {
  try {
    const answer = await Answer.findById(req.params.id);

    if (!answer) {
      return res.status(404).json({ message: 'Answer not found' });
    }

    // Check if user already voted
    if (answer.helpfulVotes.includes(req.user.id)) {
      answer.helpfulVotes = answer.helpfulVotes.filter(
        id => id.toString() !== req.user.id
      );
      answer.helpfulCount--;
    } else {
      answer.helpfulVotes.push(req.user.id);
      answer.helpfulCount++;
    }

    await answer.save();

    res.status(200).json({
      message: 'Vote recorded',
      answer
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark answer as accepted
exports.markAnswerAccepted = async (req, res) => {
  try {
    const answer = await Answer.findById(req.params.id);

    if (!answer) {
      return res.status(404).json({ message: 'Answer not found' });
    }

    // Only question asker can mark as accepted
    const question = await Question.findById(answer.question);
    if (question.asker.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only question asker can accept answers' });
    }

    answer.isAccepted = !answer.isAccepted;
    await answer.save();

    res.status(200).json({
      message: 'Answer marked as accepted',
      answer
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
