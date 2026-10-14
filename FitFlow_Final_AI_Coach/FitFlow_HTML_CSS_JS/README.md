# FITFLOW — Gemini AI Coach

This project keeps the FitFlow HTML/CSS/JS interface and adds a Gemini-powered AI Coach through a small Node.js/Express backend.

## Setup on Windows

### 1. Install Node.js
Download the LTS version from https://nodejs.org/en/download and install it with the default options. Close and reopen Command Prompt afterward.

### 2. Open this project folder in Command Prompt
Extract the ZIP. Open the `FitFlow_HTML_CSS_JS` folder, click its File Explorer address bar, type `cmd`, and press Enter.

Check Node.js is installed:

```cmd
node -v
npm -v
```

### 3. Install the project dependencies

```cmd
npm install
```

### 4. Add your Gemini API key

In the same folder as `server.js`, copy `.env.example` and rename the copy to `.env` (make sure it is not named `.env.txt`). Open `.env` in Notepad and replace `put_your_private_key_here` with your NEW Gemini API key:

```env
GEMINI_API_KEY=your_new_private_key_here
GEMINI_MODEL=gemini-2.5-flash
PORT=3000
```

Do not share or upload `.env`. Do not put the API key in `index.html` or `script.js`. If a key has been posted publicly or shared in chat, revoke it and create a new one.

### 5. Start FitFlow

```cmd
npm start
```

Keep Command Prompt open and visit http://localhost:3000 in Chrome. Do not open `index.html` directly; the AI endpoint works through the local server.

## How it works

- The frontend sends the question and selected available profile, workout, progress, meals, and check-in data to `/api/coach`.
- The backend calls Gemini using the secret key stored in `.env` and returns the generated answer.
- Recent chat history is kept in the browser during the current page session.
- The backend includes basic request rate limiting and input-size limits.

## Troubleshooting

- **`npm` is not recognized:** install Node.js LTS, then close and reopen Command Prompt.
- **API key not configured:** ensure `.env` is beside `server.js`, not inside `public`, and restart the server.
- **Model/API error:** verify the new key in Google AI Studio, confirm the configured model is available to your account, and check current API quota/limits. You can change `GEMINI_MODEL` in `.env` to a model enabled for your account, then restart the server.
- **Port already in use:** change `PORT=3001` in `.env`, restart, and open http://localhost:3001.

## Important limitations

- Gemini's free tier has usage limits; usage is not guaranteed to be unlimited.
- This is a local/demo setup. FitFlow user accounts and fitness records remain in browser `localStorage`; they do not sync between devices and are not suitable as production authentication.
- Before public deployment, add proper authentication, authorization, abuse protection, and privacy disclosures. Do not rely on localStorage login checks to protect a public API.
- Fitness guidance is educational, not a medical diagnosis.
