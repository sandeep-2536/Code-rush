// controllers/voiceController.js
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini AI with error handling
let genAI;
let model;

try {
    if (!process.env.GEMINI_API_KEY) {
        console.error('[Voice] GEMINI_API_KEY not found in environment variables');
        throw new Error('GEMINI_API_KEY is required');
    }
    
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: {
            temperature: 0.3, // Lower temperature for more consistent routing
            topK: 20,
            topP: 0.8,
            maxOutputTokens: 256, // Short responses needed
        }
    });
    console.log('[Voice] Navigation engine initialized successfully');
} catch (error) {
    console.error('[Voice] Failed to initialize:', error.message);
}

// Intent to route mapping for validation
const VALID_INTENTS = {
    // Home
    'open_home': '/',
    
    // Community
    'open_community': '/community',
    'open_community_feed': '/community',
    'open_create_post': '/community/new',
    'open_post_details': '/community/:id',
    'open_my_posts': '/dashboard',
    'open_chat': '/community/chat',
    'open_groups_list': '/community/chat',
    'open_start_group_chat': '/community/chat/create',
    
    // Problems
    'open_problems': '/community/problems',
    'open_report_problem': '/community/problems/new',
    'open_problem_details': '/community/problems/:id',
    'open_my_problems': '/dashboard',
    
    // Animals
    'open_animals_list': '/animals',
    'open_add_animal': '/animals/new',
    'open_animal_details': '/animals/:id',
    
    // Crops
    'open_crops_list': '/crops',
    'open_add_crop': '/crops/new',
    'open_crop_details': '/crops/:id',
    
    // Stock
    'open_stock': '/stock',
    'open_stock_list': '/stock',
    'open_add_stock': '/stock/dealer/new',
    'open_stock_details': '/stock/:id',
    'open_dealer_dashboard': '/stock/dealer',
    
    // Tele-Vet
    'open_tele_vet': '/tele-vet',
    'open_vet_list': '/tele-vet',
    'open_start_vet_call': '/tele-vet/farmer/call/:id',
    'open_vet_dashboard': '/tele-vet/doctor/dashboard',
    'open_vet_login': '/vet-auth/login',
    
    // Dealers
    'open_dealer_login': '/dealer-auth/login',
    
    // Auth & User
    'open_login': '/auth/login',
    'open_register': '/auth/register',
    'open_profile': '/auth/profile',
    'open_farmer_dashboard': '/dashboard',
    
    // Schemes
    'open_schemes': '/schemes',
    'open_scheme_details': '/schemes/:id',
    
    // AI Assistant
    'open_ai_assistant': '/ai/assistant',
    
    // Call System
    'open_farmer_call_list': '/call/farmers',
    'open_call_room': '/call/room/:id'
};

// Helper function to clean AI response
function cleanAIResponse(text) {
    if (!text) return null;
    
    // Remove markdown code blocks
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    
    // Remove extra whitespace
    text = text.trim();
    
    // Try to extract JSON if wrapped in text
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (jsonMatch) {
        text = jsonMatch[0];
    }
    
    return text;
}

// Parse and validate intent
function parseIntent(text) {
    try {
        const cleaned = cleanAIResponse(text);
        if (!cleaned) {
            console.warn('[Voice] Empty response from AI');
            return 'open_home';
        }
        
        const parsed = JSON.parse(cleaned);
        
        if (!parsed.intent) {
            console.warn('[Voice] No intent field in response:', parsed);
            return 'open_home';
        }
        
        // Validate intent exists in our mapping
        if (VALID_INTENTS[parsed.intent]) {
            return parsed.intent;
        }
        
        console.warn('[Voice] Invalid intent received:', parsed.intent);
        return 'open_home';
        
    } catch (err) {
        console.error('[Voice] JSON parse error:', err.message);
        console.error('[Voice] Raw text was:', text);
        return 'open_home';
    }
}

// Main navigation processing function
exports.processNavigation = async (req, res) => {
    try {
        // Validate request
        if (!req.body || typeof req.body.query !== 'string') {
            return res.status(400).json({ 
                error: 'Invalid request: query must be a string',
                intent: 'open_home',
                route: '/'
            });
        }

        const userQuery = req.body.query.trim();
        
        if (!userQuery) {
            return res.status(400).json({ 
                error: 'Empty query provided',
                intent: 'open_home',
                route: '/'
            });
        }

        console.log('[Voice] Processing query:', userQuery);

        // Check if AI is initialized
        if (!model) {
            console.error('[Voice] AI model not initialized');
            return res.status(503).json({ 
                error: 'Navigation service unavailable',
                intent: 'open_home',
                route: '/'
            });
        }

        // Build the prompt
        const prompt = `You are the AAROHI Navigation Engine.

Your ONLY job: Given a user's speech (Kannada/Hindi/English/mixed), return EXACTLY ONE INTENT that tells which page should open.

CRITICAL RULES:
1. Respond ONLY with JSON: {"intent":"exact_intent_name"}
2. NO explanation, NO extra text, NO markdown
3. Choose the CLOSEST matching intent from the list below
4. If unclear or unrelated, return: {"intent":"open_home"}
5. Match user language keywords to appropriate pages

VALID INTENTS:
Home: open_home
Community: open_community, open_create_post, open_post_details, open_chat, open_groups_list
Problems: open_problems, open_report_problem, open_problem_details
Animals: open_animals_list, open_add_animal, open_animal_details
Crops: open_crops_list, open_add_crop, open_crop_details
Stock: open_stock_list, open_add_stock, open_stock_details, open_dealer_dashboard
Vet: open_tele_vet, open_vet_list, open_start_vet_call, open_vet_dashboard
Auth: open_login, open_register, open_profile, open_farmer_dashboard
Schemes: open_schemes, open_scheme_details
AI: open_ai_assistant
Calls: open_farmer_call_list, open_call_room

LANGUAGE HINTS:
- "ಮನೆ/घर/home" → open_home
- "ಸಮುದಾಯ/समुदाय/community" → open_community
- "ಸಮಸ್ಯೆ/समस्या/problem" → open_problems
- "ಪ್ರಾಣಿ/पशु/animal" → open_animals_list
- "ಬೆಳೆ/फसल/crop" → open_crops_list
- "ವೈದ್ಯ/डॉक्टर/doctor/vet" → open_tele_vet
- "ಯೋಜನೆ/योजना/scheme" → open_schemes
- "AI/ಎಐ/एआई" → open_ai_assistant

User said: "${userQuery}"

Respond with ONLY: {"intent":"..."}`;

        // Generate response with timeout
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('AI request timeout')), 10000)
        );

        const aiPromise = model.generateContent(prompt);
        
        const result = await Promise.race([aiPromise, timeoutPromise]);
        const response = await result.response;
        const text = response.text().trim();

        console.log('[Voice] AI raw response:', text);

        // Parse and validate the intent
        const intent = parseIntent(text);
        const route = VALID_INTENTS[intent] || '/';

        console.log('[Voice] Resolved intent:', intent, '→', route);

        return res.json({ 
            success: true,
            intent,
            route,
            query: userQuery
        });

    } catch (err) {
        console.error('[Voice] Navigation error:', err);

        // Handle specific errors
        if (err.message?.includes('timeout')) {
            return res.status(504).json({ 
                error: 'Navigation request timeout',
                intent: 'open_home',
                route: '/'
            });
        }

        if (err.message?.includes('API key')) {
            return res.status(500).json({ 
                error: 'Navigation service configuration error',
                intent: 'open_home',
                route: '/'
            });
        }

        if (err.message?.includes('quota') || err.message?.includes('rate limit')) {
            return res.status(429).json({ 
                error: 'Navigation service busy, please try again',
                intent: 'open_home',
                route: '/'
            });
        }

        // Generic error
        return res.status(500).json({ 
            error: 'Voice processing failed',
            intent: 'open_home',
            route: '/',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// Get all available intents (for debugging/documentation)
exports.getAvailableIntents = async (req, res) => {
    try {
        return res.json({
            success: true,
            intents: Object.keys(VALID_INTENTS),
            mapping: VALID_INTENTS,
            count: Object.keys(VALID_INTENTS).length
        });
    } catch (err) {
        console.error('[Voice] Get intents error:', err);
        return res.status(500).json({ 
            error: 'Failed to fetch intents',
            success: false 
        });
    }
};

// Test navigation with sample queries
exports.testNavigation = async (req, res) => {
    try {
        const testQueries = [
            'ಮನೆಗೆ ಹೋಗು', // Go home (Kannada)
            'घर जाओ', // Go home (Hindi)
            'take me home', // English
            'show me animals', // Animals list
            'ವೈದ್ಯರನ್ನು ಕರೆ', // Call doctor (Kannada)
            'AI assistant'
        ];

        const results = [];

        for (const query of testQueries) {
            try {
                const mockReq = { body: { query } };
                const mockRes = {
                    json: (data) => results.push({ query, ...data }),
                    status: () => mockRes
                };
                await exports.processNavigation(mockReq, mockRes);
            } catch (err) {
                results.push({ query, error: err.message });
            }
        }

        return res.json({
            success: true,
            testResults: results
        });

    } catch (err) {
        console.error('[Voice] Test error:', err);
        return res.status(500).json({ 
            error: 'Test failed',
            success: false 
        });
    }
};

// Health check
exports.healthCheck = async (req, res) => {
    try {
        const isConfigured = !!model;
        
        return res.json({
            success: true,
            status: isConfigured ? 'operational' : 'not_configured',
            model: 'gemini-1.5-flash',
            availableIntents: Object.keys(VALID_INTENTS).length,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('[Voice] Health check error:', err);
        return res.status(500).json({ 
            error: 'Health check failed',
            success: false 
        });
    }
};

module.exports = exports;