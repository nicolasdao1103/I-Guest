// models/Game.js
const mongoose = require('mongoose');

const PlayerResultSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, required: true },
    score: { type: Number, required: true },
    // Bạn có thể thêm các thông tin khác như các câu trả lời của họ
});

const GameSchema = new mongoose.Schema({
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pin: { type: String, required: true },
    finalScores: [PlayerResultSchema],
    playedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Game', GameSchema);