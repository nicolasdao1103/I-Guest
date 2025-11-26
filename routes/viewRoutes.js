// routes/viewRoutes.js

const express = require('express');
const router = express.Router();
const Quiz = require('../models/Quiz');
const Game = require('../models/Game'); 

// Middleware kiểm tra đã đăng nhập
const isAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/login');
};

// --- Middleware kiểm tra quyền Host ---
const isHost = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'host') {
        return next();
    }
    res.status(403).send('Bạn không có quyền truy cập vào trang này.');
};

// --- Trang chủ ---
router.get('/', (req, res) => {
    // Truyền `user` vào để header biết hiển thị nút Đăng nhập hay Đăng xuất
    res.render('index', { user: req.session.user });
});

// --- Trang dashboard của Host ---
router.get('/host-dashboard', isHost, async (req, res) => {
    try {
        // Lấy tất cả các quiz do host này tạo
        const quizzes = await Quiz.find({ createdBy: req.session.user.id });
        res.render('host-dashboard', { user: req.session.user, quizzes: quizzes });
    } catch (err) {
        console.error(err);
        res.status(500).send("Không thể tải dữ liệu dashboard của host.");
    }
});

// --- Trang dashboard của User ---
router.get('/user-dashboard', isAuthenticated, async (req, res) => {
    // Chỉ user mới vào được trang này
    if (req.session.user.role === 'host') {
        return res.redirect('/host-dashboard');
    }
    try {
        // Tìm tất cả các game mà user này đã tham gia
        const games = await Game.find({ 'finalScores.userId': req.session.user.id })
            .sort({ playedAt: -1 }) // Sắp xếp game mới nhất lên đầu
            .populate('quizId', 'title') // Lấy cả thông tin title của quiz
            .lean();
        
        res.render('user-dashboard', { user: req.session.user, games: games });
    } catch (err) {
        res.status(500).send("Lỗi tải dữ liệu dashboard của user.");
    }
});

router.get('/create-lobby', isHost, async (req, res) => {
    try {
        // Lấy tất cả các bộ câu hỏi của host để hiển thị trong dropdown
        const quizzes = await Quiz.find({ createdBy: req.session.user.id }).lean();
        // Render trang create-lobby và truyền dữ liệu quizzes vào
        res.render('create-lobby', { 
            user: req.session.user, 
            quizzes: quizzes,
            // Thêm request vào để EJS có thể đọc URL
            request: req 
        });
    } catch (err) {
        console.error("Lỗi khi tải trang tạo lobby:", err);
        res.status(500).send("Không thể tải trang.");
    }
});

// --- Các trang phòng chờ (Lobby) ---
router.get('/lobby/host', isHost, (req, res) => {
    const { pin } = req.query; // Lấy PIN từ URL, ví dụ: /lobby/host?pin=123456
    res.render('host-lobby', { user: req.session.user, pin: pin, request: req });
});

router.get('/lobby/player', (req, res) => {
    const { pin } = req.query;
    res.render('player-lobby', { user: req.session.user, pin: pin, request: req });
});


// --- Các trang chơi game ---
router.get('/game/host', isHost, (req, res) => {
    const { pin } = req.query;

    res.render('game-view-host', { user: req.session.user, request: req, pin: pin });

});

router.get('/game/player', (req, res) => {
    res.render('game-view-player', { user: req.session.user, request: req });
});

// --- Các trang sau game (bảng xếp hạng, kết thúc) ---
router.get('/leaderboard', (req, res) => {
    res.render('leaderboard', { user: req.session.user, request: req });
});

router.get('/game-over', (req, res) => {
    res.render('game-over', { user: req.session.user, request: req });
});

// --- POST: Xóa lịch sử chơi game của User ---
router.post('/history/delete/:gameId', isAuthenticated, async (req, res) => {
    try {
        const gameId = req.params.gameId;
        const userId = req.session.user.id;

        // Tìm game và xóa phần tử trong mảng finalScores có userId trùng khớp
        await Game.findByIdAndUpdate(gameId, {
            $pull: { finalScores: { userId: userId } }
        });

        res.redirect('/user-dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send("Lỗi khi xóa lịch sử.");
    }
});

module.exports = router;
