const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require('../models/User'); // Import your models
const Post = require('../models/Post'); 
// ... Import other models (Animal, Crop, Problem, etc.)

require('dotenv').config();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.AI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

exports.getDashboard = async (req, res) => {
    try {
        if (!req.session.user) return res.redirect("/auth/login");
        const userId = (req.session.user && req.session.user._id) || null;
        // Prefer fresh DB copy when possible, fall back to session user object
        let user = req.session.user;
        if (userId) {
            try {
                const dbUser = await User.findById(userId);
                if (dbUser) user = dbUser;
            } catch (e) {
                console.warn('[weather] could not load user from DB, using session user');
            }
        }

        // ==========================================
        // 1. YOUR EXISTING DATA LOGIC (Keep this)
        // ==========================================
        // I am assuming standard Mongoose calls here based on your variable names.
        // Adjust these lines to match your actual database queries.
        const myCommunityPosts = await Post.find({ author: userId }); 
        const myComments = []; // Replace with actual query
        const myProblems = []; // Replace with actual query
        const myAnimals = [];  // Replace with actual query
        const myCrops = [];    // Replace with actual query
        const myVetCalls = []; // Replace with actual query
        const myAISearches = []; 
        const myStockViews = [];
        const recentActivity = []; 

        // ==========================================
        // 2. NEW WEATHER & AI LOGIC (Add this)
        // ==========================================
        let weatherData = null;
        let aiAdvice = "Currently, no advice is available. Please update your location.";

        // We need a location to check weather.
        // Use village -> state -> default city fallback. This project stores `state` on the User model.
        const locationQuery = (user && (user.village || user.city || user.district || user.state)) || process.env.DEFAULT_WEATHER_CITY || "Delhi";

        // Determine API key presence
        const apiKey = process.env.WEATHER_API_KEY || process.env.OPENWEATHERMAP_API_KEY;
        console.log('[weather] locationQuery=', locationQuery, 'apiKeyPresent=', !!apiKey);

        if (locationQuery && apiKey) {
            try {
                // A. Fetch Weather from OpenWeatherMap
                const weatherUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${locationQuery}&units=metric&appid=${apiKey}`;
                const response = await axios.get(weatherUrl);
                const list = response.data && response.data.list ? response.data.list : null;
                if (!list) throw new Error('Invalid weather response');

                // B. Simplify Data (Take 1 reading per day for next 5 days, e.g., at 12:00 PM)
                weatherData = list
                    .filter(reading => reading.dt_txt.includes("12:00:00"))
                    .slice(0, 5) // Ensure we only get 5 days
                    .map(day => ({
                        date: new Date(day.dt_txt).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
                        temp: Math.round(day.main.temp),
                        icon: day.weather[0].icon, // e.g., '10d'
                        desc: day.weather[0].main  // e.g., 'Rain'
                    }));

                // C. Ask AI for Advice based on this specific weather
                const prompt = `
                    I am a farmer in ${locationQuery}. 
                    The weather forecast for the next 5 days is: ${JSON.stringify(weatherData)}.
                    
                    Based strictly on this weather, provide:
                    1. A 1-sentence warning or green flag.
                    2. A bullet list (<ul><li>) of 3 actionable tasks (e.g., "Irrigate tomorrow", "Spray fungicide").
                    
                    Format the response as raw HTML without markdown code blocks.
                `;
                
                const aiResult = await model.generateContent(prompt);
                aiAdvice = aiResult.response.text();

            } catch (err) {
                console.error("Weather/AI Error:", err && err.message ? err.message : err);
                // Fallback if API fails
                aiAdvice = "Could not fetch weather advice at this moment.";
            }
        } else {
            if (!apiKey) {
                console.warn('[weather] API key missing (WEATHER_API_KEY or OPENWEATHERMAP_API_KEY)');
                aiAdvice = "Weather service not configured on server. Please set WEATHER_API_KEY.";
            } else {
                // locationQuery false (shouldn't happen because we default), but keep safe fallback
                aiAdvice = "Location not set. Update your profile with a village or state to get weather-based advice.";
            }
        }

        // ==========================================
        // 3. RENDER THE DASHBOARD
        // ==========================================
        // Render the common dashboard view so templates are consistent
        res.render('dashboard/dashboard', {
            // User Data
            user: user,
            
            // New Feature Data
            weather: weatherData,
            aiAdvice: aiAdvice,

            // Existing Feature Data
            myCommunityPosts,
            myComments,
            myProblems,
            myAnimals,
            myCrops,
            myVetCalls,
            myAISearches,
            myStockViews,
            recentActivity
        });

    } catch (error) {
        console.error("Dashboard Controller Error:", error);
        res.status(500).send("Server Error");
    }
};