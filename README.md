# 🍊 Mnema '98 (μνῆμα)

> A Sentient Digital Diary & Memory Retrieval Companion styled in classic Windows 95/98 aesthetics.

**Mnema '98** is an advanced, offline-first personal digital journaling system running on a simulated desktop shell. It couples 90s visual nostalgia—CRT vibes, 3D raised borders, retro modal warning popups, and scrolling typewriter terminal prompts—with modern cognitive retrieval systems.

---

## 🚀 Key Features

* **📖 Retrieval-Augmented AI Chat**: Ask your diary companion about your habits, emotional fluctuations, or past memories. Click `Show Sources ▼` inside response bubbles to toggle a slide-down tray detailing the exact logs and mood ratings referenced.
* **📅 Date-Filtered RAG (`@` Selector)**: Type `@` in the chat prompt to pull up a scrollable popover listing your journaling dates. Clicking one locks queries strictly to that day's logs (e.g. `@1998-03-21`).
* **🎨 Retro Paint & Doodles**: A desktop drawing app featuring a 32x32 pixel canvas grid, Pencil/Eraser tools, a 16-color retro palette, and custom vector icons. Saves drawings as a compact **1024-character text code** inside Firestore—requiring **zero binary storage**!
* **📟 Interactive MS-DOS Prompt (mShell)**: A fully functional monospaced green-on-black prompt featuring standard utilities (`HELP`, `DIR`, `CLS`, `VER`, `SYSINFO`, `DATE/TIME`) and hidden sentience easter eggs (grid steerable `SNAKE` game, crawler `TURTLE` animations, quote mirrors, and Introspective Reflection cues).
* **📈 System Monitor (CRT Diagnostics)**: Plots chronological mood indexes on a digital stepped line graph within a matrix-green grid. Shows diagnostics detailing API parameters (`gemini-2.5-flash`, `gemini-embedding-2`), latency, and storage stats.
* **🏷️ Dynamic Hashtags**: Write diary logs with standard hashtags (e.g. `#code`, `#thoughts`). The parser auto-indexes them on save to populate dynamic card list filter dropdowns.
* **📺 Customization & Backup**: Select screensavers (Starfield, Flying Windows, Mystify) or customize wallpaper colors (Classic Purple, Teal, Navy Blue, Grey, Black). Export all memories instantly as a formatted `.txt` backup log.

---

## 🛠️ Technology Stack

* **Frontend**: React 18, Vite 6, Custom HSL styling variables (Strict Vanilla CSS), offline persistent local cache (IndexedDB via Firebase Firestore multiple-tab managers).
* **Backend**: FastAPI (Python 3.10+), Google Generative AI (Gemini APIs for vector embeddings & response generation), Firebase Admin SDK.
* **Database**: Firebase Firestore.

---

## 💻 Local Development Setup

### 1. Prerequisites
* [Node.js](https://nodejs.org/) (v18+)
* [Python](https://www.python.org/) (v3.10+)
* A Firebase Project configured with Firestore.

---

### 2. Backend Setup
1. Navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Create a `.env` file in the `backend/` directory:
   ```env
   GEMINI_API_KEY=your_gemini_api_key
   ALLOWED_ORIGINS=http://localhost:5173
   ```
4. Place your Firebase private credentials file named `service-account.json` inside the `backend/` folder.
5. Start the web server:
   ```bash
   python -m uvicorn main:app --reload
   ```

---

### 3. Frontend Setup
1. Navigate to the frontend folder:
   ```bash
   cd ../frontend
   ```
2. Install package dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `frontend/` directory:
   ```env
   VITE_BACKEND_URL=http://localhost:8000
   ```
4. Run the local development server:
   ```bash
   npm run dev
   ```

---

## 🌐 Production Deployment Configuration

* **Frontend Hosting**: Deploy on **Vercel** or **Firebase Hosting** pointing the root directory to `frontend`, preset to `Vite`, and adding `VITE_BACKEND_URL` to project environment variables.
* **Backend Hosting**: Deploy on **Render**, **Railway**, or **Google Cloud Run** pointing to the `backend` directory. Configure:
  * `GEMINI_API_KEY`: Your Generative AI API key.
  * `ALLOWED_ORIGINS`: Set to your deployed Vercel/Hosting URL.
  * `FIREBASE_CREDENTIALS`: Paste the raw string JSON content of your `service-account.json` credential file.
