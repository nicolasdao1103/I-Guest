// routes/authRoutes.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User'); // Import User model

// --- Middleware để kiểm tra xem người dùng đã đăng nhập chưa ---
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next(); // Nếu đã đăng nhập, cho phép tiếp tục
    }
    res.redirect('/login'); // Nếu chưa, chuyển hướng về trang đăng nhập
};

// --- GET: Hiển thị trang đăng ký ---
router.get('/register', (req, res) => {
    res.render('register', { error: null }); // Truyền biến `user` vào để header có thể kiểm tra
});

// --- POST: Xử lý việc đăng ký ---
router.post('/register', async (req, res) => {
    const { username, password, role } = req.body;

    try {
        // Kiểm tra xem username đã tồn tại chưa
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.render('register', { error: 'Tên đăng nhập đã tồn tại.' });
        }

        // Mã hóa mật khẩu
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Tạo người dùng mới
        const newUser = new User({
            username,
            password: hashedPassword,
            role
        });

        await newUser.save(); // Lưu vào database
        res.redirect('/login'); // Đăng ký thành công, chuyển đến trang đăng nhập

    } catch (err) {
        console.error(err);
        res.render('register', { error: 'Đã có lỗi xảy ra. Vui lòng thử lại.' });
    }
});

// --- GET: Hiển thị trang đăng nhập ---
router.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// --- POST: Xử lý việc đăng nhập ---
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });
        // Kiểm tra user có tồn tại không
        if (!user) {
            return res.render('login', { error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
        }

        // So sánh mật khẩu đã mã hóa
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('login', { error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
        }
        
        // Lưu thông tin user vào session
        req.session.user = {
            id: user._id,
            username: user.username,
            role: user.role
        };
        
        // Nếu là host, chuyển đến dashboard. Nếu là user, về trang chủ.
        if (user.role === 'host') {
            res.redirect('/host-dashboard');
        } else {
            res.redirect('/user-dashboard');
        }

    } catch (err) {
        console.error(err);
        res.render('login', { error: 'Đã có lỗi xảy ra.' });
    }
});

// --- GET: Xử lý đăng xuất ---
router.get('/logout', (req, res) => {
    req.session.destroy(err => { // Hủy session
        if (err) {
            return res.redirect('/');
        }
        res.clearCookie('connect.sid'); // Xóa cookie
        res.redirect('/');
    });
});


module.exports = router;