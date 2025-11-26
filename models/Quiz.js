// models/Quiz.js
const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    options: [{ type: String, required: true }], // Mảng các đáp án
    correctAnswerIndex: { type: Number, required: true },
    type: { type: String, enum: ['multiple-choice', 'true-false'], default: 'multiple-choice' }
});

const QuizSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Tham chiếu tới model User
        required: true
    },
    questions: [QuestionSchema] // Mảng các câu hỏi
});

module.exports = mongoose.model('Quiz', QuizSchema);