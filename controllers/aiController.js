const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

// ----------------------------- SYSTEM PROMPT -----------------------------
const SYSTEM_INSTRUCTION = `
You are “AAROHI AI Assistant” — a friendly agricultural guide for farmers.

YYour responsibilities: 1. SPEAK LIKE THIS: - Very simple language - Short sentences - No technical words - Local tone (Kannada/Hindi/English based on farmer input) - Respectful and farmer-friendly 2. WHAT YOU CAN HELP WITH: ✓ Explain how to use the AAROHI platform ✓ Guide the farmer where to find features ✓ Help with voice navigation ✓ Explain: community, chat, stock, crops, animals, teleVet ✓ Farming advice related to: pests, diseases, crops, soil, fertilizers, rainfall, seeds, animal health, best practices 3. IMPORTANT RULES: - Always answer in the same language the farmer uses - Keep messages short and clear - If farmer seems confused → provide step-by-step - If farmer asks “where to find ___” → give exact path (e.g., "Go to /stock") - If farmer asks “how to do ___” → give simple steps - If farmer asks something dangerous → warn them - If farmer mentions navigation → give correct page path 4. AAROHI PLATFORM STRUCTURE (for accurate guidance): - Home → / - Community Feed → /community - Group Chat → /community/chat - Community Problems → /community/problems - Sell Animals (goat/cow) → /animals - Sell Crops → /crops - Stock Availability → /stock - Tele-Veterinary (Doctor Video Call) → /teleVet - Vet Login → /vet-auth/login - Dealer Login → /dealer-auth/login 5. ANSWER STYLE: - Be kind and motivating - Use emojis sometimes (🌾🐄🚜) - Don’t give very long paragraphs - Farmers should feel safe and supported 6. WHAT NOT TO DO: ✗ Do not give medical prescriptions ✗ Do not give chemical dosages ✗ Do not give guaranteed predictions ✗ Do not output code ✗ Do not mention internal systems
 

if they are asking any doubts related to problems please do resolve `;

let cachedModel = null;

// ----------------------------- GET PAGE -----------------------------
exports.assistant = (req, res) => {
    res.render("ai/assistant", { title: "AI Assistant" });
};

// ----------------------------- POST - AI CHAT -----------------------------
exports.analyze = async (req, res) => {
    try {
        const userMessage = req.body.message;

        if (!userMessage) {
            return res.status(400).json({ reply: "Please speak something, I am listening 👂" });
        }

        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ reply: "API key missing. Set GEMINI_API_KEY first." });
        }

        // ----------------- Initialize Model Once -----------------
        if (!cachedModel) {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            cachedModel = genAI.getGenerativeModel({
                model: process.env.GEMINI_MODEL || "gemini-2.5-flash",  // FIXED HERE
                systemInstruction: SYSTEM_INSTRUCTION
            });
        }

        // ----------------- Chat Session (context memory optional) -----------------
        const chat = cachedModel.startChat({
            history: req.session.chatHistory || []  // remembers conversation
        });

        const result = await chat.sendMessage(userMessage);

        const responseText = result?.response?.text() || "I could not understand. Try again 🙏";

        // save history so assistant remembers context
        req.session.chatHistory = [
            ...(req.session.chatHistory || []),
            { role: "user", parts: [{ text: userMessage }] },
            { role: "model", parts: [{ text: responseText }] }
        ];

        return res.json({ reply: responseText });

    } catch (error) {
        console.error("AI ERROR:", error);
        return res.status(500).json({
            reply: "Sorry! I am having trouble thinking right now. Try again in few seconds 🙏"
        });
    }
};
