const Post = require("../models/Post");
const Comment = require("../models/Comment");
const User = require("../models/User");
const axios = require('axios');

exports.getDashboard = async (req, res) => {
    if (!req.session.user) return res.redirect("/auth/login");

    const userId = req.session.user._id;

    try {
        // Fetch community posts by this user
        const myCommunityPosts = await Post.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(100);

        // Fetch comments by this user
        const myComments = await Comment.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(100);

        // Fetch problems (using Post model — filter by type if needed)
        const myProblems = await Post.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(100);

        // Fetch animals (stub — returns empty if model doesn't exist or user field not set)
        let myAnimals = [];
        try {
            const Animal = require("../models/Animal");
            myAnimals = await Animal.find({ user: userId }).limit(100);
        } catch (e) {
            console.warn('[dashboard] Animal model not available or error:', e.message);
        }

        // Fetch crops (stub — returns empty if model doesn't exist or user field not set)
        let myCrops = [];
        try {
            const Crop = require("../models/Crop");
            myCrops = await Crop.find({ user: userId }).limit(100);
        } catch (e) {
            console.warn('[dashboard] Crop model not available or error:', e.message);
        }

        // Vet calls (stub — returns empty)
        const myVetCalls = [];

        // AI searches (stub — returns empty)
        const myAISearches = [];

        // Stock views (stub — returns empty)
        const myStockViews = [];

        // Recent activity (mix of posts and comments, sorted by date)
        const recentActivity = []
            .concat(myCommunityPosts.map(p => ({
                type: p.type || 'post',
                text: p.title || 'Posted in community',
                date: p.createdAt
            })))
            .concat(myComments.map(c => ({
                type: 'comment',
                text: 'Added a comment',
                date: c.createdAt
            })))
            .concat(myProblems.map(p => ({
                type: 'problem',
                text: p.title || 'Reported a problem',
                date: p.createdAt
            })))
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 10);

        // Try to fetch simple current weather for user's location (if available)
        let weather = [];
        let locationForWeather = '';
        try {
            const apiKey = process.env.OPENWEATHERMAP_API_KEY;
            // Try to use village, city or state as a simple query
            locationForWeather = (req.session.user && (req.session.user.village || req.session.user.city || req.session.user.state)) || process.env.DEFAULT_WEATHER_CITY || '';
            if (apiKey && locationForWeather) {
                // Fetch 5-day forecast for better weather data
                const weatherRes = await axios.get('https://api.openweathermap.org/data/2.5/forecast', {
                    params: {
                        q: locationForWeather,
                        units: 'metric',
                        appid: apiKey
                    }
                });
                const list = weatherRes.data && weatherRes.data.list ? weatherRes.data.list : [];
                
                // Extract one reading per day at 12:00 PM (noon) for next 5 days
                weather = list
                    .filter(reading => reading.dt_txt.includes("12:00:00"))
                    .slice(0, 5)
                    .map(day => ({
                        date: new Date(day.dt_txt).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
                        icon: (day.weather && day.weather[0] && day.weather[0].icon) || '01d',
                        temp: Math.round(day.main && day.main.temp) || '',
                        desc: (day.weather && day.weather[0] && day.weather[0].main) || 'Clear'
                    }));
            }
        } catch (e) {
            console.warn('[dashboard] weather fetch failed for location:', locationForWeather, 'Error:', e.message);
            
            // If 404, try fallback to state
            if (e.response && e.response.status === 404 && req.session.user && req.session.user.state) {
                console.log('[dashboard] Location not found, trying state:', req.session.user.state);
                try {
                    const fallbackRes = await axios.get('https://api.openweathermap.org/data/2.5/forecast', {
                        params: {
                            q: req.session.user.state,
                            units: 'metric',
                            appid: process.env.OPENWEATHERMAP_API_KEY
                        }
                    });
                    const fallbackList = fallbackRes.data && fallbackRes.data.list ? fallbackRes.data.list : [];
                    weather = fallbackList
                        .filter(reading => reading.dt_txt.includes("12:00:00"))
                        .slice(0, 5)
                        .map(day => ({
                            date: new Date(day.dt_txt).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
                            icon: (day.weather && day.weather[0] && day.weather[0].icon) || '01d',
                            temp: Math.round(day.main && day.main.temp) || '',
                            desc: (day.weather && day.weather[0] && day.weather[0].main) || 'Clear'
                        }));
                } catch (fallbackErr) {
                    console.warn('[dashboard] fallback weather also failed:', fallbackErr.message);
                    weather = [];
                }
            } else {
                weather = [];
            }
        }

        res.render("dashboard/dashboard", {
            user: req.session.user,
            myCommunityPosts,
            myComments,
            myProblems,
            myAnimals,
            myCrops,
            myVetCalls,
            myAISearches,
            myStockViews,
            recentActivity,
            weather,
            aiAdvice: ''
        });
    } catch (err) {
        console.error('[dashboard] error:', err);
        res.status(500).render('dashboard/dashboard', {
            user: req.session.user,
            myCommunityPosts: [],
            myComments: [],
            myProblems: [],
            myAnimals: [],
            myCrops: [],
            myVetCalls: [],
            myAISearches: [],
            myStockViews: [],
            recentActivity: [],
            error: 'Error loading dashboard data'
            , weather: [],
            aiAdvice: ''
        });
    }
};

// Save user's location (village, state) to database
exports.saveLocation = async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        
        const { village, state } = req.body;
        if (!village || !state) {
            return res.status(400).json({ success: false, message: 'Village and state are required' });
        }

        const userId = req.session.user._id;
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { village, state },
            { new: true }
        );

        // Update session user as well
        req.session.user.village = updatedUser.village;
        req.session.user.state = updatedUser.state;

        res.json({ 
            success: true, 
            message: 'Location saved successfully',
            user: updatedUser 
        });
    } catch (err) {
        console.error('[dashboard] saveLocation error:', err);
        res.status(500).json({ success: false, message: 'Failed to save location' });
    }
};
