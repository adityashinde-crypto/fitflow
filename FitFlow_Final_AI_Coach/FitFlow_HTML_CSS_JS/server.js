import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.use(express.json({ limit: "30kb" }));
app.use("/api/", rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many AI requests. Please wait a minute and try again." }
}));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, provider: "Gemini", keyConfigured: Boolean(process.env.GEMINI_API_KEY) });
});

app.post("/api/coach", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "Gemini API key is not configured. Add GEMINI_API_KEY to your .env file and restart FitFlow."
    });
  }

  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) return res.status(400).json({ error: "Enter a question first." });
  if (message.length > 2000) {
    return res.status(413).json({ error: "Please keep each question under 2,000 characters." });
  }

  const fitnessData = req.body?.fitnessData && typeof req.body.fitnessData === "object"
    ? req.body.fitnessData : {};
  const history = Array.isArray(req.body?.history)
    ? req.body.history.slice(-10).map(item => ({
        role: item?.role === "model" ? "COACH" : "USER",
        text: typeof item?.text === "string" ? item.text.slice(0, 1200) : ""
      })).filter(item => item.text)
    : [];

  const prompt = `You are FitFlow's AI fitness and nutrition coach.
Answer the user's actual question directly, warmly, and practically.
Use the provided FitFlow data to personalize your advice without asking them to re-enter details already present.
Do not pretend data exists if it is missing. If a key detail is missing, give the best safe general answer and ask at most one concise follow-up.
When discussing weight loss, explain that short-term scale changes can reflect water, digestion, and normal variation; use trends rather than one weigh-in.
Suggest modest, sustainable changes. Do not prescribe crash diets, extreme calorie restriction, dehydration, dangerous supplements, or excessive exercise.
Do not diagnose medical conditions. For severe, persistent, or concerning symptoms, recommend a qualified healthcare professional.
Do not claim to have changed or saved the user's FitFlow plan. You may propose concrete changes and offer to help implement them.
Keep formatting readable with short paragraphs or bullets. Use the user's units where available.

FITFLOW USER DATA (may be incomplete):
${JSON.stringify(fitnessData).slice(0, 14000)}

RECENT CONVERSATION:
${history.map(item => `${item.role}: ${item.text}`).join("\n").slice(0, 7000) || "(No previous messages)"}

LATEST USER QUESTION:
${message}`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: prompt
    });
    const reply = typeof result.text === "string" ? result.text.trim() : "";
    if (!reply) throw new Error("The model returned an empty response.");
    return res.json({ reply });
  } catch (error) {
    console.error("Gemini request failed:", error?.message || error);
    const status = error?.status === 429 ? 429 : 502;
    return res.status(status).json({
      error: status === 429
        ? "The free AI usage limit may have been reached. Wait and try again later."
        : "Gemini couldn't answer right now. Check your API key, model availability, and network connection."
    });
  }
});

app.use(express.static(path.join(__dirname, "public")));
app.use((req, res) => {
  if (req.method === "GET" && !req.path.startsWith("/api/")) {
    return res.sendFile(path.join(__dirname, "public", "index.html"));
  }
  return res.status(404).json({ error: "Not found." });
});

app.listen(port, () => {
  console.log(`FitFlow is running at http://localhost:${port}`);
  if (!process.env.GEMINI_API_KEY) {
    console.log("Gemini key missing: copy .env.example to .env and add your API key.");
  }
});
