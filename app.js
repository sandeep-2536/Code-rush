const express = require("express");
const path = require("path");
const app = express();
require("dotenv").config();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const i18n = require("i18n");
const port = process.env.PORT || 3000;
const cookieParser = require("cookie-parser");


const session = require("express-session");
const connectDB = require("./config/db");

// ✨ Connect to MongoDB
connectDB();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(cookieParser());

app.use(session({
    secret: "aarohi-secret",
    resave: false,
    saveUninitialized: true
}));

// Expose logged-in user (from session) to all views as `user`
app.use((req, res, next) => {
    res.locals.user = req.session && req.session.user ? req.session.user : null;
    next();
});

i18n.configure({
    locales: ["en", "hi", "kn"],
    directory: __dirname + "/locales",
    cookie: "aarohi_lang",
    defaultLocale: "en",
    autoReload: true,
    updateFiles: false
});

app.use(i18n.init);

// Make language available to EJS
app.use((req, res, next) => {
    res.locals.__ = res.__;
    res.locals.lang = req.cookies?.aarohi_lang || "en";
    next();
});

// Expose user language preference to all views
app.use((req, res, next) => {
  res.locals.userLang = req.cookies?.aarohi_lang || "en";
  next();
});

// Routes
const aiRoutes = require('./routes/aiRoutes');
const authRoutes = require("./routes/authRoutes");
const schemeRoutes = require('./routes/schemeRoutes');
const farmerRoutes = require('./routes/farmerRoutes');
const communityRoutes = require("./routes/communityRoutes");
const chatRoutes = require("./routes/chatRoutes");
const communityProblemRoutes = require("./routes/communityProblemRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const callRoutes = require("./routes/callRoutes");
const animalRoutes = require('./routes/animalRoutes');
const cropRoutes = require('./routes/cropRoutes');
const vetAuthRoutes = require("./routes/vetAuthRoutes");
const teleVetRoutes = require("./routes/teleVetRoutes");
const dealerAuthRoutes = require('./routes/dealerAuthRoutes');
const stockRoutes = require('./routes/stockRoutes');
const i18nRoutes = require('./routes/i18nRoutes');
// Home route FIRST (to avoid conflict)
app.get('/', (req, res) => {
    res.render('home/home');
});

// Clean route structure

app.use("/auth", authRoutes);
app.use("/ai", aiRoutes);
app.use('/i18n', i18nRoutes);
app.use("/schemes", schemeRoutes);
app.use('/farmer', farmerRoutes);
app.use("/community", communityRoutes);
app.use("/community/chat", chatRoutes);
app.use("/community/problems", communityProblemRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/call", callRoutes);
app.use("/animals", animalRoutes);
app.use("/crops", cropRoutes);
app.use("/vet-auth", vetAuthRoutes);
app.use("/teleVet", teleVetRoutes);
app.use("/dealer-auth", dealerAuthRoutes);
app.use("/stock", stockRoutes);

// Debug endpoint to inspect active user -> socket mappings (temporary)
app.get('/debug/sockets', (req, res) => {
    try {
        res.json(userSocketMap);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read socket map' });
    }
});


// Map users to sockets (top-level so it persists across connections)
// ============================================
// SOCKET.IO CONFIGURATION
// ============================================

const teleVetSocketHandler = require('./server/sockets/teleVetSocket');
const teleVetHandlers = teleVetSocketHandler(io);

// Map users to sockets (top-level so it persists across connections)
const userSocketMap = {}; // { userId: socketId }

io.on("connection", (socket) => {
    console.log('[socket] New connection:', socket.id);

    // ========== AUTHENTICATION ==========
    
    // Register a logged-in user with their socket id
    socket.on('register', (userId) => {
        try {
            if (userId && userId.trim()) {
                userSocketMap[userId] = socket.id;
                console.log('[socket] registered user', userId, '->', socket.id);
                
                // Notify the client they're registered
                socket.emit('registered', { userId, socketId: socket.id });
            }
        } catch (e) {
            console.warn('[socket] register error', e);
        }
    });

    // ========== TELEVET SPECIFIC HANDLERS ==========
    
    // Farmer calls vet (video consultation)
    socket.on('callUser', (data) => {
        if (data.type === 'teleVet' || data.roomId?.includes('vetroom')) {
            teleVetHandlers.handleTeleVetCallUser(socket, io, userSocketMap)(data);
        } else {
            // Regular call handling (existing logic)
            const { toUserId, roomId, fromUserId, fromName } = data;
            console.log('[socket] callUser', { toUserId, roomId, fromUserId });
            const targetSocketId = userSocketMap[toUserId];
            if (targetSocketId) {
                io.to(targetSocketId).emit('incomingCall', { fromUserId, fromName, roomId });
            } else {
                console.log('[socket] callUser - target not found');
                socket.emit('noAnswer', { toUserId });
            }
        }
    });

    // Vet accepts video call
    socket.on('acceptCall', (data) => {
        if (data.vetId && data.farmerId) {
            // TeleVet accept
            teleVetHandlers.handleTeleVetAcceptCall(socket, io, userSocketMap)(data);
        } else {
            // Regular call accept (existing logic)
            const { callerUserId, roomId } = data;
            const callerSocketId = userSocketMap[callerUserId];
            console.log('[socket] acceptCall', { callerUserId, roomId });
            if (callerSocketId) {
                io.to(callerSocketId).emit('callAccepted', { roomId });
            }
        }
    });

    // Vet rejects video call
    socket.on('rejectCall', (data) => {
        if (data.vetId) {
            // TeleVet reject
            teleVetHandlers.handleTeleVetRejectCall(socket, io, userSocketMap)(data);
        } else {
            // Regular call reject (existing logic)
            const { callerUserId } = data;
            const callerSocketId = userSocketMap[callerUserId];
            if (callerSocketId) {
                io.to(callerSocketId).emit('callRejected', { by: socket.id });
            }
        }
    });

    // End video call
    socket.on('endCall', (data) => {
        if (data.roomId && data.userId) {
            teleVetHandlers.handleTeleVetEndCall(socket, io, userSocketMap)(data);
        }
    });

    // ========== WEBRTC SIGNALING ==========

    socket.on("joinRoom", (roomId) => {
        try {
            socket.join(roomId);
            const room = io.sockets.adapter.rooms.get(roomId);
            const members = room ? Array.from(room) : [];
            console.log('[socket] joinRoom', { roomId, socketId: socket.id, members });
            socket.to(roomId).emit("ready");
            console.log('[socket] ready emitted to room', roomId);
        } catch (e) {
            console.warn('[socket] joinRoom error', e);
        }
    });

    socket.on("offer", ({ roomId, offer }) => {
        console.log('[socket] forwarding offer to room', roomId);
        socket.to(roomId).emit("offer", offer);
    });

    socket.on("answer", ({ roomId, answer }) => {
        console.log('[socket] forwarding answer to room', roomId);
        socket.to(roomId).emit("answer", answer);
    });

    socket.on("iceCandidate", ({ roomId, candidate }) => {
        console.log('[socket] forwarding iceCandidate to room', roomId);
        socket.to(roomId).emit("iceCandidate", { candidate });
    });

    // ========== CHAT HANDLERS ==========

    const Message = require('./models/Message');
    const User = require('./models/User');

    socket.on('sendMessage', async (payload) => {
        try {
            console.log('[socket] sendMessage received', { roomId: payload.roomId, text: payload.text });
            
            // Create and save message to DB
            const savedMsg = await Message.create({
                roomId: payload.roomId,
                user: payload.user._id,
                text: payload.text,
                image: payload.image || null,
                createdAt: new Date()
            });

            // Populate user data
            const populatedMsg = await Message.findById(savedMsg._id).populate('user');

            // Broadcast to all users in the room
            io.to(payload.roomId).emit('receiveMessage', {
                _id: populatedMsg._id,
                roomId: populatedMsg.roomId,
                user: {
                    _id: populatedMsg.user._id,
                    name: populatedMsg.user.name,
                    profileImage: populatedMsg.user.profileImage
                },
                text: populatedMsg.text,
                image: populatedMsg.image,
                createdAt: populatedMsg.createdAt
            });

            console.log('[socket] message saved and broadcasted');
        } catch (e) {
            console.error('[socket] sendMessage error', e);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    socket.on('deleteMessage', async (msgId) => {
        try {
            await Message.findByIdAndDelete(msgId);
            io.emit('messageDeleted', msgId);
            console.log('[socket] message deleted', msgId);
        } catch (e) {
            console.error('[socket] deleteMessage error', e);
        }
    });

    socket.on('updateMessage', async (payload) => {
        try {
            const updated = await Message.findByIdAndUpdate(payload._id, {
                text: payload.text,
                edited: true
            }, { new: true }).populate('user');

            io.emit('messageUpdated', {
                _id: updated._id,
                user: {
                    _id: updated.user._id,
                    name: updated.user.name,
                    profileImage: updated.user.profileImage
                },
                text: updated.text,
                edited: updated.edited,
                createdAt: updated.createdAt
            });

            console.log('[socket] message updated', payload._id);
        } catch (e) {
            console.error('[socket] updateMessage error', e);
        }
    });

    // ========== DISCONNECT ==========

    socket.on('disconnect', () => {
        try {
            for (const [userId, sId] of Object.entries(userSocketMap)) {
                if (sId === socket.id) {
                    delete userSocketMap[userId];
                    console.log('[socket] disconnected, removed mapping for user', userId);
                }
            }
        } catch (e) {
            console.warn('[socket] disconnect cleanup error', e);
        }
    });

});


// Add error handler so EADDRINUSE is reported cleanly on Windows
http.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
        console.error(`🚫 Port ${port} is already in use. Choose a different PORT in your .env or stop the process using the port.`);
        console.error('To find and stop the process on Windows (PowerShell):');
        console.error('  netstat -ano | findstr :<PORT>');
        console.error('  taskkill /PID <PID> /F');
        process.exit(1);
    }
    console.error('Server error:', err);
    process.exit(1);
});

http.listen(port, () => {
    console.log("🚀 Socket.IO + Server running on", port);
});

