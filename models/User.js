// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    // Phân biệt vai trò user và host
    role: {
        type: String,
        enum: ['user', 'host'],
        default: 'user'
    }
});

module.exports = mongoose.model('User', UserSchema);