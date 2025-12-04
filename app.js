const express = require("express");
const path = require("path");
const app = express();
require("dotenv").config();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const i18n = require("i18n"); // Included from the second block for i18n
const port = process.env.PORT || 3000;
const { initializeCronJobs } = require('./config/cronJobs');
const cookieParser = require("cookie-parser");
const session = require("express-session");
const connectDB = require("./config/db");

// ✨ Connect to MongoDB
connectDB();

// --- Initialize Cron Jobs ---
initializeCronJobs();

// --- Middlewares ---
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

// --- Internationalization (i18n) Configuration ---
i18n.configure({
    locales: ["en", "hi", "kn"],
    directory: __dirname + "/locales",
    cookie: "aarohi_lang",
    defaultLocale: "en",
    autoReload: true,
    updateFiles: false
});
app.use(i18n.init); // Initialize i18n

// Expose logged-in user (from session) to all views as `user`
app.use((req, res, next) => {
    res.locals.user = req.session && req.session.user ? req.session.user : null;
    next();
});

// Expose user language preference and translation function to all views
app.use((req, res, next) => {
    res.locals.__ = res.__; // Translation function
    res.locals.userLang = req.cookies?.aarohi_lang || "en";
    res.locals.lang = res.locals.userLang; // Alias for templates
    next();
});

// --- Routes Imports ---
const aiRoutes = require('./routes/aiRoutes');
const authRoutes = require("./routes/authRoutes");
const schemeRoutes = require('./routes/schemeRoutes');
const farmerRoutes = require('./routes/farmerRoutes');
const communityRoutes = require("./routes/communityRoutes");
const chatRoutes = require("./routes/chatRoutes");
const communityProblemRoutes = require("./routes/communityProblemRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const animalRoutes = require('./routes/animalRoutes');
const cropRoutes = require('./routes/cropRoutes');
const vetAuthRoutes = require("./routes/vetAuthRoutes");
// teleVet routes removed
const dealerAuthRoutes = require('./routes/dealerAuthRoutes');
const stockRoutes = require('./routes/stockRoutes');
const i18nRoutes = require('./routes/i18nRoutes');
const adminRoutes = require('./routes/admin'); // Imported from first block
const weatherroutes = require('./routes/weatherRoutes');
// --- Route Definitions ---

// Home route FIRST
app.get('/', (req, res) => {
    res.render('home/home');
});

app.use("/auth", authRoutes);
app.use("/ai", aiRoutes);
app.use('/i18n', i18nRoutes); // For changing language
app.use("/schemes", schemeRoutes);
app.use('/farmer', farmerRoutes);
app.use("/community", communityRoutes);
app.use("/community/chat", chatRoutes);
app.use("/community/problems", communityProblemRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/animals", animalRoutes);
app.use("/crops", cropRoutes);
app.use("/vet-auth", vetAuthRoutes);
app.use("/dealer-auth", dealerAuthRoutes);
app.use("/stock", stockRoutes);
app.use('/admin', adminRoutes);
app.use('/weather',weatherroutes);

// Debug endpoint to inspect active user -> socket mappings (temporary)
const userSocketMap = {}; // { userId: socketId }

app.get('/debug/sockets', (req, res) => {
    try {
        res.json(userSocketMap);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read socket map' });
    }
});


// --- Socket.IO Handlers ---

io.on("connection", (socket) => {

    // Register a logged-in user with their socket id
    socket.on('register', (userId) => {
        try {
            if (userId) {
                userSocketMap[userId] = socket.id;
                console.log('[socket] registered user', userId, '->', socket.id);
            }
        } catch (e) {
            console.warn('[socket] register error', e);
        }
    });

    // Video-call related socket handlers removed

    // Clean up mapping when socket disconnects
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

    // Chat message handlers
    const Message = require('./models/Message'); // Assumes path to model
    // const User = require('./models/User'); // User model is not used directly here, but needed for population

    socket.on('joinRoom', async ({ roomId }) => {
        try {
            socket.join(roomId);
            console.log('[socket] joined chat room', roomId);
        } catch (e) {
            console.warn('[socket] joinRoom error', e);
        }
    });

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
            // Note: The original code used msgId._id which looked like a typo. Assuming payload._id contains the message ID.
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

});

// --- Server Startup ---

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