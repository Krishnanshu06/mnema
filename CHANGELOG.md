# Mnema — Full Development Changelog

> **Last Updated**: 2026-07-10
> **Project**: Mnema — A Windows 95 retro-themed AI journal companion
> **Stack**: React + TypeScript (Vite) frontend, FastAPI + Python backend, Firebase (Auth + Firestore + Storage), Gemini AI + Mistral Embeddings

---

## 📂 Project Structure

```
c:\Krishna\Code\Mnema\
├── frontend\
│   ├── src\
│   │   ├── app\
│   │   │   └── App.tsx          ← Main monolithic UI component (~3,267 lines)
│   │   └── firebase.ts          ← Firebase client config (Auth, Firestore w/ offline cache, Storage)
│   ├── package.json
│   └── vite.config.ts
├── backend\
│   ├── main.py                  ← FastAPI server (routes, Pydantic schemas)
│   ├── methods.py               ← RAG logic (embeddings, Firestore vector search, Gemini generation)
│   └── requirements.txt
└── CHANGELOG.md                 ← This file
```

### Key Files

| File | Purpose |
|------|---------|
| `frontend/src/app/App.tsx` | **The entire UI** — all components live here: Login, JournalApp, MemoriesApp, ChatApp, ProfileApp (System Monitor), SettingsApp, Win95Window shell, Desktop, Taskbar, StartMenu |
| `frontend/src/firebase.ts` | Firebase initialization with Firestore persistent offline caching via IndexedDB |
| `backend/main.py` | FastAPI server — `/api/journals` (embed + store), `/api/chat` (RAG query), authentication middleware |
| `backend/methods.py` | Core AI logic — Mistral embeddings, Firestore vector cosine similarity search, Gemini 2.5 Flash generation with personality system prompts |

---

## 🏗️ Architecture Overview

### Frontend (React + Vite)

The frontend is a **single-file monolith** (`App.tsx`) containing all components. This was intentional to keep the retro Win95 desktop simulation self-contained. Key architectural patterns:

- **Window Manager**: Each app (journal, memories, chat, etc.) is an `AppId` string. Windows are tracked via `Record<AppId, WinState>` with position, size, z-index, and minimized state.
- **Settings Propagation**: Settings like `desktopColor`, `journalFont`, `fontSize`, and `personality` are lifted to the root `App` component and passed down as props. They sync with `localStorage` via `useEffect` side-effects.
- **Firestore Queries**: All data reads use `getDocs(query(...))` from the Firebase SDK. Writes use `addDoc` and `updateDoc`.
- **No external routing** — the app is a single-page desktop simulation.

### Backend (FastAPI + Python)

- **Embedding Pipeline**: Journal entries are embedded using the Mistral Embeddings API (`mistral-embed` model) and stored as 768-dimensional float vectors in Firestore documents under `users/{uid}/vectors/`.
- **RAG Search**: On chat queries, the user's message is embedded, then cosine similarity is computed against all stored vectors to find the top-K most relevant journal entries.
- **Generation**: Retrieved entries are injected into a Gemini 2.5 Flash prompt as context. The system prompt varies based on the selected AI personality.
- **Auth**: Firebase Admin SDK verifies the `Authorization: Bearer <idToken>` header on all API routes.

### Firebase Services

- **Auth**: Email/password authentication
- **Firestore**: Collections structure: `users/{uid}/entries/{entryId}` for journal data
- **Storage**: `users/{uid}/images/` and `users/{uid}/audio/` for media attachments
- **Offline Cache**: Configured via `initializeFirestore` with `persistentLocalCache` and `persistentMultipleTabManager` — queries are cached in IndexedDB for instant loads

---

## 📝 All Changes Made (Chronological)

### Phase 1: Firebase Setup & Authentication
- Created Firebase project `mnema-memory-companion`
- Added Firebase SDK (`firebase@^12.15.0`) to frontend dependencies
- Created `firebase.ts` with `initializeApp`, `getAuth`, `getFirestore`, `getStorage`
- Built retro Win95 Login/Signup dialog in `App.tsx` with email/password auth
- Connected `onAuthStateChanged` observer to gate the desktop behind authentication

### Phase 2: Python Backend
- Set up FastAPI boilerplate with uvicorn
- Implemented Mistral Embeddings API integration in `methods.py` (replaced local SentenceTransformer)
- Set up Firebase Admin SDK for server-side auth verification
- Created `/api/journals` POST endpoint (embeds text + stores vector in Firestore)
- Created `/api/chat` POST endpoint (RAG query → Gemini response + references)
- Migrated all datastore operations from MongoDB/PyMongo to Firestore Admin SDK

### Phase 3: Firestore Database & Media
- Connected frontend "Save Entry" to write journal documents to `users/{uid}/entries/`
- Implemented photo upload to Firebase Storage with download URL stored in entry
- Implemented audio recording (MediaRecorder API) + upload to Firebase Storage
- Added image display in memory cards and audio playback controls

### Phase 4: RAG Chat Integration
- Connected frontend ChatApp to call `POST /api/chat` with user's message
- Added retro hourglass cursor and "thinking..." animation during API calls
- Built source citations drawer (`Show Sources ▼` toggle) showing referenced journal entries with dates, moods, and content snippets

### Phase 5: Extensions & Polish

#### 5a. Hashtag Tagging System
- **Save handler** (`JournalApp`, ~line 504): Regex `(?<![#\w])#(\w+)` extracts single `#word` hashtags from content, stores as `tags: string[]` array in Firestore
- **Memories toolbar** (~line 893): Dynamically extracts unique tags across all loaded entries, renders a `<select>` dropdown filter
- **Card labels** (~line 1001): Tags shown as small raised Win95 buttons at bottom of cards; clicking toggles filter
- **List view** (~line 1077): Tags shown inline after title in parentheses

#### 5b. System Monitor (formerly Profile App)
- Renamed "Profile" → "System Monitor" across desktop icons, start menu, window titles, and APP_CONFIG
- Replaced `IconProfile` with a 32×32 pixel CRT monitor SVG icon
- Built SVG stepped staircase mood graph with `shapeRendering: "crispEdges"`, square data points, dark-green CRT gridlines
- Added Resource Diagnostics list box (Gemini processor, embedding dimensions, RAG latency status)

#### 5c. Settings App (Fully Wired)
- **Display tab**: Desktop background color picker (Teal, Navy, Purple, Grey, Black) → dynamically updates CSS, persists in `localStorage`
- **Fonts tab**: Journal editor font family selector (Special Elite, Georgia, Times New Roman, Palatino, Sans-Serif) + size radios (Small/Medium/Large) with live preview
- **AI tab**: Personality selector (Friendly, Clinical, Poetic, Terse) → sent as `personality` field in `/api/chat` POST body → backend applies different system prompts in Gemini generation
- **Data tab**: Export Journal (.txt) button generates formatted text download; Clear All Data button with confirmation deletes all Firestore entries for the user

#### 5d. Firestore Offline Caching
- **File**: `frontend/src/firebase.ts`
- Changed from `getFirestore(app)` to `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`
- Enables IndexedDB-backed offline caching for all Firestore queries across multiple browser tabs

### Phase 6: Markdown Support & UI Enhancements (Current Session)

#### 6a. Chat Rename
- **All occurrences** of "Chat with Mnema" and "Chat w/ Mnema" renamed to simply **"Chat"**
- Affected: `StartMenu` items array (~line 2133), `APP_CONFIG.chat.title` (~line 2398), `DESKTOP_ICONS` array (~line 2415)

#### 6b. Markdown Renderer (`renderMarkdown` function)
- **Location**: `App.tsx`, starts at ~line 746
- **Purpose**: Custom lightweight markdown-to-React renderer (~120 lines, zero external dependencies)
- **Supported syntax**:
  - `**bold**` → `<strong>`
  - `*italic*` → `<em>`
  - `__underline__` → `<span style="text-decoration: underline">`
  - `` `code` `` → `<code>` with terminal font and sunken border
  - `~~strikethrough~~` → `<span>` with line-through and grey color
  - `## Heading` → Navy blue bold text with 2px solid bottom border
  - `### Sub-heading` → Smaller navy bold text with dotted bottom border
  - `- bullet` or `* bullet` → `<ul>` with square list markers
  - `1. numbered` → `<li>` items in the same list
  - `#hashtag` (single `#` only) → Retro raised Win95 tag label button
- **Key design decision**: Single `#word` patterns are treated as **tags** (rendered as retro button labels), NOT as headings. Only `##` and `###` (with a space after) render as headings. This is enforced by:
  - Inline regex negative lookbehind: `(?<![#\w])#(\w[\w]*)` ensures `##heading` doesn't match as a tag
  - Block-level heading checks run first (`/^##\s+/` and `/^###\s+/`) before inline processing

#### 6c. Journal Viewer Modal (Memories App)
- **Location**: `MemoriesApp` component, viewer modal starts at ~line 1253
- **Trigger**: Clicking any memory card (cards view) or table row (list view) opens the viewer
- **UI Design**: Win95 dialog with:
  - Blue gradient title bar with entry title and ✕ close button
  - Mood color bar strip (4px)
  - Info bar showing 📅 date and mood score
  - Image in sunken frame (if attached)
  - Parchment-colored (`#fffff0`) content area with rendered markdown
  - Audio player (if attached)
  - Tag labels as raised retro buttons
  - Bottom action bar with Edit and Close buttons
- **Interactions**:
  - Click backdrop → closes viewer
  - Edit button → closes viewer and opens the existing edit modal
  - All card/row button clicks use `e.stopPropagation()` to prevent double-triggering
- Added a new **"View"** button to both card and list action areas

#### 6d. Formatting Toolbar (Journal Editor)
- **Location**: `JournalApp` component, toolbar starts at ~line 560
- **Previous state**: Toolbar buttons were purely decorative (no `onClick` handlers)
- **New behavior**: Every button now inserts markdown syntax into the textarea:
  - `insertFormat(prefix, suffix)`: Wraps selected text with markdown tokens (e.g. `**selected**`). If no selection, inserts `**text**` with "text" pre-selected for overwriting.
  - `insertLinePrefix(prefix)`: Inserts a prefix (e.g. `## `, `- `, `1. `) at the beginning of the current line
- **Textarea ref**: Added `useRef<HTMLTextAreaElement>` and attached to the textarea element to read `selectionStart`/`selectionEnd`
- **Toolbar buttons**:
  - **B** → `insertFormat("**")` (bold)
  - **I** → `insertFormat("*")` (italic)
  - **U** → `insertFormat("__")` (underline)
  - **H2** → `insertLinePrefix("## ")` (heading)
  - **H3** → `insertLinePrefix("### ")` (sub-heading)
  - **•** → `insertLinePrefix("- ")` (bullet list)
  - **1.** → `insertLinePrefix("1. ")` (numbered list)
  - **~~** → `insertFormat("~~")` (strikethrough)
- Removed old non-functional buttons: `H1`, `A+`, `A-`
- Each button has a `title` tooltip showing the markdown syntax

#### 6e. Hashtag Extraction Fix
- **Location**: `JournalApp.handleSave`, ~line 504
- **Old regex**: `/#\w+/g` — would match `##heading` and extract "heading" as a tag
- **New regex**: `/(?<![#\w])#(\w+)/g` — negative lookbehind ensures only standalone single `#word` hashtags are extracted, not `##` or `###` heading prefixes

#### 6f. Resizable Windows
- **Component**: `Win95Window` (~line 352)
- **Design**: Added absolute-positioned resize handle overlays on the right edge, bottom edge, and bottom-right corner.
- **Size Grip**: Renders a custom retro-styled chiseled 6-dot diagonal size grip SVG inside the bottom-right corner.
- **Constraints**: Minimum size thresholds set at `minWidth: 250px` and `minHeight: 200px` to maintain window usability.

#### 6g. Draggable Desktop Icons
- **Config**: Assigned a unique key to each item in `DESKTOP_ICONS` so that positions can be individually persisted.
- **Persistence**: Tracks icon coordinates in `iconPositions` state, which is serialized and stored in `localStorage` on modifications.
- **Drag Logic**: Unified the mouse drag, window resizing, and icon drag logic under a single mouse event listener on the `document` level to optimize performance.

#### 6h. Screensavers & Inactivity Timer
- **Component**: `ScreenSaver` (~line 2564)
- **Features**: Canvas-based fullscreen rendering of classic animations:
  - **Starfield**: Outward star movement with speed acceleration and Z-projection.
  - **Flying Windows**: Colorful retro window flag outlines floating toward the viewport.
  - **Mystify**: Bouncing vector lines with custom trail decay and color hue shifting cycles.
- **Timer**: 60 seconds inactivity trigger using global document event checks (`mousemove`, `mousedown`, `keypress`, `scroll`, `touchstart`). Re-interaction cancels the screensaver instantly.
- **Preview**: Clickable "Preview" button in Display settings tab triggers screensaver immediately for user configuration checks.

#### 6i. Icon Resizing Engine
- **Component**: `DesktopIcon` (~line 2565)
- **Configurations**: Dynamic font-sizing, borders, vertical layout spacing, and icon sizes:
  - **Small (16x16)**: Compact grid spacing, 10px typography, 54px bounding width.
  - **Normal (32x32)**: Standard layouts, 11px typography, 68px bounding width.
  - **Large (48x48)**: Extended layouts, 13px typography, 84px bounding width.
- **State**: Persistent `iconSize` state saved automatically in `localStorage`.

#### 6j. Comedic Greyed-out Settings Controls
- **Design**: Greyed-out checkbox options and button properties with custom HTML `title` attributes that show vintage network/software failure jokes:
  - **Desktop Sounds**: Needs a Sound Blaster 16 ISA soundcard expansion.
  - **Reminders**: Reminders failed because the carrier pigeon got lost en route to 1998.
  - **Weekly summaries**: Epoc check failure because it is only day 1 of the virtual 1998 epoch.
  - **Data Backups**: Disk backup operations require a 1.44MB floppy disk insertion.

#### 6k. Maximize Button Multitasking Joke
- **Location**: `TitleBtn` (~line 313) and `Win95Window` (~line 438)
- **Features**: Disabled the window title bar maximize button (`□`) in all apps. Added a chiseled greyed-out visual layout and a hover tooltip: *"This application does not support full screen. It is 1998, multitasking is already a miracle!"*

#### 6l. MemoriesApp Card Resizing Option
- **Location**: `MemoriesApp` (~line 1078)
- **Features**: Added a select dropdown option inside the toolbar (only visible when viewing Cards) to change Card size:
  - **Small Cards**: CSS grid columns rescaled to `minmax(130px, 1fr)`, image heights set to `60px` (hides dummy "no image" blocks), paddings reduced to `4px`, descriptions clamped to 2 lines, font sizes scaled to `10px`, and audio players hidden.
  - **Medium Cards**: Standard `minmax(185px, 1fr)` columns, `90px` images, `6px` padding, 3 lines clamping, and `11px` font sizes.
  - **Large Cards**: Spacious `minmax(260px, 1fr)` columns, `130px` images, `10px` padding, 4 lines clamping, and `12px` font sizes.

#### 6m. App QOL Control Additions
- **JournalApp Close Button**: Added a dedicated "Close" button next to "Clear" inside the `JournalApp` bottom action panel. Triggering it invokes the `onClose` callback to hide the New Journal window shell.
- **MemoriesApp Refresh Button**: Added a "Refresh" button inside the `MemoriesApp` toolbar to trigger an immediate Firestore query refetch on click, enabling quick rendering of newly saved diary entries.

#### 6n. Embossed Desktop Wallpaper Text
- **Render Block**: Absolutely centered background label (`zIndex: 1`, `fontSize: 64px`, `pointerEvents: none`) styled with a vintage Windows 95 embossed text shadow (`color: rgba(0,0,0,0.18)`, `textShadow: 1px 1px 0 rgba(255,255,255,0.12)`).
- **Settings tab**: Added a preset selector drop-down and input field to custom-label the background screen:
  - **Presets**: *"Mnema '98"*, *"Mnemosyne"*, *"Mnema"*, *"It works on my machine!"*, and *"Insert Disk 2..."*.
  - **Custom text**: Enables custom typing with a 25-character width safety boundary.
- **State**: Persistent states `desktopText` and `desktopTextPreset` synced to `localStorage`.

#### 6o. Help & Support App Integration
- **Removed search app**: Deleted the boilerplate search desktop icon (which opened Memories).
- **New App**: Introduced the `HelpApp` component (~line 2140) with dynamic Win95 tabs (Welcome, New Journal, Memories, AI Chat, System Monitor, Settings) detailing instruction steps.
- **Onboarding Trigger**: Automatically opens and focuses the `HelpApp` window for first-time onboarding users. Utilizes a browser `localStorage` loader `mnema_help_opened` which is cleared on brand new registrations (`isSignUp`) to guarantee fresh onboarding experiences.

#### 6p. Recycle Bin Easter Eggs Dialog
- **Double click Interception**: Overrode standard double click on the Recycle Bin desktop icon to call `triggerRecycleJoke()` instead of launching a window shell.
- **Retro Alert Box**: Renders a floating modal dialog overlay (`zIndex: 99999`) styled in classic Win95 style (navy header, warning triangle sign, chiseled edges) presenting a randomly indexed joke.
- **Jokes Library**: Included a library of 15 custom retro-tech & emotional diagnostics jokes (such as write-protected memories, defragmenting emotional baggage, and floppy disk warnings).

---

## 🔧 Constants & Style System

These are defined near the top of `App.tsx` and used everywhere:

```typescript
const SYS_FONT = "'Pixelify Sans', 'Arial', sans-serif";     // UI labels, buttons, system text
const TERM_FONT = "'VT323', 'Courier New', monospace";        // Terminal/code/CRT text
const JOURNAL_FONT = "'Special Elite', 'Georgia', serif";     // Journal entry content

const raised: React.CSSProperties = { boxShadow: "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf" };
const sunken: React.CSSProperties = { boxShadow: "inset -1px -1px #ffffff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a" };
```

Key colors: `#c0c0c0` (Win95 grey), `#000080` (navy blue for title bars and headings), `#fffff0`/`#fffff8` (warm parchment for journal content)

---

## 📌 Pending / Future Tasks

| Task | Status | Notes |
|------|--------|-------|
| Make desktop icons movable (drag-and-drop) |  Completed | Persistent desktop coordinates saved in localStorage. |
| Add window resizing handles |  Completed | Right edge, bottom edge, and bottom-right corner. |
| Search app easter egg | ⬜ Not started | Currently opens Memories app. User plans to add a custom easter egg. |
| Recycle Bin easter egg | ⬜ Not started | Currently opens Memories app. User plans to add a custom easter egg. |

---

## 🖥️ How to Run

### Frontend
```bash
cd c:\Krishna\Code\Mnema\frontend
npm run dev
```
Opens at `http://localhost:5173`

### Backend
```bash
cd c:\Krishna\Code\Mnema\backend
python -m uvicorn main:app --reload
```
Runs at `http://localhost:8000`

> **⚠️ Important**: When modifying Pydantic request schemas in `main.py` (e.g. adding new fields to `ChatRequest`), the uvicorn `--reload` watcher may fail silently on Windows. You may need to manually stop (`Ctrl+C`) and restart the server.

---

## 🎨 Design Principles

1. **Authentic Windows 95 aesthetic**: Every element uses the raised/sunken box-shadow system, `#c0c0c0` grey backgrounds, navy blue title bars, and pixelated system fonts.
2. **No unused buttons**: Every visible UI element must be functional. Placeholder or decorative-only buttons are removed.
3. **Retro over modern**: Prefer stepped/staircase graphs over smooth curves, square nodes over circles, `crispEdges` rendering over anti-aliased, CRT green over sleek gradients.
4. **Lightweight**: No heavy external libraries for things we can build in ~100 lines (markdown renderer, tag system, formatting toolbar).
5. **Offline-first**: Firestore persistent cache ensures the app works instantly even without network.
