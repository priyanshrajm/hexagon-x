# 🎙️ Savage Live Roast AI (Topic-Locked & Secondary Speaker Filter)

A full-duplex, real-time voice and text roasting application powered by the Google Gemini Live API (`gemini-3.8-live`), Gemini Flash (`gemini-flash-latest`), and Gemini Flash TTS (`gemini-3.8-flash-lite-tts`).

---

## ✨ Features

- **⚡ Full-Duplex Real-Time Live Mic**: Direct 16,000Hz 16-bit PCM streaming over WebSocket with sub-second turnaround.
- **🎯 Exact Topic Lock**: Listens to the primary speaker's exact words, themes, and complaints, delivering razor-sharp punchlines under 10–12 words.
- **🚫 Secondary Interference Filter**: When another speaker cuts in or speaks in the background, the AI shuts them down:
  > *"Don't talk other speaker, first I will deal with this loser!"*
- **🛡️ Audio Loopback Shield**: Pauses mic input during AI speech so the model's voice never loops back or cuts off mid-sentence.
- **🗣️ Natural Voice Personalities**: Choose from multiple prebuilt Gemini voices (`Puck`, `Fenrir`, `Zephyr`, `Kore`).
- **🌐 Multilingual**: Responds in the speaker's language (Hindi, Hinglish, English).

---

## 🔒 Security & API Key Privacy

- **Zero Client-Side Exposure**: `GEMINI_API_KEY` is loaded strictly on the Node.js server (`server.ts`) via server-side environment variables.
- **Frontend Safe**: No keys, tokens, or credentials are sent to or stored in client-side code.
- **`.gitignore` Configured**: All `.env` files are ignored to prevent committing secrets to GitHub.

---

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/your-username/savage-roast-ai.git
cd savage-roast-ai
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Create a `.env` file in the root directory by copying `.env.example`:
```bash
cp .env.example .env
```
Open `.env` and add your Google Gemini API key:
```env
GEMINI_API_KEY="your_gemini_api_key_here"
PORT=3000
```
> Get a free API key at [Google AI Studio](https://aistudio.google.com/app/apikey).

### 4. Run the development server
```bash
npm run dev
```
Open your browser and navigate to `http://localhost:3000`.

### 5. Production build
```bash
npm run build
npm start
```

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons
- **Backend**: Express, Node.js HTTP Server, `ws` (WebSocket)
- **AI SDK**: `@google/genai`
- **Models**:
  - `gemini-3.8-live` (Real-Time Bidirectional Voice)
  - `gemini-flash-latest` (Tone Analysis & JSON Roast Formulation)
  - `gemini-3.8-flash-lite-tts` (Expressive Speech Synthesis)

---

## 📄 License
MIT
