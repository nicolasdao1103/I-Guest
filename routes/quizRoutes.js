// routes/quizRoutes.js

const express = require('express');
const router = express.Router();
const Quiz = require('../models/Quiz');

// --- Middleware kiểm tra quyền Host ---
const isHost = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'host') {
        return next();
    }
    // Nếu không phải host, không có quyền truy cập
    res.status(403).send('Bạn không có quyền truy cập vào trang này.');
};

// --- GET: Hiển thị trang tạo quiz ---
// Áp dụng cả 2 middleware: phải đăng nhập VÀ phải là host
router.get('/create', isHost, (req, res) => {
    res.render('create-quiz', { user: req.session.user });
});

// --- POST: Xử lý việc tạo quiz ---
router.post('/create', isHost, async (req, res) => {
    const { title, questions } = req.body;
    
    // Chuyển đổi dữ liệu từ form thành cấu trúc mà Schema yêu cầu
    const formattedQuestions = questions.map(q => ({
        title: q.title,
        options: q.options,
        correctAnswerIndex: q.correctAnswer // tên của radio button là correctAnswer
    }));
    
    try {
        const newQuiz = new Quiz({
            title,
            questions: formattedQuestions,
            createdBy: req.session.user.id
        });

        await newQuiz.save();
        res.redirect('/host-dashboard'); // Tạo thành công, quay về dashboard

    } catch(err) {
        console.error(err);
        // Có thể thêm trang báo lỗi ở đây
        res.status(500).send("Lỗi khi tạo quiz.");
    }
});

// --- GET: Hiển thị trang Sửa Quiz ---
router.get('/edit/:id', isHost, async (req, res) => {
    try {
        // Tìm quiz theo ID và đảm bảo người sửa là người tạo
        const quiz = await Quiz.findOne({ _id: req.params.id, createdBy: req.session.user.id }).lean();
        
        if (!quiz || quiz.createdBy.toString() !== req.session.user.id) {
            return res.status(404).send("Không tìm thấy bộ câu hỏi hoặc bạn không có quyền sửa.");
        }

        res.render('edit-quiz', { user: req.session.user, quiz: quiz });
    } catch (err) {
        console.error(err);
        res.status(500).send("Lỗi server.");
    }
});

// --- POST: Xử lý Sửa Quiz ---
router.post('/edit/:id', isHost, async (req, res) => {
    const { title, questions } = req.body;

    
        // Lọc và định dạng dữ liệu câu hỏi
    let formattedQuestions = [];
    if (questions && Array.isArray(questions)) {
        formattedQuestions = questions
        .filter(q => q !== null && q !== undefined && q.title)
        .map(q => ({
            title: q.title,
            options: Array.isArray(q.options) ? q.options : [],
            correctAnswerIndex: parseInt(q.correctAnswer)
        }));
    }

    try {
        const quiz = await Quiz.findById(req.params.id);

        if (!quiz || quiz.createdBy.toString() !== req.session.user.id) {
            return res.status(404).send('Không tìm thấy Quiz hoặc bạn không có quyền chỉnh sửa.');
        }
        
        // Cập nhật dữ liệu quiz
        quiz.title = title;
        quiz.questions = formattedQuestions;

        await quiz.save();
        
        // Chuyển hướng về bảng điều khiển sau khi lưu thành công
        res.redirect('/host-dashboard'); 

    } catch (err) {
        console.error("Lỗi khi cập nhật quiz:", err);
        res.status(500).send("Không thể lưu thay đổi.");
    }
});

// --- POST: Xử lý Xóa Quiz ---
router.post('/delete/:id', isHost, async (req, res) => {
    try {
        await Quiz.findOneAndDelete({ _id: req.params.id, createdBy: req.session.user.id });
        res.redirect('/host-dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send("Lỗi khi xóa quiz.");
    }
});

module.exports = router;