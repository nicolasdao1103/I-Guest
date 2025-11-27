// --- IMPORT CÁC THƯ VIỆN CẦN THIẾT ---
require('dotenv').config(); // Tải các biến môi trường từ file .env
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');

// --- IMPORT CÁC MODULE TỰ TẠO ---
const authRoutes = require('./routes/authRoutes');
const quizRoutes = require('./routes/quizRoutes');
const viewRoutes = require('./routes/viewRoutes');
const Quiz = require('./models/Quiz');
const Game = require('./models/Game');
const { title } = require('process');

// --- KHỞI TẠO SERVER ---
const app = express();
const server = http.createServer(app);
// Gắn Socket.IO vào server, cho phép giao tiếp real-time
const io = socketIo(server);

// --- KẾT NỐI DATABASE MONGODB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Đã kết nối thành công tới MongoDB'))
    .catch(err => console.error(' Lỗi kết nối MongoDB:', err));

// --- CẤU HÌNH MIDDLEWARE CHO EXPRESS ---
app.set('view engine', 'ejs'); // Sử dụng EJS làm công cụ render giao diện
app.use(express.static('public')); // Phục vụ các file tĩnh (CSS, JS client) từ thư mục 'public'
app.use(express.urlencoded({ extended: true })); // Xử lý dữ liệu gửi lên từ form


// Cấu hình session để lưu trạng thái đăng nhập của người dùng
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'secret_key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI, 
        collectionName: 'sessions',
        ttl: 24 * 60 * 60 
    })
});
app.use(sessionMiddleware);

// Chia sẻ middleware session với Socket.IO để có thể truy cập thông tin user trong các kết nối socket
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// --- SỬ DỤNG CÁC ROUTES ĐÃ ĐỊNH NGHĨA ---
app.use('/', authRoutes);      
app.use('/quiz', quizRoutes);  
app.use('/', viewRoutes);      

// --- BIẾN LƯU TRỮ TRẠNG THÁI CÁC PHÒNG CHƠI ---
const games = {};

// --- LOGIC TRUNG TÂM CỦA SOCKET.IO ---
io.on('connection', (socket) => {
    
    console.log(`🔌 Người dùng mới kết nối: ${socket.id}`);

    // Sự kiện khi Host muốn tạo phòng chơi mới
    socket.on('host:create', async (quizId) => {
        const userSession = socket.request.session.user;
        // Kiểm tra xem người dùng có phải là host không
        if (!userSession || userSession.role !== 'host') {
            return socket.emit('error:generic', 'Bạn không có quyền tạo phòng.');
        }

        try {
            const quizData = await Quiz.findById(quizId).lean(); 
            if (!quizData) {
                socket.emit('error:generic', 'Không tìm thấy bộ câu hỏi này.');
                return;
            }
        
            const pin = Math.floor(100000 + Math.random() * 900000).toString();
            games[pin] = {
                quizData: quizData,
                hostUserId: userSession.id, 
                hostSocketId: socket.id,
                players: [],
                questionIndex: -1,
                isLive: false,
                totalAnswered: 0,
                timer: null
            };
            socket.join(pin);
            socket.emit('game:created', pin);
            console.log(`Phòng ${pin} được tạo bởi Host ${socket.id} với quiz "${quizData.title}"`);
        } catch (error) {
            console.error(error);
            socket.emit('error:generic', 'Lỗi khi lấy dữ liệu câu hỏi.');
        }
    });

    socket.on('host:rejoin_game', (pin) => {
        const game = games[pin];
        const userSession = socket.request.session.user; // Lấy session
        // Xác thực host
        if (game && userSession && game.hostUserId.toString() === userSession.id.toString()) {
            game.hostSocketId = socket.id; // Cập nhật socket ID mới
            socket.join(pin);
            console.log(`Host ${userSession.id} đã TÁI KẾT NỐI VÀO MÀN HÌNH GAME phòng ${pin}`);
            // Gửi lại câu hỏi hiện tại nếu game đang chạy
            if (game.isLive && game.questionIndex >= 0) {
                const question = game.quizData.questions[game.questionIndex];
                const questionDataForClients = { 
                    title: question.title,
                    options: question.options,
                    questionIndex: game.questionIndex,
                    totalQuestions: game.quizData.questions.length,
                    totalPlayers: game.players.length,
                    time: 15 
                };
                socket.emit('game:new_question', questionDataForClients);

                socket.emit('update:player_answered', {
                    totalAnswered: game.totalAnswered,
                    totalPlayers: game.players.length
                });
            }
        }
    });

    socket.on('host:rejoin', (pin) => {
        const game = games[pin];
        if (game) {
            game.hostSocketId = socket.id;
            socket.join(pin);
            io.to(game.hostSocketId).emit('update:player_list', game.players);
        }
    });

    socket.on('player:rejoin_game', ({ pin, name }) => {
        const game = games[pin];
        if (!game) return;

        const userSession = socket.request.session.user;
        let player = null;

        // Tìm người chơi (đã đăng nhập hoặc khách)
        if (userSession) {
             player = game.players.find(p => p.userId && p.userId.toString() === userSession.id.toString());
        } else if (name) {
             player = game.players.find(p => p.name === name);
        }
        
        
        if (player) {
            player.id = socket.id; // Cập nhật socket ID mới cho player
            socket.join(pin);
            console.log(`Player ${player.name} đã TÁI KẾT NỐI VÀO MÀN HÌNH GAME phòng ${pin}`);

            if (game.hostSocketId) {
                io.to(game.hostSocketId).emit('update:player_answered', {
                    totalAnswered: game.totalAnswered,
                    totalPlayers: game.players.length
                });
            }
            
             // Gửi lại câu hỏi hiện tại nếu game đang chạy
            if (game.isLive && game.questionIndex >= 0 && !player.answeredThisQuestion) {
                const question = game.quizData.questions[game.questionIndex];
                const questionDataForClients = { 
                    title: question.title,
                    options: question.options,
                    questionIndex: game.questionIndex,
                    totalQuestions: game.quizData.questions.length,
                    totalPlayers: game.players.length,
                    time: 15
                };
                socket.emit('game:new_question', questionDataForClients);
            } else if (game.questionIndex >= 0 && player.answeredThisQuestion) {
                // Nếu đã trả lời rồi, hiện màn hình chờ
                socket.emit('game:wait');
            } else if (game.questionIndex === -1) {
                socket.emit('redirect:lobby', pin);
            }
        }
    });

    socket.on('player:rejoin_lobby', ({ pin, name }) => {
        const game = games[pin];
        if (!game) return socket.emit('error:generic', 'Phòng không tồn tại');

        const userSession = socket.request.session.user;
        let player = null;
        
        // Thử tìm bằng session nếu là user đã đăng nhập
        if (userSession) {
            player = game.players.find(p => p.userId && p.userId.toString() === userSession.id.toString());
        } else if (name) {
            player = game.players.find(p => p.name === name);
        }
        
        if (player) {
            // Cập nhật socket ID MỚI cho người chơi này
            player.id = socket.id;
            socket.join(pin); // Cho socket mới này vào phòng
            console.log(`Player ${player.name} đã TÁI KẾT NỐI VÀO LOBBY phòng ${pin} với Socket ID mới: ${socket.id}`);
        } else {
            console.warn(`Không tìm thấy player tên ${name} để rejoin lobby ${pin}.`);
            socket.emit('error:generic', 'Không tìm thấy thông tin của bạn trong phòng.');
        }
    });


    // Sự kiện khi người chơi muốn tham gia phòng
    socket.on('player:join', ({ pin, name, userId = null }) => {
        const game = games[pin];
        if (!game) return socket.emit('error:room_not_found');
        if (game.isLive) return socket.emit('error:game_already_started');

        const existingPlayer = game.players.find(p => p.id === socket.id || (userId && p.userId === userId));

        if (!existingPlayer) {
            const newPlayer = { 
                id: socket.id, 
                name: name, 
                score: 0, 
                userId: userId,
                answeredThisQuestion: false 
            };
            game.players.push(newPlayer);
            socket.join(pin);
            socket.emit('player:joined', pin); // Báo cho người chơi là đã vào phòng thành công
            io.to(game.hostId).emit('update:player_list', game.players); // Cập nhật danh sách người chơi cho Host
            if(game.hostSocketId) io.to(game.hostSocketId).emit('update:player_list', game.players); // Gửi danh sách cho host mới 
        }else {
            socket.join(pin);
            socket.emit('player:joined', pin);
        }    
            console.log(`👨‍💻 Người chơi ${name} (User ID: ${userId}) đã tham gia phòng ${pin}`);
    });

    // Sự kiện khi Host bắt đầu ván chơi
    socket.on('host:start_game', (pin) => {
    // Luôn lấy session mới nhất trực tiếp từ request của socket để đảm bảo tính chính xác
        const userSession = socket.request.session.user;
        const game = games[pin];

        console.log(`[DEBUG] Yêu cầu bắt đầu game cho PIN: ${pin}`);

        if (game && userSession && game.hostUserId.toString() === userSession.id.toString()) {
            game.isLive = true;
            nextQuestion(pin);
        } else {
            socket.emit('error:generic', 'Lỗi xác thực Host.');
        }
    // Kiểm tra các điều kiện cơ bản
        if (!game) {
            console.error(`[DEBUG] Lỗi: Không tìm thấy game với PIN ${pin}.`);
            return socket.emit('error:generic', 'Phòng chơi không tồn tại.');
        }
        if (!userSession) {
            console.error(`[DEBUG] Lỗi: Không tìm thấy thông tin session cho socket ${socket.id}.`);
            return socket.emit('error:generic', 'Không thể xác thực, vui lòng đăng nhập lại.');
        }

    // Ghi lại thông tin ID để dễ dàng gỡ lỗi trên terminal
        console.log(`[DEBUG] ID Host của game: ${game.hostUserId.toString()}`);
        console.log(`[DEBUG] ID User từ session: ${userSession.id.toString()}`);
    });
    
    // Sự kiện khi người chơi gửi câu trả lời
    socket.on('player:answer', ({ pin, answerIndex, timeTaken }) => {
        handleAnswer(socket, { pin, answerIndex, timeTaken });
    });

    // Sự kiện khi một người dùng ngắt kết nối
    socket.on('disconnect', () => {
        console.log(`🔌 Người dùng đã ngắt kết nối: ${socket.id}`);
        // Dọn dẹp người chơi hoặc phòng chơi nếu cần
        for (const pin in games) {
            const game = games[pin];
            // Nếu là Host ngắt kết nối
            if (game.hostSocketId !== socket.id) {
                console.log(`Host của phòng ${pin} có thể đã thoát. Phòng sẽ bị hủy sau một thời gian nếu không kết nối lại.`);
                return;
            
               const playerIndex = game.players.findIndex(p => p.id === socket.id);
                if (playerIndex !== -1) {
                    const playerName = game.players[playerIndex].name;
                    game.players.splice(playerIndex, 1);
                    console.log(`Người chơi ${playerName} đã thoát khỏi phòng ${pin}.`);
                // Cập nhật lại danh sách cho Host
                    if (game.hostSocketId) {
                        io.to(game.hostSocketId).emit('update:player_list', game.players);
                    }
                    break;
                }
            }
        }
    });
});

// --- CÁC HÀM HỖ TRỢ LOGIC GAME ---

// *** Hàm xử lý câu trả lời của người chơi ***
function handleAnswer(socket, data) {
    const { pin, answerIndex, timeTaken } = data;
    const game = games[pin];
    if (!game || !game.isLive) return;

    // Tìm người chơi trong game
    const player = game.players.find(p => p.id === socket.id);
    if (!player || player.answeredThisQuestion) return;

    const currentQuestion = game.quizData.questions[game.questionIndex];
    let score = 0;
    
    // Tính điểm
    if (answerIndex == currentQuestion.correctAnswerIndex) {
        const maxTime = 15; 
        const baseScore = 1000; 
        
        score = Math.round(baseScore * (1 - (timeTaken / maxTime)));
        if (score < 0) score = 0; // Đảm bảo điểm dương
        
        player.isCorrect = true;
    } else {
        player.isCorrect = false;
    }

    player.score += score;
    player.answeredThisQuestion = true;
    game.totalAnswered++;

    console.log(`Player ${player.name} trả lời câu ${game.questionIndex + 1}: ${player.isCorrect ? 'Đúng' : 'Sai'}. Điểm nhận được: ${score}`);

    // Gửi cập nhật số lượng người đã trả lời cho HOST
    if (game.hostSocketId) {
        io.to(game.hostSocketId).emit('update:player_answered', {
            totalAnswered: game.totalAnswered,
            totalPlayers: game.players.length
        });
    }

    if (game.totalAnswered === game.players.length) {
        // TẤT CẢ đã trả lời -> Chuyển sang bảng xếp hạng
        console.log(`Tất cả người chơi đã trả lời câu ${game.questionIndex + 1}. Đang chuyển sang Leaderboard.`);
        
        if (game.timer) {
            clearTimeout(game.timer);
            game.timer = null;
        }
        showLeaderboard(pin);
    }
}

function nextQuestion(pin) {
    const game = games[pin];
    if (!game) return;

    if (game.timer) clearTimeout(game.timer);
    game.timer = null;

    game.totalAnswered = 0;
    game.players.forEach(p => p.answeredThisQuestion = false);
    game.questionIndex++;
    


    // Nếu đã hết câu hỏi -> kết thúc game
    if (game.questionIndex >= game.quizData.questions.length) {
        endGame(pin);
        return;
    }
    
    const question = game.quizData.questions[game.questionIndex];
    // Dữ liệu câu hỏi gửi cho người chơi 
    const questionDataForClients = {
        title: question.title,
        options: question.options,
        questionIndex: game.questionIndex,
        totalQuestions: game.quizData.questions.length,
        totalPlayers: game.players.length,
        time: 15
    };
    
    io.to(pin).emit('game:new_question', questionDataForClients);
    console.log(`Câu hỏi ${game.questionIndex + 1} được gửi tới phòng ${pin}`);

    game.timer = setTimeout(() => {
        console.log(`Hết giờ cho câu ${game.questionIndex + 1}. Đang chuyển sang Leaderboard.`);
        showLeaderboard(pin);
    }, 15000);
}

function showLeaderboard(pin) {
    const game = games[pin];
    if (!game) return;

    if (game.timer) clearTimeout(game.timer);
    game.players.sort((a, b) => b.score - a.score);

    const question = game.quizData.questions[game.questionIndex];
    const correctAnswerText = question.options[question.correctAnswerIndex] || "lỗi hiển thị đáp án";
    const leaderboardData = {
        players: game.players,
        correctAnswerIndex: question.correctAnswerIndex,
        correctAnswerText: correctAnswerText
    };

    io.to(pin).emit('game:show_leaderboard', leaderboardData);
    
    // Sau 3 giây hiển thị bảng xếp hạng, chuyển sang câu hỏi tiếp theo
    game.timer = setTimeout(() => nextQuestion(pin), 3000);
}

async function endGame(pin) {
    const game = games[pin];
    if (!game) return;

    if (game.timer) clearTimeout(game.timer);
    game.players.sort((a, b) => b.score - a.score);
    io.to(pin).emit('game:over', game.players);
    console.log(`🏁 Game ${pin} đã kết thúc.`);
    // Lưu kết quả vào database
    try {
        // Lấy thông tin cần thiết từ danh sách người chơi trong phòng
        const finalScores = game.players.map(p => ({ 
            name: p.name, 
            score: p.score,
            userId: p.userId 
        }));

        const gameResult = new Game({
            quizId: game.quizData._id,
            hostId: game.quizData.createdBy,
            pin: pin,
            finalScores: finalScores
        });
        await gameResult.save();
        console.log(`Lưu kết quả game ${pin} thành công.`);
    } catch (err) {
        console.error("Lỗi khi lưu kết quả game:", err);
    }
    
    delete games[pin]; // Dọn dẹp game khỏi bộ nhớ
}

// --- KHỞI CHẠY SERVER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`));