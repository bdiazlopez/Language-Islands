# Language Island Spreadsheet Builder

A free, open-source single-page web app to create and curate language learning "islands". Dictate/type phrases in your native tongue, automatically translate them using LLM APIs, and click cells to hear accurate pronunciations.

---

## 15-Second Quick Start

1. **Spin up the app:**
   ```bash
   npm install && npm start
   ```
2. **Open the browser:** Go to [http://localhost:3000](http://localhost:3000).
3. **Configure API Keys & Models:** 
   - Ensure you copy `.env.example` to `.env` and configure your active model targets (e.g. `GPT_MODEL=...`), as **no model versions are hardcoded in the server code** (preventing outdated model errors).
   - Click the sliders icon in the top-right header, select your model (**Gemini**, **GPT**, or **Claude**), paste your personal API key, and click **Save** (stored securely in browser cache).
4. **Build your island:** Click the microphone button, dictate a phrase, and watch it automatically translate, speak, and save directly to your workspace `language_island.csv` file!

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16.0.0 or higher)
- A modern web browser with speech support (Google Chrome or Microsoft Edge are highly recommended for SpeechRecognition).

### Local Setup
1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment Variables (Optional):**
   If you wish, you can create a `.env` file in the root directory (or rename `.env.example` to `.env`):
   ```env
   PORT=3000
   GEMINI_API_KEY=your_gemini_key_here
   GPT_API_KEY=your_gpt_key_here
   CLAUDE_API_KEY=your_claude_key_here
   ```
   *Note: Creating a `.env` file is completely optional! The server runs on port 3000 by default. Users can select their preferred translation engine (Gemini, Claude, or GPT) and save their personal API keys directly inside the web interface (saved securely client-side in browser `localStorage`).*

3. **Start the Web Server:**
   ```bash
   npm start
   ```
   This will boot the Express server at [http://localhost:3000](http://localhost:3000).

---

## LLM Provider Setup Guide

After cloning this repository, you can configure your desired LLM translation engine (Gemini, Claude, or GPT) in two ways:

### Option A: Via the Web UI Settings Drawer (Easiest - No configuration files!)
1. Spin up the app locally using `npm start` and visit [http://localhost:3000](http://localhost:3000).
2. Click the sliders icon in the top right header to open the **System Settings** drawer.
3. Under **Translation Engine**, select your preferred model: **Gemini**, **GPT**, or **Claude**.
4. Paste your API Key in the input field and click **Save**.
   - Keys are cached securely in your browser's local cache (`localStorage`) and are sent as needed with your translation requests. No keys are logged or saved on the server.

### Option B: Via Server Environment Variables
If you prefer not to enter keys in the browser, you must configure both keys and models in your local file:
1. Rename `.env.example` in the project root to `.env`.
2. Add your keys and model preferences:
   ```env
   # API Keys (Required for active engines)
   GEMINI_API_KEY=your_gemini_key_here
   GPT_API_KEY=your_gpt_key_here
   CLAUDE_API_KEY=your_claude_key_here

   # Target Model Configurations (Required)
   # NOTE: To prevent stale/deprecated model errors, the server contains NO hardcoded defaults. 
   # You must define your target models here:
   GEMINI_MODEL=gemini-2.5-flash
   GPT_MODEL=gpt-4o-mini
   CLAUDE_MODEL=claude-3-5-sonnet-20241022
   ```
3. Restart the server (`npm start`). The backend will validate and fall back to these environment values for client translations. If a model is not defined in `.env`, translation requests for that provider will return an error.

---

## Project Architecture

```
/root
├── package.json          # Node project dependencies & npm scripts
├── server.js             # Express API server (CSV parser/writer & LLM proxy)
├── .env.example          # Environment variables template
├── language_island.csv   # The workspace spreadsheet CSV (managed by server)
└── public/               # Static web client assets
    ├── index.html        # Spreadsheet grid & Settings UI structure
    ├── style.css         # Modern styling (glassmorphism theme, animations)
    └── app.js            # Frontend app logic (STT, TTS, state management)
```

### System Architecture Flow

The application is structured with a lightweight, local client-server architecture:

1. **Client (Browser)**:
   - Offers a responsive, premium spreadsheet interface for curating phrases.
   - Captures speech input in the user's native tongue using the native browser Web Speech API (`webkitSpeechRecognition`).
   - Recommends and plays pronunciation audio using browser-native Speech Synthesis (`window.speechSynthesis`).
   - Caches settings and API keys locally in the browser (`localStorage`), preventing server-side logging of private keys.
   
2. **Server (Node.js/Express)**:
   - Manages reading/writing spreadsheet rows directly to the workspace `language_island.csv` file.
   - Exposes REST endpoints to query/save spreadsheet state and acts as a translation middleware proxy.
   - Proxies translation requests to LLM APIs (Gemini, Claude, or GPT), automatically falling back to environment variables (`.env`) if client-side keys are absent.

---

## API Documentation (Backend endpoints in `server.js`)

### 1. `GET /api/csv`
Loads rows from `language_island.csv` in the project root.
- **Response Format:**
  ```json
  {
    "success": true,
    "rows": [
      ["¿Dónde está la biblioteca?", "", "Where is the library?", "Spanish"],
      ["Me gustaría un café, por favor.", "Me gustaría un cafecito, por favor.", "I would like a coffee, please.", "Spanish"]
    ]
  }
  ```
- *Behavior:* If `language_island.csv` does not exist, the server creates the file, writes the headers `Foreign (Formal),Foreign (Informal),Native Tongue,Target Language`, and returns an empty rows array `[]`.

### 2. `POST /api/csv`
Overwrites the content of `language_island.csv` with the updated rows.
- **Request Format:**
  ```json
  {
    "rows": [
      ["¿Dónde está la biblioteca?", "", "Where is the library?", "Spanish"],
      ["Me gustaría un café, por favor.", "Me gustaría un cafecito, por favor.", "I would like a coffee, please.", "Spanish"]
    ]
  }
  ```
- **Response Format:**
  ```json
  {
    "success": true
  }
  ```

### 3. `POST /api/translate`
Translates sentences using the selected LLM translation engine (Gemini, Claude, or GPT) and yields both formal and informal translations.
- **Request Format:**
  ```json
  {
    "text": "Where is the library?",
    "targetLanguage": "Spanish",
    "nativeLanguage": "English",
    "provider": "gemini" | "gpt" | "claude",
    "clientApiKey": "OPTIONAL_CLIENT_API_KEY",
    "customInstructions": "OPTIONAL_CUSTOM_INSTRUCTIONS"
  }
  ```
- **Response Format:**
  ```json
  {
    "success": true,
    "correctedNative": "Where is the library?",
    "formal": "¿Dónde está la biblioteca?",
    "informal": "¿Dónde está la biblioteca?"
  }
  ```

---

## Speech Engine Integrations

### Speech-to-Text (STT)
- Uses the browser's built-in Web Speech API `webkitSpeechRecognition`.
- Listens to audio in the user's selected **Native Language** and transcribes it instantly.
- The transcription is passed to the translation service, and the final translation is automatically added to the spreadsheet.

### Text-to-Speech (TTS)
- Uses the browser's built-in `window.speechSynthesis`.
- Automatically filters and recommends browser-installed voices matching the chosen **Learn (Target) Language** locale.
- Plays correct pronunciation when clicking the speaker button on any row or immediately after translation.

---

## Guide for Future AI Agents

If you are an AI agent tasked with modifying or extending this application, please follow these instructions:

1. **Adding Custom Columns:**
   If you want to add columns (like "Category" or "Notes"):
   - Update `server.js`'s CSV parsing and writing to map additional indices.
   - Adjust the table header in `index.html`.
   - Update `app.js`'s `renderTable` and `enterCellEditMode` methods to handle the new column index.
   - Keep in mind that the core CSV is structured as: `Foreign Language` as column 1, and `Native Tongue` as column 2.

2. **Customizing the Translation System Prompt:**
   - In `server.js`'s `/api/translate` endpoint, the prompt specifies strict output rules (no surrounding quotes, explanations, or leading numbers). Keep these instructions strict so translations integrate seamlessly into the spreadsheet.

3. **Styling Guidelines (`style.css`):**
   - The app uses **Vanilla CSS** with CSS custom properties (`:root`).
   - Do **NOT** install TailwindCSS unless specifically asked.
   - Maintain the premium glassmorphism aesthetic (`backdrop-filter`, translucent colors, subtle borders).
   - Ensure micro-animations (like the pulse effects on recording states) remain smooth.

4. **Spreadsheet Editing Flow:**
   - Single-cell edit uses double-click inside `app.js`. It replaces the cell text with an HTML input, captures events (`Enter` to save, `Escape` to cancel, `Blur` to save), and maps updates back to the `appState.rows` array. Ensure any cell edits trigger auto-saves to remain synchronous with the local workspace.

---

## License

This project is public on GitHub and is available as free open-source software under the [MIT License](LICENSE).

