import { useState, useEffect, useRef, useCallback } from "react";
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  User
} from "firebase/auth";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../firebase";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────
type AppId = "journal" | "memories" | "chat" | "profile" | "settings" | "help" | "goals" | "terminal" | "creator" | "paint";

interface WinState {
  isOpen: boolean;
  isMinimized: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

interface JournalEntry {
  id: any;
  title: string;
  date: string;
  content: string;
  mood: number;
  image?: string;
  audio?: string;
  tags?: string[];
  doodle?: string;
}

interface ChatMessage {
  id: number;
  from: "user" | "mnema";
  text: string;
  time: string;
  references?: Array<{
    date: string;
    mood: number;
    data: string;
  }>;
}

// ─── Sample Data ──────────────────────────────────────────────────────────────
const ENTRIES: JournalEntry[] = [
  {
    id: 1,
    title: "First Day of Spring",
    date: "March 21, 1998",
    mood: 8,
    content:
      "Today was absolutely wonderful. I walked to the park near the house and the cherry blossoms were just starting to bloom. The air had that particular freshness that only comes in early spring, mixed with the scent of rain from last night. I sat on the bench by the pond and just watched the ducks for an hour. No particular thoughts, just peace.",
    image:
      "https://images.unsplash.com/photo-1490750967868-88df5691cc80?w=260&h=120&fit=crop&auto=format",
  },
  {
    id: 2,
    title: "Late Night Thoughts",
    date: "March 15, 1998",
    mood: 4,
    content:
      "Couldn't sleep again. The house makes strange sounds at 3am. Found myself thinking about dad's old radio in the garage. I used to sit next to it as a kid and listen to baseball games while he worked on the car. Wonder where that radio ended up. Sometimes I miss things I didn't know I was paying attention to.",
  },
  {
    id: 3,
    title: "Good Conversation",
    date: "March 8, 1998",
    mood: 7,
    content:
      "Had coffee with Linda today. We talked for three hours and I barely noticed the time passing. She has this way of listening that makes you feel like what you're saying actually matters. I don't have many friends like that. Feeling grateful tonight.",
    image:
      "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=260&h=120&fit=crop&auto=format",
  },
  {
    id: 4,
    title: "Frustrating Day at Work",
    date: "March 3, 1998",
    mood: 2,
    content:
      "The Henderson account fell through. Six months of work gone. Nobody talked much in the office after the news. Drove home in silence with the radio off for the first time I can remember. Made soup for dinner. Ate alone.",
  },
  {
    id: 5,
    title: "Weekend Baking",
    date: "February 28, 1998",
    mood: 9,
    content:
      "Tried mom's apple pie recipe for the first time. It actually worked! The kitchen smelled incredible all afternoon. Brought a slice to Mrs. Patterson next door. She cried a little — said it tasted like her own mother's. I just sat with her for a while. One of the better Saturdays I can remember.",
    image:
      "https://images.unsplash.com/photo-1568571780765-9276db73dec2?w=260&h=120&fit=crop&auto=format",
  },
  {
    id: 6,
    title: "The Dream Again",
    date: "February 22, 1998",
    mood: 5,
    content:
      "Had the recurring dream again. The one with the old house and the long hallway. I always wake up before reaching the door at the end. I've had this dream maybe twenty times over the years. I've never opened that door in the dream. Maybe that means something.",
  },
];

const INITIAL_CHAT: ChatMessage[] = [
  {
    id: 1,
    from: "mnema",
    text: "Hello. I'm Mnema, your memory companion. I've read all your journal entries and I'm here to help you revisit your past experiences, emotions, and moments. What would you like to know?",
    time: "11:42 AM",
  },
];

const AI_RESPONSES: Record<string, string> = {
  default:
    "Based on your journal entries, March 1998 has been an emotionally varied month. You've had beautiful moments of connection — like that coffee with Linda on March 8th — and some difficult times, like the Henderson account falling through on March 3rd. Your writing suggests someone who finds meaning in quiet, everyday moments.",
  "What did I do last week?":
    "Last week, you experienced the Henderson account loss on March 3rd, which left you feeling quite low (mood: 2/10). You also had coffee with Linda on March 8th which lifted your spirits considerably (mood: 7/10). The week had significant emotional contrast — disappointment followed by genuine connection.",
  "How was my mood in March?":
    "Your mood in March 1998 varied considerably. You hit a low of 2/10 on March 3rd with work troubles, recovered to 7/10 on March 8th after a meaningful conversation, and reached 8/10 on March 21st enjoying the first day of spring. Your March average is approximately 5.7/10.",
  "When was I happiest?":
    "Your happiest recorded day was February 28th when you successfully baked your mother's apple pie recipe for the first time — you gave that day a 9/10. You described it as 'one of the better Saturdays I can remember.' The moment you shared it with Mrs. Patterson next door seemed particularly meaningful.",
  "Summarize this month.":
    "March 1998 was a month of contrasts. Work brought real disappointment early on, but you found deep joy in simple things: a good conversation with Linda, and a peaceful spring afternoon in the park. Your entries show a pattern — you recover from difficulty by returning to quiet, sensory pleasures. Average mood: 5.7/10 across 4 entries.",
  "What recurring themes do I have?":
    "Looking across your entries, several themes appear repeatedly: solitude and introspective late nights, nostalgia for your father and childhood, the comfort of domestic rituals (baking, walking), and the rarity and preciousness of genuine human connection. You seem to process emotions through small, grounded experiences rather than dramatic gestures.",
  "When did I feel lonely?":
    "March 3rd was your most clearly lonely entry — 'made soup for dinner, ate alone' after a difficult day at work. Your February 22nd entry about the recurring dream also carries a quiet undercurrent of loneliness. Interestingly, these low points often precede your most reflective and beautiful writing.",
};

// ─── Win95 style helpers ──────────────────────────────────────────────────────
const raised: React.CSSProperties = {
  boxShadow:
    "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf",
};
const sunken: React.CSSProperties = {
  boxShadow:
    "inset -1px -1px #ffffff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a",
};
const SYS_FONT = "'Pixelify Sans', 'Arial', sans-serif";
const TERM_FONT = "'VT323', 'Courier New', monospace";
const JOURNAL_FONT = "'Special Elite', 'Georgia', serif";

function moodColor(mood: number): string {
  if (mood <= 3) return "#b03030";
  if (mood <= 6) return "#a08020";
  return "#2a7a2a";
}

function moodBg(mood: number): string {
  if (mood <= 3) return "#ffd0d0";
  if (mood <= 6) return "#fff8d0";
  return "#d0f0d0";
}

// ─── Pixel Icons ──────────────────────────────────────────────────────────────
function IconJournal({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ imageRendering: "pixelated" }}>
      <rect x="5" y="2" width="22" height="28" fill="#ffffc8" stroke="#000" strokeWidth="1" />
      <rect x="5" y="2" width="5" height="28" fill="#2828c0" stroke="#000" strokeWidth="0.5" />
      <line x1="13" y1="8" x2="24" y2="8" stroke="#a0a080" strokeWidth="1" />
      <line x1="13" y1="12" x2="24" y2="12" stroke="#a0a080" strokeWidth="1" />
      <line x1="13" y1="16" x2="24" y2="16" stroke="#a0a080" strokeWidth="1" />
      <line x1="13" y1="20" x2="21" y2="20" stroke="#a0a080" strokeWidth="1" />
      <rect x="20" y="19" width="8" height="10" fill="#c0c0c0" stroke="#000" strokeWidth="0.5" />
      <line x1="22" y1="22" x2="26" y2="22" stroke="#404040" strokeWidth="1" />
      <line x1="22" y1="24" x2="26" y2="24" stroke="#404040" strokeWidth="1" />
      <line x1="22" y1="26" x2="25" y2="26" stroke="#404040" strokeWidth="1" />
    </svg>
  );
}

function IconFolder({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ imageRendering: "pixelated" }}>
      <path d="M2 11 L30 11 L30 28 L2 28 Z" fill="#e0a020" stroke="#000" strokeWidth="1" />
      <path d="M2 11 L2 28 L30 28 L30 11" fill="none" stroke="#000" strokeWidth="1" />
      <path d="M2 11 L12 11 L14 8 L20 8 L20 11" fill="#d09010" stroke="#000" strokeWidth="1" />
      <line x1="2" y1="14" x2="30" y2="14" stroke="#c08010" strokeWidth="1" />
      <rect x="2" y="11" width="28" height="17" fill="#f0c040" stroke="none" opacity="0.6" />
      <path d="M2 11 L12 11 L14 8 L20 8 L20 11" fill="#e0a820" />
    </svg>
  );
}

function IconChat({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ imageRendering: "pixelated" }}>
      <rect x="1" y="3" width="28" height="20" fill="#ffffff" stroke="#000" strokeWidth="1" />
      <rect x="1" y="3" width="28" height="5" fill="#000080" />
      <rect x="3" y="5" width="6" height="1" fill="#ffffff" />
      <rect x="10" y="5" width="4" height="1" fill="#ffffff" />
      <rect x="3" y="11" width="12" height="2" fill="#000080" opacity="0.7" rx="1" />
      <rect x="3" y="15" width="18" height="2" fill="#c0c0c0" rx="1" />
      <rect x="17" y="11" width="8" height="2" fill="#a0a0a0" rx="1" />
      <polygon points="5,23 11,23 8,29" fill="#ffffff" stroke="#000" strokeWidth="1" />
    </svg>
  );
}

function IconProfile({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ imageRendering: "pixelated" }}>
      {/* Monitor outer cabinet */}
      <rect x="2" y="3" width="28" height="20" fill="#c0c0c0" stroke="#000" strokeWidth="1" />
      <rect x="3" y="4" width="26" height="18" fill="#dfdfdf" stroke="#fff" strokeWidth="1" />
      
      {/* Bezel inner shadow */}
      <rect x="5" y="6" width="22" height="14" fill="#808080" />
      {/* Dark screen */}
      <rect x="6" y="7" width="20" height="12" fill="#000000" />
      
      {/* Monitor Stand/Base */}
      <rect x="12" y="23" width="8" height="4" fill="#808080" stroke="#000" strokeWidth="1" />
      <path d="M7 27 L25 27 L23 29 L9 29 Z" fill="#c0c0c0" stroke="#000" strokeWidth="1" />
      
      {/* Grid lines inside CRT screen */}
      <line x1="6" y1="13" x2="26" y2="13" stroke="#003300" strokeWidth="0.5" />
      <line x1="16" y1="7" x2="16" y2="19" stroke="#003300" strokeWidth="0.5" />
      
      {/* Pixelated green line graph */}
      <path d="M 7 16 H 11 V 11 H 16 V 14 H 21 V 9 H 25" fill="none" stroke="#00ff00" strokeWidth="1" />
    </svg>
  );
}

function IconSettings({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ imageRendering: "pixelated" }}>
      {/* Control panel body */}
      <rect x="3" y="5" width="26" height="22" rx="2" fill="#c0c0c0" stroke="#000" strokeWidth="1" />
      {/* Top bezel */}
      <rect x="3" y="5" width="26" height="5" fill="#000080" stroke="#000" strokeWidth="1" rx="2" />
      <rect x="3" y="8" width="26" height="2" fill="#000080" />
      {/* Title dots */}
      <circle cx="7" cy="8" r="1" fill="#fff" />
      <circle cx="10" cy="8" r="1" fill="#fff" />
      {/* Slider track 1 */}
      <rect x="7" y="14" width="12" height="2" fill="#808080" rx="1" />
      <rect x="14" y="12" width="4" height="6" fill="#dfdfdf" stroke="#000" strokeWidth="0.5" rx="1" />
      {/* Slider track 2 */}
      <rect x="7" y="21" width="12" height="2" fill="#808080" rx="1" />
      <rect x="10" y="19" width="4" height="6" fill="#dfdfdf" stroke="#000" strokeWidth="0.5" rx="1" />
      {/* Toggle switch */}
      <rect x="22" y="13" width="5" height="4" fill="#008000" stroke="#000" strokeWidth="0.5" rx="1" />
      <rect x="22" y="20" width="5" height="4" fill="#800000" stroke="#000" strokeWidth="0.5" rx="1" />
    </svg>
  );
}

function IconRecycle({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ imageRendering: "pixelated" }}>
      <rect x="6" y="12" width="20" height="17" fill="#ffffff" stroke="#000" strokeWidth="1" />
      <rect x="4" y="10" width="24" height="4" fill="#c0c0c0" stroke="#000" strokeWidth="1" />
      <rect x="11" y="6" width="10" height="4" fill="#c0c0c0" stroke="#000" strokeWidth="1" />
      <line x1="10" y1="16" x2="10" y2="26" stroke="#808080" strokeWidth="1" />
      <line x1="16" y1="16" x2="16" y2="26" stroke="#808080" strokeWidth="1" />
      <line x1="22" y1="16" x2="22" y2="26" stroke="#808080" strokeWidth="1" />
    </svg>
  );
}

function IconHelp({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ imageRendering: "pixelated" }}>
      {/* Book outline */}
      <rect x="6" y="4" width="20" height="24" rx="2" fill="#3a86c8" stroke="#000000" strokeWidth="1.5" />
      {/* Pages edge */}
      <rect x="23" y="6" width="3" height="20" fill="#ffffff" />
      {/* Book title lines */}
      <line x1="10" y1="8" x2="20" y2="8" stroke="#ffffff" strokeWidth="1.5" />
      {/* Embossed Question Mark */}
      <text x="14" y="21" fontFamily="sans-serif" fontSize="14px" fontWeight="bold" fill="#ffffff" textAnchor="middle">?</text>
    </svg>
  );
}

function IconTimeMachine({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ imageRendering: "pixelated" }}>
      {/* Hourglass frame */}
      <rect x="7" y="3" width="18" height="3" fill="#808080" stroke="#000" strokeWidth="1" rx="1" />
      <rect x="7" y="26" width="18" height="3" fill="#808080" stroke="#000" strokeWidth="1" rx="1" />
      {/* Glass body top */}
      <path d="M9,6 L9,12 Q16,18 23,12 L23,6 Z" fill="#dceef8" stroke="#000" strokeWidth="1" />
      {/* Glass body bottom */}
      <path d="M9,26 L9,20 Q16,14 23,20 L23,26 Z" fill="#dceef8" stroke="#000" strokeWidth="1" />
      {/* Sand top */}
      <path d="M11,7 L11,10 Q16,14 21,10 L21,7 Z" fill="#f0c040" opacity="0.7" />
      {/* Sand bottom */}
      <path d="M12,25 L12,22 Q16,19 20,22 L20,25 Z" fill="#f0c040" opacity="0.9" />
      {/* Center stream */}
      <line x1="16" y1="13" x2="16" y2="19" stroke="#f0c040" strokeWidth="1.5" />
      {/* Decorative dots */}
      <circle cx="16" cy="16" r="1" fill="#000080" />
    </svg>
  );
}

function IconTerminal({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ imageRendering: "pixelated" }}>
      {/* Computer monitor border */}
      <rect x="3" y="4" width="26" height="20" rx="1.5" fill="#c0c0c0" stroke="#000000" strokeWidth="1.5" />
      {/* Black screen */}
      <rect x="5" y="6" width="22" height="16" fill="#000000" />
      {/* Monitor base */}
      <path d="M12,24 L20,24 L22,28 L10,28 Z" fill="#808080" stroke="#000000" strokeWidth="1.5" />
      {/* Command prompt symbol */}
      <path d="M8,10 L11,12 L8,14" fill="none" stroke="#00ff00" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="14" x2="16" y2="14" stroke="#00ff00" strokeWidth="1.5" />
    </svg>
  );
}

function IconPaint({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ imageRendering: "pixelated" }}>
      {/* Painter's palette shape */}
      <path d="M 6,12 C 6,6 26,4 26,14 C 26,24 18,28 12,28 C 6,28 6,18 6,12 Z" fill="#d8b48f" stroke="#000" strokeWidth="1.5" />
      <circle cx="12" cy="10" r="2.5" fill="#ff0000" />
      <circle cx="18" cy="11" r="2.5" fill="#00ff00" />
      <circle cx="20" cy="17" r="2.5" fill="#0000ff" />
      <circle cx="14" cy="21" r="2.5" fill="#ffff00" />
      <ellipse cx="10" cy="16" rx="1.5" ry="2.5" fill="#808080" stroke="#000" strokeWidth="1" />
      <path d="M 28,4 L 16,18" stroke="#8b5a2b" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 16,18 L 14,20" stroke="#ff00ff" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── Win95 Button ─────────────────────────────────────────────────────────────
function W95Btn({
  children,
  onClick,
  small,
  active,
  style: extraStyle,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  small?: boolean;
  active?: boolean;
  style?: React.CSSProperties;
}) {
  const [pressed, setPressed] = useState(false);
  const down = pressed || active;
  return (
    <button
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        background: "#c0c0c0",
        border: "none",
        cursor: "default",
        fontFamily: SYS_FONT,
        fontSize: small ? "11px" : "12px",
        padding: small ? "1px 6px" : "3px 12px",
        minWidth: small ? undefined : "72px",
        userSelect: "none",
        boxShadow: down
          ? "inset -1px -1px #ffffff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a"
          : "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf",
        ...extraStyle,
      }}
    >
      {children}
    </button>
  );
}

// ─── Title Bar Control Button ─────────────────────────────────────────────────
function TitleBtn({ 
  label, 
  onClick, 
  disabled = false, 
  title 
}: { 
  label: string; 
  onClick: () => void; 
  disabled?: boolean; 
  title?: string;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (!disabled) setPressed(true);
      }}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      title={title}
      style={{
        width: "16px",
        height: "14px",
        background: "#c0c0c0",
        border: "none",
        cursor: disabled ? "help" : "default",
        fontSize: "9px",
        fontFamily: "Arial, sans-serif",
        fontWeight: "bold",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: disabled ? "#808080" : "#000",
        flexShrink: 0,
        boxShadow: pressed && !disabled
          ? "inset -1px -1px #ffffff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a"
          : "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf",
      }}
    >
      {label}
    </button>
  );
}

// ─── Win95 Window Shell ───────────────────────────────────────────────────────
function Win95Window({
  id,
  title,
  state,
  isActive,
  onClose,
  onMinimize,
  onFocus,
  onDragStart,
  onResizeStart,
  children,
}: {
  id: AppId;
  title: string;
  state: WinState;
  isActive: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onFocus: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  onResizeStart?: (e: React.MouseEvent, dir: "r" | "b" | "se") => void;
  children: React.ReactNode;
}) {
  if (!state.isOpen || state.isMinimized) return null;
  return (
    <div
      onMouseDown={onFocus}
      style={{
        position: "absolute",
        left: state.x,
        top: state.y,
        width: state.width,
        height: state.height,
        zIndex: state.zIndex,
        display: "flex",
        flexDirection: "column",
        background: "#c0c0c0",
        boxShadow:
          "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf, 3px 3px 0 #000000",
        fontFamily: SYS_FONT,
      }}
    >
      {/* Title bar */}
      <div
        onMouseDown={onDragStart}
        style={{
          background: isActive
            ? "linear-gradient(to right, #000080, #1084d0)"
            : "#808080",
          padding: "3px 4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "4px",
          cursor: "move",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: "white",
            fontSize: "11px",
            fontWeight: "bold",
            fontFamily: SYS_FONT,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {title}
        </span>
        <div style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
          <TitleBtn label="—" onClick={onMinimize} />
          <TitleBtn 
            label="□" 
            onClick={() => {}} 
            disabled 
            title="This application does not support full screen. It is 1998, multitasking is already a miracle!"
          />
          <TitleBtn label="✕" onClick={onClose} />
        </div>
      </div>
      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>
        {children}
      </div>

      {/* Resize handles */}
      <div
        onMouseDown={(e) => onResizeStart && onResizeStart(e, "r")}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: "4px",
          height: "100%",
          cursor: "e-resize",
          zIndex: 9999,
        }}
      />
      <div
        onMouseDown={(e) => onResizeStart && onResizeStart(e, "b")}
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: "100%",
          height: "4px",
          cursor: "s-resize",
          zIndex: 9999,
        }}
      />
      <div
        onMouseDown={(e) => onResizeStart && onResizeStart(e, "se")}
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: "12px",
          height: "12px",
          cursor: "se-resize",
          zIndex: 10000,
        }}
      >
        {/* Retro Win95 diagonal dotted size grip */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          style={{
            position: "absolute",
            right: "1px",
            bottom: "1px",
            pointerEvents: "none",
          }}
        >
          {/* Row 3 (bottom-most) */}
          <rect x="8" y="8" width="1.5" height="1.5" fill="#808080" />
          <rect x="9" y="9" width="1.5" height="1.5" fill="#ffffff" />
          <rect x="5" y="8" width="1.5" height="1.5" fill="#808080" />
          <rect x="6" y="9" width="1.5" height="1.5" fill="#ffffff" />
          <rect x="2" y="8" width="1.5" height="1.5" fill="#808080" />
          <rect x="3" y="9" width="1.5" height="1.5" fill="#ffffff" />

          {/* Row 2 */}
          <rect x="8" y="5" width="1.5" height="1.5" fill="#808080" />
          <rect x="9" y="6" width="1.5" height="1.5" fill="#ffffff" />
          <rect x="5" y="5" width="1.5" height="1.5" fill="#808080" />
          <rect x="6" y="6" width="1.5" height="1.5" fill="#ffffff" />

          {/* Row 1 (top-most) */}
          <rect x="8" y="2" width="1.5" height="1.5" fill="#808080" />
          <rect x="9" y="3" width="1.5" height="1.5" fill="#ffffff" />
        </svg>
      </div>
    </div>
  );
}

// ─── Inset Input / Textarea shared style ──────────────────────────────────────
function inputStyle(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    background: "#ffffff",
    border: "none",
    boxShadow:
      "inset -1px -1px #ffffff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a",
    padding: "2px 4px",
    fontFamily: SYS_FONT,
    fontSize: "12px",
    outline: "none",
    ...extra,
  };
}

// ─── Menu Bar ─────────────────────────────────────────────────────────────────
function MenuBar({ items }: { items: string[] }) {
  const [active, setActive] = useState<string | null>(null);
  return (
    <div
      style={{
        borderBottom: "1px solid #808080",
        padding: "1px 4px",
        display: "flex",
        gap: "0",
        fontSize: "12px",
        background: "#c0c0c0",
        flexShrink: 0,
      }}
    >
      {items.map((m) => (
        <button
          key={m}
          onMouseDown={() => setActive(active === m ? null : m)}
          onBlur={() => setActive(null)}
          style={{
            cursor: "default",
            padding: "2px 6px",
            background: active === m ? "#000080" : "transparent",
            color: active === m ? "white" : "black",
            border: "none",
            fontFamily: SYS_FONT,
            fontSize: "12px",
          }}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function DoodleRenderer({ data, size = 64 }: { data: string; size?: number }) {
  if (!data || data.length < 1024) return null;
  const palette = [
    "transparent",
    "#000000",
    "#808080",
    "#c0c0c0",
    "#ffffff",
    "#800000",
    "#ff0000",
    "#808000",
    "#ffff00",
    "#008000",
    "#00ff00",
    "#008080",
    "#00ffff",
    "#000080",
    "#0000ff",
    "#800080",
  ];
  const rects = [];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const char = data[y * 32 + x];
      const colorIndex = parseInt(char, 16);
      const fill = palette[colorIndex] || "transparent";
      if (fill !== "transparent") {
        rects.push(
          <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={fill} />
        );
      }
    }
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ imageRendering: "pixelated", background: "#ffffff", border: "1px solid #808080" }}>
      {rects}
    </svg>
  );
}

// ─── Journal App ──────────────────────────────────────────────────────────────
function JournalApp({ 
  user, 
  journalFont, 
  fontSize,
  currentDoodle,
  setCurrentDoodle,
  onOpenPaint,
  onClose
}: { 
  user: any; 
  journalFont: string; 
  fontSize: string;
  currentDoodle: string | null;
  setCurrentDoodle: (val: string | null) => void;
  onOpenPaint: () => void;
  onClose?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [content, setContent] = useState("");
  const [mood, setMood] = useState(5);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!content.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      // Extract hashtags from content (ignore ## headings — only single #word)
      const hashtags = content.match(/(?<![#\w])#(\w+)/g) || [];
      const tags = hashtags.map((t) => t.substring(1).toLowerCase());

      // 1. Save original entry to Firestore
      const entryData = {
        title: title.trim() || "Untitled",
        date: date,
        content: content,
        mood: mood,
        imageUrl: null,
        audioUrl: null,
        tags: tags,
        doodle: currentDoodle,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "users", user.uid, "entries"), entryData);

      // 2. Get User Token
      const token = await user.getIdToken();

      // 3. Post to backend RAG API
      const response = await fetch(`${BACKEND_URL}/api/journals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          text: `Title: ${entryData.title}\nDate: ${entryData.date}\n\n${content}`,
          mood: mood,
          date: date
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to index journal in RAG backend.");
      }

      setSaved(true);
      setTitle("");
      setContent("");
      setMood(5);
      setCurrentDoodle(null);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to save journal.");
    } finally {
      setSaving(false);
    }
  };

  const mc = moodColor(mood);
  const moodLabel =
    mood <= 2 ? "Terrible" : mood <= 4 ? "Low" : mood <= 6 ? "Okay" : mood <= 8 ? "Good" : "Amazing";

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Insert markdown wrapper around selected text or at cursor
  const insertFormat = (prefix: string, suffix: string = "") => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.substring(start, end);
    const suf = suffix || prefix;
    const replacement = selected
      ? `${prefix}${selected}${suf}`
      : `${prefix}text${suf}`;
    const newContent = content.substring(0, start) + replacement + content.substring(end);
    setContent(newContent);
    // Restore focus and cursor after React re-render
    setTimeout(() => {
      ta.focus();
      const cursorPos = selected
        ? start + replacement.length
        : start + prefix.length; // place cursor on "text"
      ta.selectionStart = cursorPos;
      ta.selectionEnd = selected ? cursorPos : start + prefix.length + 4;
    }, 0);
  };

  // Insert a line prefix (heading or list) at the beginning of the current line
  const insertLinePrefix = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    // Find the start of the current line
    const lineStart = content.lastIndexOf("\n", pos - 1) + 1;
    const newContent = content.substring(0, lineStart) + prefix + content.substring(lineStart);
    setContent(newContent);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = pos + prefix.length;
    }, 0);
  };

  type ToolbarItem = { label: string; action: () => void; bold?: boolean; italic?: boolean; underline?: boolean } | "|";

  const toolbarItems: ToolbarItem[] = [
    { label: "B", action: () => insertFormat("**"), bold: true },
    { label: "I", action: () => insertFormat("*"), italic: true },
    { label: "U", action: () => insertFormat("__"), underline: true },
    "|",
    { label: "H2", action: () => insertLinePrefix("## "), bold: true },
    { label: "H3", action: () => insertLinePrefix("### "), bold: true },
    "|",
    { label: "•", action: () => insertLinePrefix("- ") },
    { label: "1.", action: () => insertLinePrefix("1. ") },
    "|",
    { label: "~~", action: () => insertFormat("~~") },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <MenuBar items={["File", "Edit", "Format", "View", "Help"]} />
      {/* Formatting Toolbar */}
      <div
        style={{
          borderBottom: "1px solid #808080",
          padding: "2px 4px",
          display: "flex",
          gap: "2px",
          alignItems: "center",
          background: "#c0c0c0",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        {toolbarItems.map((t, i) =>
          t === "|" ? (
            <div
              key={i}
              style={{
                width: "1px",
                height: "18px",
                background: "#808080",
                borderRight: "1px solid #ffffff",
                margin: "0 2px",
              }}
            />
          ) : (
            <button
              key={i}
              onClick={t.action}
              title={t.label === "B" ? "Bold (**text**)" : t.label === "I" ? "Italic (*text*)" : t.label === "U" ? "Underline (__text__)" : t.label === "H2" ? "Heading (## )" : t.label === "H3" ? "Sub-heading (### )" : t.label === "•" ? "Bullet list (- )" : t.label === "1." ? "Numbered list (1. )" : t.label === "~~" ? "Strikethrough (~~text~~)" : ""}
              style={{
                minWidth: "22px",
                height: "20px",
                background: "#c0c0c0",
                border: "none",
                cursor: "default",
                fontSize: "11px",
                fontWeight: t.bold ? "bold" : "normal",
                fontStyle: t.italic ? "italic" : "normal",
                textDecoration: t.underline ? "underline" : "none",
                fontFamily: "Arial, sans-serif",
                padding: "0 3px",
                ...raised,
              }}
            >
              {t.label}
            </button>
          )
        )}
      </div>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "8px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        {/* Title */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label style={{ fontSize: "12px", width: "42px", flexShrink: 0 }}>Title:</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Entry title..."
            style={{ ...inputStyle({ flex: 1, fontFamily: JOURNAL_FONT, fontSize: "13px" }) }}
          />
        </div>
        {/* Date */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label style={{ fontSize: "12px", width: "42px", flexShrink: 0 }}>Date:</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ ...inputStyle({ fontFamily: SYS_FONT }) }}
          />
        </div>
        {/* Mood */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label style={{ fontSize: "12px", width: "42px", flexShrink: 0 }}>Mood:</label>
          <div
            style={{ flex: 1, display: "flex", alignItems: "center", gap: "6px" }}
          >
            <span style={{ fontSize: "13px" }}>:(</span>
            <div style={{ flex: 1, position: "relative", height: "18px", ...sunken }}>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  height: "100%",
                  width: `${mood * 10}%`,
                  background: mc,
                  transition: "width 0.1s, background 0.2s",
                }}
              />
              <input
                type="range"
                min="1"
                max="10"
                value={mood}
                onChange={(e) => setMood(Number(e.target.value))}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  opacity: 0,
                  cursor: "default",
                }}
              />
            </div>
            <span style={{ fontSize: "13px" }}>:)</span>
            <span
              style={{
                fontSize: "11px",
                color: mc,
                fontWeight: "bold",
                width: "90px",
                flexShrink: 0,
              }}
            >
              {mood}/10 — {moodLabel}
            </span>
          </div>
        </div>
        {/* Content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "180px" }}>
          <label style={{ fontSize: "12px", marginBottom: "4px" }}>Entry:</label>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your thoughts here..."
            style={{
              flex: 1,
              padding: "8px",
              fontSize: fontSize === "small" ? "12px" : fontSize === "large" ? "18px" : "14px",
              lineHeight: "1.7",
              fontFamily:
                journalFont.toLowerCase() === "georgia"
                  ? "Georgia, serif"
                  : journalFont.toLowerCase() === "times new roman"
                  ? "'Times New Roman', Times, serif"
                  : journalFont.toLowerCase() === "palatino"
                  ? "'Palatino Linotype', Palatino, serif"
                  : journalFont.toLowerCase() === "sans-serif"
                  ? "Arial, Helvetica, sans-serif"
                  : JOURNAL_FONT,
              resize: "none",
              color: "#1a1208",
              ...sunken,
              background: "#fffff8",
            }}
          />
        </div>
        {/* Doodle Attachment */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", border: "1px solid #808080", padding: "6px", background: "#dfdfdf", ...sunken, flexShrink: 0 }}>
          <div style={{ fontSize: "11px", fontWeight: "bold", color: "#000" }}>✏️ Attached Doodle:</div>
          {currentDoodle ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <DoodleRenderer data={currentDoodle} size={32} />
              <button
                onClick={onOpenPaint}
                style={{
                  background: "#c0c0c0",
                  border: "none",
                  cursor: "default",
                  fontSize: "11px",
                  padding: "2px 6px",
                  boxShadow: "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf",
                  fontFamily: SYS_FONT,
                }}
              >
                Edit
              </button>
              <button
                onClick={() => setCurrentDoodle(null)}
                style={{
                  background: "#c0c0c0",
                  border: "none",
                  cursor: "default",
                  fontSize: "11px",
                  padding: "2px 6px",
                  boxShadow: "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf",
                  fontFamily: SYS_FONT,
                  color: "#a00000",
                }}
              >
                Remove
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "11px", color: "#666", fontStyle: "italic" }}>None</span>
              <button
                onClick={onOpenPaint}
                style={{
                  background: "#c0c0c0",
                  border: "none",
                  cursor: "default",
                  fontSize: "11px",
                  padding: "2px 6px",
                  boxShadow: "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf",
                  fontFamily: SYS_FONT,
                }}
              >
                Draw Doodle
              </button>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
          {error && (
            <span style={{ fontSize: "11px", color: "#a00000", marginRight: "auto" }}>
              {error}
            </span>
          )}
          {saved && (
            <span style={{ fontSize: "12px", color: "#206020" }}>
              Entry saved successfully.
            </span>
          )}
          <W95Btn
            onClick={handleSave}
            style={{ opacity: saving || !content.trim() ? 0.6 : 1 }}
          >
            {saving ? "Saving..." : "Save Entry"}
          </W95Btn>
          <W95Btn onClick={() => { setTitle(""); setContent(""); setMood(5); setError(null); }}>Clear</W95Btn>
          {onClose && <W95Btn onClick={onClose}>Close</W95Btn>}
        </div>
      </div>
    </div>
  );
}

// ─── Memories App ─────────────────────────────────────────────────────────────
// ─── Simple Markdown Renderer ─────────────────────────────────────────────────
// Renders basic markdown: **bold**, *italic*, __underline__, ~~strikethrough~~,
// `code`, ## headings, ### sub-headings, - bullet lists.
// Single #hashtags are rendered as styled tag labels (not headings).
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let keyCounter = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${keyCounter++}`} style={{ margin: "4px 0 4px 18px", padding: 0, listStyleType: "square" }}>
          {listItems}
        </ul>
      );
      listItems = [];
    }
  };

  // Process inline markdown within a single line
  const processInline = (line: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    // Regex order: bold first, then underline, then italic, then code, strikethrough, hashtag
    // #hashtag only matches a single # followed by word chars (not ## or ###)
    const inlineRegex = /(\*\*(.+?)\*\*)|(__(.+?)__)|(\*(.+?)\*)|(`(.+?)`)|(~~(.+?)~~)|(?<![#\w])(#(\w[\w]*))/g;
    let lastIndex = 0;
    let match;

    while ((match = inlineRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }

      if (match[1]) {
        // **bold**
        parts.push(<strong key={`b-${keyCounter++}`}>{match[2]}</strong>);
      } else if (match[3]) {
        // __underline__
        parts.push(
          <span key={`u-${keyCounter++}`} style={{ textDecoration: "underline" }}>
            {match[4]}
          </span>
        );
      } else if (match[5]) {
        // *italic*
        parts.push(<em key={`i-${keyCounter++}`}>{match[6]}</em>);
      } else if (match[7]) {
        // `inline code`
        parts.push(
          <code
            key={`c-${keyCounter++}`}
            style={{
              background: "#e8e8e8",
              border: "1px solid #808080",
              padding: "0 3px",
              fontFamily: TERM_FONT,
              fontSize: "inherit",
            }}
          >
            {match[8]}
          </code>
        );
      } else if (match[9]) {
        // ~~strikethrough~~
        parts.push(
          <span key={`s-${keyCounter++}`} style={{ textDecoration: "line-through", color: "#808080" }}>
            {match[10]}
          </span>
        );
      } else if (match[11]) {
        // #hashtag (single #) → render as retro tag label
        parts.push(
          <span
            key={`tag-${keyCounter++}`}
            style={{
              background: "#dfdfdf",
              border: "1px solid #808080",
              padding: "0px 4px",
              fontSize: "inherit",
              fontFamily: SYS_FONT,
              boxShadow: "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff",
              marginLeft: "2px",
              marginRight: "2px",
            }}
          >
            #{match[12]}
          </span>
        );
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    return parts.length > 0 ? parts : [line];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // ### Sub-heading (must check before ##)
    const h3Match = trimmed.match(/^###\s+(.+)$/);
    if (h3Match) {
      flushList();
      elements.push(
        <div
          key={`h3-${keyCounter++}`}
          style={{
            fontSize: "13px",
            fontWeight: "bold",
            fontFamily: SYS_FONT,
            color: "#000080",
            margin: "8px 0 3px 0",
            paddingBottom: "2px",
            borderBottom: "1px dotted #808080",
          }}
        >
          {processInline(h3Match[1])}
        </div>
      );
      continue;
    }

    // ## Heading
    const h2Match = trimmed.match(/^##\s+(.+)$/);
    if (h2Match) {
      flushList();
      elements.push(
        <div
          key={`h2-${keyCounter++}`}
          style={{
            fontSize: "14px",
            fontWeight: "bold",
            fontFamily: SYS_FONT,
            color: "#000080",
            margin: "10px 0 4px 0",
            paddingBottom: "3px",
            borderBottom: "2px solid #000080",
          }}
        >
          {processInline(h2Match[1])}
        </div>
      );
      continue;
    }

    // Bullet list items: - item or * item (only if preceded by a dash/asterisk and space)
    if (/^[-*]\s+/.test(trimmed)) {
      const content = trimmed.replace(/^[-*]\s+/, "");
      listItems.push(<li key={`li-${keyCounter++}`}>{processInline(content)}</li>);
      continue;
    }

    // Numbered list items: 1. item
    const numMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (numMatch) {
      // Treat as bullet-style for simplicity inside the same list
      listItems.push(<li key={`li-${keyCounter++}`}>{processInline(numMatch[1])}</li>);
      continue;
    }

    flushList();

    // Empty line → spacer
    if (trimmed === "") {
      elements.push(<div key={`br-${keyCounter++}`} style={{ height: "8px" }} />);
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${keyCounter++}`} style={{ margin: "3px 0", lineHeight: "1.5" }}>
        {processInline(trimmed)}
      </p>
    );
  }

  flushList();
  return elements;
}

function MemoriesApp({ user, confirmCustom }: { user: any; confirmCustom: (message: string, subMessage?: string) => Promise<boolean> }) {
  const [view, setView] = useState<"cards" | "list">("cards");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "happy" | "neutral" | "low">("all");
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Card Size State
  const [cardSize, setCardSize] = useState<"small" | "medium" | "large">("medium");

  // View/Edit State
  const [viewingEntry, setViewingEntry] = useState<JournalEntry | null>(null);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editMood, setEditMood] = useState(5);
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchEntries = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const q = query(
        collection(db, "users", user.uid, "entries"),
        orderBy("date", "desc")
      );
      const querySnapshot = await getDocs(q);
      const loadedEntries: JournalEntry[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        loadedEntries.push({
          id: doc.id as any,
          title: data.title || "Untitled",
          date: data.date || "",
          content: data.content || "",
          mood: data.mood || 5,
          image: data.imageUrl || data.image,
          audio: data.audioUrl || data.audio,
          tags: data.tags || [],
          doodle: data.doodle || "",
        });
      });
      setEntries(loadedEntries);
    } catch (err) {
      console.error("Error fetching entries:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.uid]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleDelete = async (entryId: string) => {
    const accepted = await confirmCustom("Are you sure you want to delete this memory?", "This action cannot be undone.");
    if (!accepted) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "entries", entryId));
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    } catch (err) {
      console.error("Error deleting entry:", err);
      alert("Failed to delete memory.");
    }
  };

  const startEdit = (entry: JournalEntry) => {
    setEditingEntry(entry);
    setEditTitle(entry.title);
    setEditContent(entry.content);
    setEditMood(entry.mood);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;
    setSavingEdit(true);
    try {
      const entryRef = doc(db, "users", user.uid, "entries", editingEntry.id);
      await updateDoc(entryRef, {
        title: editTitle.trim() || "Untitled",
        content: editContent,
        mood: editMood,
      });

      // Update local state list
      setEntries((prev) =>
        prev.map((e) =>
          e.id === editingEntry.id
            ? { ...e, title: editTitle, content: editContent, mood: editMood }
            : e
        )
      );
      setEditingEntry(null);
    } catch (err) {
      console.error("Error updating entry:", err);
      alert("Failed to update memory.");
    } finally {
      setSavingEdit(false);
    }
  };

  const [selectedTag, setSelectedTag] = useState<string>("all");

  const allTags = Array.from(new Set(entries.flatMap((e) => e.tags || [])));

  const filtered = entries.filter((e) => {
    const matchSearch =
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      e.content.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === "all"
        ? true
        : filter === "happy"
        ? e.mood >= 7
        : filter === "low"
        ? e.mood <= 3
        : e.mood > 3 && e.mood < 7;
    const matchTag = selectedTag === "all" ? true : e.tags?.includes(selectedTag);
    return matchSearch && matchFilter && matchTag;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <MenuBar items={["File", "View", "Sort", "Help"]} />
      {/* Toolbar */}
      <div
        style={{
          padding: "4px 8px",
          borderBottom: "1px solid #808080",
          display: "flex",
          gap: "6px",
          alignItems: "center",
          background: "#c0c0c0",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find..."
          style={{ ...inputStyle({ width: "130px" }) }}
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | "happy" | "neutral" | "low")}
          style={{ ...inputStyle({ background: "#ffffff", cursor: "default" }) }}
        >
          <option value="all">All Moods</option>
          <option value="happy">Happy (7–10)</option>
          <option value="neutral">Neutral (4–6)</option>
          <option value="low">Low (1–3)</option>
        </select>
        
        {allTags.length > 0 && (
          <select
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            style={{ ...inputStyle({ background: "#ffffff", cursor: "default", minWidth: "90px" }) }}
          >
            <option value="all">All Tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>#{tag}</option>
            ))}
          </select>
        )}

        <W95Btn
          small
          onClick={() => fetchEntries(true)}
          disabled={refreshing}
          style={{ minWidth: "55px" }}
        >
          {refreshing ? "..." : "Refresh"}
        </W95Btn>

        {view === "cards" && (
          <select
            value={cardSize}
            onChange={(e) => setCardSize(e.target.value as "small" | "medium" | "large")}
            style={{ ...inputStyle({ background: "#ffffff", cursor: "default", minWidth: "85px" }) }}
          >
            <option value="small">Small Cards</option>
            <option value="medium">Medium Cards</option>
            <option value="large">Large Cards</option>
          </select>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: "2px" }}>
          <W95Btn small onClick={() => setView("cards")} active={view === "cards"}>
            Cards
          </W95Btn>
          <W95Btn small onClick={() => setView("list")} active={view === "list"}>
            List
          </W95Btn>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", fontFamily: SYS_FONT, fontSize: "12px" }}>
            ⏳ Loading memories...
          </div>
        ) : view === "cards" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                cardSize === "small"
                  ? "repeat(auto-fill, minmax(130px, 1fr))"
                  : cardSize === "large"
                  ? "repeat(auto-fill, minmax(260px, 1fr))"
                  : "repeat(auto-fill, minmax(185px, 1fr))",
              gap: "8px",
            }}
          >
            {filtered.map((entry) => {
              const imgHeight = cardSize === "small" ? "60px" : cardSize === "large" ? "130px" : "90px";
              const titleSize = cardSize === "small" ? "10px" : cardSize === "large" ? "13px" : "11px";
              const descSize = cardSize === "small" ? "10px" : cardSize === "large" ? "12px" : "11px";
              const clampLines = cardSize === "small" ? 2 : cardSize === "large" ? 4 : 3;
              const cardPadding = cardSize === "small" ? "4px" : cardSize === "large" ? "10px" : "6px";
              
              return (
                <div
                  key={entry.id}
                  onClick={() => setViewingEntry(entry)}
                  style={{
                    background: "#ffffff",
                    ...raised,
                    display: "flex",
                    flexDirection: "column",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ height: "5px", background: moodColor(entry.mood) }} />
                  {entry.doodle ? (
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "6px", background: "#f5f6fa", height: imgHeight }}>
                      <DoodleRenderer data={entry.doodle} size={cardSize === "small" ? 48 : cardSize === "large" ? 96 : 64} />
                    </div>
                  ) : entry.image ? (
                    <img
                      src={entry.image}
                      alt={entry.title}
                      style={{ width: "100%", height: imgHeight, objectFit: "cover", display: "block" }}
                    />
                  ) : (
                    cardSize !== "small" && (
                      <div
                        style={{
                          height: "40px",
                          background: moodBg(entry.mood),
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "10px",
                          color: moodColor(entry.mood),
                          fontStyle: "italic",
                        }}
                      >
                        No image
                      </div>
                    )
                  )}
                  <div style={{ padding: cardPadding, flex: 1, display: "flex", flexDirection: "column" }}>
                    <div
                      style={{
                        fontSize: titleSize,
                        fontWeight: "bold",
                        marginBottom: "2px",
                        fontFamily: SYS_FONT,
                      }}
                    >
                      {entry.title}
                    </div>
                    <div style={{ fontSize: "10px", color: "#808080", marginBottom: "4px" }}>
                      {entry.date}
                    </div>
                    <div
                      style={{
                        fontSize: descSize,
                        color: "#404040",
                        lineHeight: "1.4",
                        flex: 1,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: clampLines,
                        WebkitBoxOrient: "vertical" as const,
                        fontFamily: JOURNAL_FONT,
                      }}
                    >
                      {entry.content}
                    </div>
                    {entry.audio && cardSize !== "small" && (
                      <audio
                        controls
                        src={entry.audio}
                        style={{ width: "100%", height: "24px", marginTop: "6px" }}
                      />
                    )}
                    {entry.tags && entry.tags.length > 0 && (
                      <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", marginTop: "6px" }}>
                        {entry.tags.map((tag) => (
                          <span
                            key={tag}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTag(selectedTag === tag ? "all" : tag);
                            }}
                            style={{
                              background: selectedTag === tag ? "#000080" : "#dfdfdf",
                              color: selectedTag === tag ? "white" : "black",
                              border: "1px solid #808080",
                              padding: "1px 4px",
                              fontSize: "9px",
                              cursor: "default",
                              fontFamily: SYS_FONT,
                              ...raised
                            }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <div
                      style={{
                        marginTop: "6px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "10px",
                          color: moodColor(entry.mood),
                          fontWeight: "bold",
                        }}
                      >
                        Mood: {entry.mood}/10
                      </span>
                      <div style={{ display: "flex", gap: "2px" }}>
                        <W95Btn small onClick={(e: React.MouseEvent) => { e.stopPropagation(); setViewingEntry(entry); }}>View</W95Btn>
                        <W95Btn small onClick={(e: React.MouseEvent) => { e.stopPropagation(); startEdit(entry); }}>Edit</W95Btn>
                        <W95Btn small onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleDelete(entry.id); }}>Del</W95Btn>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ background: "#000080", color: "white" }}>
                <th style={{ padding: "3px 8px", textAlign: "left", fontFamily: SYS_FONT }}>
                  Title
                </th>
                <th style={{ padding: "3px 8px", textAlign: "left", fontFamily: SYS_FONT }}>
                  Date
                </th>
                <th style={{ padding: "3px 8px", textAlign: "center", fontFamily: SYS_FONT }}>
                  Mood
                </th>
                <th style={{ padding: "3px 8px", textAlign: "center", fontFamily: SYS_FONT }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, i) => (
                <tr
                  key={entry.id}
                  onClick={() => setViewingEntry(entry)}
                  style={{ background: i % 2 === 0 ? "#ffffff" : "#f0f0f0", cursor: "pointer" }}
                >
                  <td
                    style={{ padding: "4px 8px", fontWeight: "bold", fontFamily: SYS_FONT }}
                  >
                    {entry.title}
                    {entry.tags && entry.tags.length > 0 && (
                      <span style={{ fontSize: "10px", color: "#808080", fontWeight: "normal", marginLeft: "6px" }}>
                        ({entry.tags.map((t) => `#${t}`).join(", ")})
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "4px 8px", color: "#808080", fontFamily: SYS_FONT }}>
                    {entry.date}
                  </td>
                  <td
                    style={{
                      padding: "4px 8px",
                      textAlign: "center",
                      color: moodColor(entry.mood),
                      fontWeight: "bold",
                    }}
                  >
                    {entry.mood}/10
                  </td>
                  <td style={{ padding: "4px 8px", textAlign: "center" }}>
                    <div
                      style={{ display: "flex", gap: "2px", justifyContent: "center" }}
                    >
                      <W95Btn small onClick={(e: React.MouseEvent) => { e.stopPropagation(); setViewingEntry(entry); }}>View</W95Btn>
                      <W95Btn small onClick={(e: React.MouseEvent) => { e.stopPropagation(); startEdit(entry); }}>Edit</W95Btn>
                      <W95Btn small onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleDelete(entry.id); }}>Del</W95Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div
        style={{
          padding: "3px 8px",
          borderTop: "1px solid #808080",
          fontSize: "11px",
          color: "#606060",
          flexShrink: 0,
        }}
      >
        {filtered.length} {filtered.length === 1 ? "object" : "objects"}
      </div>

      {/* View Memory Modal */}
      {viewingEntry && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
          onClick={() => setViewingEntry(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "420px",
              maxHeight: "90%",
              background: "#c0c0c0",
              ...raised,
              display: "flex",
              flexDirection: "column",
              fontFamily: SYS_FONT,
            }}
          >
            {/* Title bar */}
            <div style={{ background: "linear-gradient(to right, #000080, #1084d0)", padding: "3px 4px", display: "flex", justifyContent: "space-between", alignItems: "center", userSelect: "none", flexShrink: 0 }}>
              <span style={{ color: "white", fontSize: "11px", fontWeight: "bold" }}>
                📖 {viewingEntry.title}
              </span>
              <TitleBtn label="✕" onClick={() => setViewingEntry(null)} />
            </div>

            {/* Mood bar */}
            <div style={{ height: "4px", background: moodColor(viewingEntry.mood), flexShrink: 0 }} />

            {/* Toolbar-style info bar */}
            <div style={{ padding: "4px 8px", borderBottom: "1px solid #808080", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10px", color: "#606060", flexShrink: 0 }}>
              <span>📅 {viewingEntry.date}</span>
              <span style={{ color: moodColor(viewingEntry.mood), fontWeight: "bold" }}>Mood: {viewingEntry.mood}/10</span>
            </div>

            {/* Scrollable content */}
            <div style={{ flex: 1, overflow: "auto", padding: "10px 12px" }}>
              {/* Image */}
              {viewingEntry.doodle ? (
                <div style={{ marginBottom: "8px", display: "flex", justifyContent: "center", ...sunken, padding: "8px", background: "#f5f6fa" }}>
                  <DoodleRenderer data={viewingEntry.doodle} size={160} />
                </div>
              ) : viewingEntry.image ? (
                <div style={{ marginBottom: "8px", ...sunken, padding: "2px" }}>
                  <img
                    src={viewingEntry.image}
                    alt={viewingEntry.title}
                    style={{ width: "100%", maxHeight: "160px", objectFit: "cover", display: "block" }}
                  />
                </div>
              ) : null}

              {/* Rendered markdown content */}
              <div
                style={{
                  fontFamily: JOURNAL_FONT,
                  fontSize: "13px",
                  color: "#1a1a1a",
                  background: "#fffff0",
                  ...sunken,
                  padding: "10px 12px",
                  minHeight: "100px",
                }}
              >
                {renderMarkdown(viewingEntry.content)}
              </div>

              {/* Audio player */}
              {viewingEntry.audio && (
                <div style={{ marginTop: "8px" }}>
                  <div style={{ fontSize: "10px", color: "#808080", marginBottom: "2px" }}>🔊 Audio Recording</div>
                  <audio controls src={viewingEntry.audio} style={{ width: "100%", height: "28px" }} />
                </div>
              )}

              {/* Tags */}
              {viewingEntry.tags && viewingEntry.tags.length > 0 && (
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "10px" }}>
                  {viewingEntry.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        background: "#dfdfdf",
                        border: "1px solid #808080",
                        padding: "1px 6px",
                        fontSize: "10px",
                        fontFamily: SYS_FONT,
                        ...raised,
                      }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom action bar */}
            <div style={{ padding: "6px 8px", borderTop: "1px solid #808080", display: "flex", justifyContent: "flex-end", gap: "6px", flexShrink: 0 }}>
              <W95Btn onClick={() => { startEdit(viewingEntry); setViewingEntry(null); }}>Edit</W95Btn>
              <W95Btn onClick={() => setViewingEntry(null)}>Close</W95Btn>
            </div>
          </div>
        </div>
      )}

      {/* Edit Memory Modal Dialog */}
      {editingEntry && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
        >
          <div
            style={{
              width: "320px",
              background: "#c0c0c0",
              ...raised,
              display: "flex",
              flexDirection: "column",
              fontFamily: SYS_FONT,
            }}
          >
            {/* Title bar */}
            <div style={{ background: "linear-gradient(to right, #000080, #1084d0)", padding: "3px 4px", display: "flex", justifyContent: "space-between", alignItems: "center", userSelect: "none" }}>
              <span style={{ color: "white", fontSize: "11px", fontWeight: "bold" }}>Edit Memory</span>
              <TitleBtn label="✕" onClick={() => setEditingEntry(null)} />
            </div>
            
            {/* Form */}
            <form onSubmit={handleSaveEdit} style={{ padding: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <label style={{ fontSize: "11px" }}>Title:</label>
                <input 
                  value={editTitle} 
                  onChange={(e) => setEditTitle(e.target.value)} 
                  style={{ ...inputStyle({ height: "20px" }) }} 
                  required 
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <label style={{ fontSize: "11px" }}>Mood (1-10):</label>
                <input 
                  type="number" 
                  min="1" 
                  max="10" 
                  value={editMood} 
                  onChange={(e) => setEditMood(Number(e.target.value))} 
                  style={{ ...inputStyle({ height: "20px" }) }} 
                  required 
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <label style={{ fontSize: "11px" }}>Content:</label>
                <textarea 
                  value={editContent} 
                  onChange={(e) => setEditContent(e.target.value)} 
                  style={{ ...inputStyle({ height: "120px", resize: "none", fontFamily: JOURNAL_FONT }) }} 
                  required 
                />
              </div>
              <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", marginTop: "8px" }}>
                <W95Btn type="submit" disabled={savingEdit}>{savingEdit ? "..." : "OK"}</W95Btn>
                <W95Btn onClick={() => setEditingEntry(null)}>Cancel</W95Btn>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Chat App ─────────────────────────────────────────────────────────────────
function ChatApp({ user, personality }: { user: any; personality: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_CHAT);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [openRefs, setOpenRefs] = useState<Record<number, boolean>>({});
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const toggleRefs = (id: number) => {
    setOpenRefs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    const fetchDates = async () => {
      try {
        const q = query(
          collection(db, "users", user.uid, "journals"),
          orderBy("date", "desc")
        );
        const querySnapshot = await getDocs(q);
        const datesSet = new Set<string>();
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.date) {
            const [dd, mm, yyyy] = data.date.split("/");
            datesSet.add(`${yyyy}-${mm}-${dd}`);
          }
        });
        setAvailableDates(Array.from(datesSet).sort().reverse());
      } catch (err) {
        console.error("Error fetching dates for chat picklist:", err);
      }
    };
    if (user) {
      fetchDates();
    }
  }, [user]);

  const PROMPTS = [
    "What did I do last week?",
    "How was my mood in March?",
    "When was I happiest?",
    "Summarize this month.",
    "What recurring themes do I have?",
    "When did I feel lonely?",
  ];

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || isTyping) return;
      const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      setMessages((prev) => [...prev, { id: prev.length + 1, from: "user", text, time: now }]);
      setInput("");
      setIsTyping(true);
      setShowDatePicker(false);

      // Check for @date mention: e.g. @2026-07-10 or general YYYY-MM-DD
      const dateRegex = /@(\d{4}-\d{2}-\d{2})/;
      const match = text.match(dateRegex);
      let dateRange: string[] | undefined = undefined;
      let cleanText = text;

      if (match) {
        const rawDate = match[1];
        const [yyyy, mm, dd] = rawDate.split("-");
        const formattedDate = `${dd}/${mm}/${yyyy}`;
        dateRange = [formattedDate];
        cleanText = text.replace(match[0], "").trim();
      }

      try {
        const token = await user.getIdToken();
        const response = await fetch(`${BACKEND_URL}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ 
            query: cleanText || text, 
            personality,
            dateRange
          })
        });
        if (!response.ok) {
          throw new Error("Failed to connect to the memory chat server.");
        }
        const data = await response.json();
        const replyTime = new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        });
        setMessages((prev) => [
          ...prev,
          { 
            id: prev.length + 1, 
            from: "mnema", 
            text: data.response, 
            time: replyTime, 
            references: data.references 
          },
        ]);
      } catch (err: any) {
        console.error(err);
        const replyTime = new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        });
        setMessages((prev) => [
          ...prev,
          {
            id: prev.length + 1,
            from: "mnema",
            text: "Error: Could not connect to RAG server. Ensure your Python FastAPI server is running.",
            time: replyTime,
          },
        ]);
      } finally {
        setIsTyping(false);
      }
    },
    [isTyping, user, personality]
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);

    const cursorIdx = e.target.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursorIdx);
    const lastAtIdx = textBeforeCursor.lastIndexOf("@");
    
    if (lastAtIdx !== -1 && (lastAtIdx === textBeforeCursor.length - 1 || !/\s/.test(textBeforeCursor.slice(lastAtIdx)))) {
      setShowDatePicker(true);
    } else {
      setShowDatePicker(false);
    }
  };

  const handleSelectDate = (dateStr: string) => {
    const cursorIdx = chatInputRef.current?.selectionStart || input.length;
    const textBefore = input.slice(0, cursorIdx);
    const textAfter = input.slice(cursorIdx);
    
    const lastAtIdx = textBefore.lastIndexOf("@");
    if (lastAtIdx !== -1) {
      const newInput = textBefore.slice(0, lastAtIdx) + `@${dateStr}` + textAfter;
      setInput(newInput);
      setShowDatePicker(false);
      setTimeout(() => {
        if (chatInputRef.current) {
          chatInputRef.current.focus();
          const newCursor = lastAtIdx + dateStr.length + 1;
          chatInputRef.current.setSelectionRange(newCursor, newCursor);
        }
      }, 10);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", position: "relative" }}>
      {/* Header bar */}
      <div
        style={{
          padding: "3px 8px",
          borderBottom: "2px solid #808080",
          background: "#c0c0c0",
          fontSize: "11px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: "bold", fontFamily: SYS_FONT }}>
          Mnema Chat — v1.0.0
        </span>
        <span style={{ color: "#008000", fontFamily: TERM_FONT, fontSize: "13px" }}>
          [CONNECTED]
        </span>
      </div>

      {/* Message log */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "6px 8px",
          background: "#ffffff",
          margin: "4px",
          ...sunken,
          fontFamily: TERM_FONT,
          fontSize: "15px",
          lineHeight: "1.5",
        }}
      >
        {messages.map((msg) => (
          <div key={msg.id} style={{ marginBottom: "8px" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
              <span
                style={{
                  fontWeight: "bold",
                  color: msg.from === "mnema" ? "#000080" : "#800000",
                  fontSize: "14px",
                }}
              >
                {msg.from === "mnema" ? "<Mnema>" : "<You>"}
              </span>
              <span style={{ fontSize: "12px", color: "#808080" }}>{msg.time}</span>
            </div>
            <div style={{ paddingLeft: "12px", color: "#1a1a1a", wordBreak: "break-word" }}>
              {msg.text}
              {msg.from === "mnema" && msg.references && msg.references.length > 0 && (
                <>
                  <button
                    onClick={() => toggleRefs(msg.id)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#000080",
                      textDecoration: "underline",
                      fontSize: "11px",
                      cursor: "default",
                      padding: "2px 0",
                      fontFamily: SYS_FONT,
                      display: "block",
                      marginTop: "4px"
                    }}
                  >
                    {openRefs[msg.id] ? "Hide Sources ▲" : "Show Sources ▼"}
                  </button>
                  {openRefs[msg.id] && (
                    <div 
                      style={{ 
                        marginTop: "6px", 
                        padding: "6px", 
                        background: "#dfdfdf", 
                        border: "1px solid #808080", 
                        fontSize: "12px",
                        fontFamily: SYS_FONT,
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                        ...sunken
                      }}
                    >
                      <div style={{ fontWeight: "bold", borderBottom: "1px solid #808080", paddingBottom: "2px", marginBottom: "2px", color: "#000000" }}>
                        📖 Reference Diary Logs:
                      </div>
                      {msg.references.map((ref, idx) => (
                        <div key={idx} style={{ background: "#ffffff", padding: "4px", border: "1px solid #808080", fontSize: "11px" }}>
                          <div style={{ fontWeight: "bold", color: "#000080", display: "flex", justifyContent: "space-between" }}>
                            <span>Date: {ref.date}</span>
                            <span style={{ color: moodColor(ref.mood) }}>Mood: {ref.mood}/10</span>
                          </div>
                          <div style={{ marginTop: "2px", color: "#333333", fontStyle: "italic" }}>
                            "{ref.data}"
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div style={{ color: "#606060", fontSize: "14px" }}>
            <span style={{ fontWeight: "bold", color: "#000080" }}>&lt;Mnema&gt;</span> is
            typing...
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Date Picker Popover Overlay */}
      {showDatePicker && availableDates.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "48px",
            left: "8px",
            right: "8px",
            background: "#c0c0c0",
            maxHeight: "140px",
            overflowY: "auto",
            zIndex: 1000,
            boxShadow:
              "inset -1px -1px #ffffff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a, 3px 3px 0 rgba(0,0,0,0.15)",
            padding: "2px",
          }}
        >
          <div style={{ background: "#000080", color: "#ffffff", padding: "3px 6px", fontSize: "10px", fontWeight: "bold", position: "sticky", top: 0 }}>
            Select Entry Date Filter:
          </div>
          {availableDates.map((dateVal) => (
            <div
              key={dateVal}
              onClick={() => handleSelectDate(dateVal)}
              style={{
                padding: "4px 8px",
                fontSize: "11px",
                cursor: "default",
                color: "#000000",
                background: "transparent",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#000080";
                e.currentTarget.style.color = "#ffffff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#000000";
              }}
            >
              📅 {dateVal}
            </div>
          ))}
        </div>
      )}

      {/* Quick prompts */}
      <div
        style={{
          padding: "3px 8px",
          borderTop: "1px solid #808080",
          display: "flex",
          gap: "3px",
          flexWrap: "wrap",
          background: "#c0c0c0",
          flexShrink: 0,
        }}
      >
        {PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => send(p)}
            style={{
              fontSize: "10px",
              padding: "1px 5px",
              cursor: "default",
              background: "#c0c0c0",
              border: "none",
              fontFamily: SYS_FONT,
              ...raised,
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div
        style={{
          padding: "4px 8px",
          borderTop: "1px solid #808080",
          display: "flex",
          gap: "4px",
          flexShrink: 0,
        }}
      >
        <input
          ref={chatInputRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Ask Mnema about memories (type @ for dates)..."
          style={{ ...inputStyle({ flex: 1, fontFamily: TERM_FONT, fontSize: "14px" }) }}
        />
        <W95Btn onClick={() => send(input)} small>
          Send
        </W95Btn>
      </div>
    </div>
  );
}

// ─── Profile App (System Monitor) ─────────────────────────────────────────────
function ProfileApp({ user }: { user: any }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEntries = async () => {
      try {
        const q = query(
          collection(db, "users", user.uid, "entries"),
          orderBy("date", "asc")
        );
        const querySnapshot = await getDocs(q);
        const loadedEntries: JournalEntry[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          loadedEntries.push({
            id: doc.id as any,
            title: data.title || "Untitled",
            date: data.date || "",
            content: data.content || "",
            mood: data.mood || 5,
            tags: data.tags || [],
          });
        });
        setEntries(loadedEntries);
      } catch (err) {
        console.error("Error fetching entries for profile:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchEntries();
  }, [user.uid]);

  const totalEntries = entries.length;
  const avgMood = totalEntries > 0 
    ? (entries.reduce((sum, e) => sum + e.mood, 0) / totalEntries).toFixed(1) 
    : "0.0";
  const uniqueTags = Array.from(new Set(entries.flatMap((e) => e.tags || []))).length;

  const renderGraph = () => {
    if (entries.length < 2) {
      return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "120px", color: "#00ff00", fontFamily: TERM_FONT, fontSize: "12px", background: "#000000", ...sunken }}>
          [ insufficient logs to plot mood chart (min 2 entries required) ]
        </div>
      );
    }

    const width = 300;
    const height = 120;
    const padding = 10;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;

    const points = entries.map((entry, idx) => {
      const x = padding + (idx / (entries.length - 1)) * chartW;
      const y = padding + (1 - (entry.mood - 1) / 9) * chartH;
      return { x, y, mood: entry.mood, date: entry.date };
    });

    // Generate a stepped staircase path
    let linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      // Staircase: move horizontally to current X, then vertically to current Y
      linePath += ` H ${curr.x} V ${curr.y}`;
    }
    
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

    return (
      <div style={{ position: "relative", background: "#000000", ...sunken, padding: "2px" }}>
        <svg width="100%" height="120px" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          {/* Grid lines */}
          {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
            <line
              key={`h-${ratio}`}
              x1="0"
              y1={height * ratio}
              x2={width}
              y2={height * ratio}
              stroke="#002d00"
              strokeWidth="0.75"
            />
          ))}
          {[0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875].map((ratio) => (
            <line
              key={`v-${ratio}`}
              x1={width * ratio}
              y1="0"
              x2={width * ratio}
              y2={height}
              stroke="#002d00"
              strokeWidth="0.75"
            />
          ))}
          
          {/* Stepped Area Fill */}
          <path d={areaPath} fill="rgba(0, 255, 0, 0.12)" stroke="none" />
          {/* Stepped Line Path */}
          <path d={linePath} fill="none" stroke="#00ff00" strokeWidth="1" style={{ shapeRendering: "crispEdges" }} />
          
          {/* Square Pixel Points */}
          {points.map((p, idx) => (
            <rect
              key={idx}
              x={p.x - 2.5}
              y={p.y - 2.5}
              width="5"
              height="5"
              fill="#00ff00"
              stroke="#000000"
              strokeWidth="1"
              style={{ cursor: "pointer" }}
            >
              <title>{p.date}: Mood {p.mood}/10</title>
            </rect>
          ))}
        </svg>
      </div>
    );
  };

  return (
    <div style={{ overflow: "auto", height: "100%", padding: "10px", fontSize: "12px", fontFamily: SYS_FONT }}>
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", color: "#000080" }}>
          ⏳ Accessing System Logs...
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px", marginBottom: "10px" }}>
            {[
              { label: "INDEXED LOGS", value: String(totalEntries) },
              { label: "AVG MOOD LEVEL", value: `${avgMood}/10` },
              { label: "UNIQUE TAGS", value: String(uniqueTags) },
            ].map((stat) => (
              <div key={stat.label} style={{ background: "#ffffff", ...raised, padding: "6px", textAlign: "center" }}>
                <div style={{ fontSize: "18px", fontWeight: "bold", color: "#000080" }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: "9px", color: "#808080", marginTop: "2px" }}>{stat.label}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: "10px" }}>
            <div style={{ background: "linear-gradient(to right, #000080, #1084d0)", color: "white", padding: "2px 6px", fontSize: "11px", fontWeight: "bold", marginBottom: "4px", display: "flex", justifyContent: "space-between" }}>
              <span>Mood History (System Monitor)</span>
              <span style={{ color: "#00ff00", fontFamily: TERM_FONT }}>[ACTIVE]</span>
            </div>
            {renderGraph()}
          </div>

          <div>
            <div style={{ background: "linear-gradient(to right, #000080, #1084d0)", color: "white", padding: "2px 6px", fontSize: "11px", fontWeight: "bold", marginBottom: "4px" }}>
              <span>System Resource Diagnostics</span>
            </div>
            <div style={{ background: "#ffffff", padding: "6px", ...raised, display: "flex", flexDirection: "column", gap: "4px" }}>
              {[
                { name: "Cognitive Processor", status: "ONLINE", detail: "gemini-2.5-flash" },
                { name: "Memory Index Vector", status: "768 DIM", detail: "gemini-embedding-2" },
                { name: "Sentiment Tracking", status: "ACTIVE", detail: "Firestore entries subcollection" },
                { name: "RAG Pipeline Latency", status: "NOMINAL", detail: "L2 Cosine local matrix dot product" },
                { name: "OS Shell Framework", status: "READY", detail: "Windows 95 Win32 Desktop Emulation" }
              ].map((res, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f0f0f0", padding: "2px 0", fontSize: "11px" }}>
                  <span style={{ fontWeight: "bold", color: "#333333" }}>{res.name}</span>
                  <span style={{ color: res.status === "ONLINE" || res.status === "ACTIVE" || res.status === "NOMINAL" ? "#008000" : "#000080", fontWeight: "bold" }}>
                    {res.status} <span style={{ fontWeight: "normal", color: "#808080", fontSize: "10px" }}>({res.detail})</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Help & Support App ───────────────────────────────────────────────────────
function HelpApp({ onClose }: { onClose?: () => void }) {
  const [tab, setTab] = useState("welcome");
  const tabs = [
    { id: "welcome", label: "Welcome" },
    { id: "journal", label: "New Journal" },
    { id: "memories", label: "Memories" },
    { id: "chat", label: "AI Chat" },
    { id: "goals", label: "Time Machine" },
    { id: "paint", label: "Paint" },
    { id: "profile", label: "System Monitor" },
    { id: "settings", label: "Settings" },
    { id: "terminal", label: "mShell" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "#c0c0c0", fontFamily: SYS_FONT }}>
      {/* Help File Menu Bar */}
      <MenuBar items={["File", "Edit", "Bookmark", "Help"]} />

      {/* Retro Tab bar */}
      <div
        style={{
          borderBottom: "1px solid #808080",
          background: "#dfdfdf",
          padding: "6px 6px 0 6px",
          display: "flex",
          gap: "2px",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "3px 8px",
              fontSize: "11px",
              fontWeight: "bold",
              cursor: "default",
              border: "none",
              background: tab === t.id ? "#c0c0c0" : "#a8a8a8",
              position: "relative",
              top: tab === t.id ? "1px" : "0",
              boxShadow:
                tab === t.id
                  ? "inset -1px 0 #0a0a0a, inset 1px 0 #ffffff, inset 0 1px #ffffff"
                  : "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Help Topic Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px", background: "#ffffff", margin: "8px", ...sunken, display: "flex", flexDirection: "column", gap: "12px" }}>
        {tab === "welcome" && (
          <>
            <h2 style={{ margin: 0, fontSize: "16px", color: "#000080", borderBottom: "2px solid #000080", paddingBottom: "4px" }}>
              Welcome to Mnema '98 Help
            </h2>
            <p style={{ margin: 0, fontSize: "12px", lineHeight: "1.6", color: "#333" }}>
              <strong>Mnema '98</strong> is an advanced, offline-first personal digital journaling system running on a simulated Windows 95 interface. It couples classic 90s aesthetic styles with modern AI retrieval capabilities to offer deep reflection.
            </p>
            <div style={{ background: "#f5f5f5", padding: "10px", border: "1px dotted #808080", borderRadius: "2px" }}>
              <h3 style={{ margin: "0 0 6px 0", fontSize: "12px", color: "#333" }}>Quick Start Checklist:</h3>
              <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "11px", color: "#444", display: "flex", flexDirection: "column", gap: "4px" }}>
                <li>✍️ Write a quick journal entry in <strong>New Journal</strong>.</li>
                <li>🎨 Sketch a doodle in <strong>Paint</strong> and attach it to your entry.</li>
                <li>📁 View and filter cards in your <strong>Memories</strong> folder.</li>
                <li>💬 Ask the companion in <strong>Chat</strong> about your patterns.</li>
              </ul>
            </div>
          </>
        )}

        {tab === "journal" && (
          <>
            <h2 style={{ margin: 0, fontSize: "16px", color: "#000080", borderBottom: "2px solid #000080", paddingBottom: "4px" }}>
              Writing Journal Entries
            </h2>
            <p style={{ margin: 0, fontSize: "12px", lineHeight: "1.6", color: "#333" }}>
              The <strong>New Journal</strong> window is where you scribe your thoughts. It includes full formatting and metadata tools:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "11px" }}>
              <div>
                <strong>📝 Entry Title & Date:</strong> Give your thoughts a descriptive label or let it fall back to "Untitled". You can log entries back-dated or write in the present.
              </div>
              <div>
                <strong>🎭 Mood Slider:</strong> Drag the slider from 1 (sad) to 10 (happy) to map your emotional state. It changes color dynamically and maps automatically to system graphs.
              </div>
              <div>
                <strong>🅰️ Formatting Toolbar:</strong> Bold, italics, underline, headers, and list buttons are available. These insert Markdown syntax elements directly around highlighted text.
              </div>
              <div>
                <strong>🏷️ Tagging System:</strong> Single hashtag symbols (e.g. <code>#thoughts</code>, <code>#code</code>) in your text are parsed as official entry tags. Double tags (like headers <code>## Title</code>) are ignored.
              </div>
            </div>
          </>
        )}

        {tab === "memories" && (
          <>
            <h2 style={{ margin: 0, fontSize: "16px", color: "#000080", borderBottom: "2px solid #000080", paddingBottom: "4px" }}>
              Managing Memories
            </h2>
            <p style={{ margin: 0, fontSize: "12px", lineHeight: "1.6", color: "#333" }}>
              The <strong>Memories</strong> folder houses all your saved thoughts in card grid or table list layouts:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "11px" }}>
              <div>
                <strong>🔍 Find and Search:</strong> Search entries by keyword title or text context using the search input.
              </div>
              <div>
                <strong>🎴 Card Resizing:</strong> Swap layout card sizes between Small, Medium, or Large from the dropdown toolbar to fit more items on the screen.
              </div>
              <div>
                <strong>🎭 Mood & Tag Filters:</strong> Filter your diary instantly by mood ranges or individual hashtag indices.
              </div>
              <div>
                <strong>🔄 Refresh Button:</strong> Click the "Refresh" button to sync new journal entries created in the background.
              </div>
            </div>
          </>
        )}

        {tab === "chat" && (
          <>
            <h2 style={{ margin: 0, fontSize: "16px", color: "#000080", borderBottom: "2px solid #000080", paddingBottom: "4px" }}>
              Retrieval Augmented AI Chat
            </h2>
            <p style={{ margin: 0, fontSize: "12px", lineHeight: "1.6", color: "#333" }}>
              The <strong>Chat</strong> app is powered by a RAG cognitive model that reads through your saved memories to recall your personal story.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "11px" }}>
              <div>
                <strong>📅 Date Filters:</strong> Type <code>@</code> in the chat input bar to trigger a popup selection list of dates with entries. Clicking one inserts a filter (e.g. <code>@1998-03-21</code>) to query strictly that day's logs.
              </div>
              <div>
                <strong>🔍 Source Citations:</strong> Click the <i>Show Sources ▼</i> link inside any AI chat bubble to toggle a details panel showing the exact journal logs and moods retrieved to answer your prompt.
              </div>
            </div>
            <div style={{ background: "#e8effc", border: "1px solid #a0b0d0", padding: "8px", fontSize: "11px", color: "#222", marginTop: "4px" }}>
              <strong>💡 Example Prompts to Try:</strong>
              <ul style={{ margin: "4px 0 0 0", paddingLeft: "16px", display: "flex", flexDirection: "column", gap: "2px" }}>
                <li>"What have I been writing about code this week?"</li>
                <li>"Give me a summary of my mood fluctuations."</li>
                <li>"Do you remember my entry about meeting friends?"</li>
              </ul>
            </div>
          </>
        )}

        {tab === "goals" && (
          <>
            <h2 style={{ margin: 0, fontSize: "16px", color: "#000080", borderBottom: "2px solid #000080", paddingBottom: "4px" }}>
              Time Machine (Goals & Vision)
            </h2>
            <p style={{ margin: 0, fontSize: "12px", lineHeight: "1.6", color: "#333" }}>
              The <strong>Time Machine</strong> application captures your long-term dreams and target aspirations, feeding them directly into your cognitive memory network.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "11px" }}>
              <div>
                <strong>🔮 Future Vision Statement:</strong> Scribe a detailed statement about your future goals or plans.
              </div>
              <div>
                <strong>🧠 Automated Goal Extraction:</strong> Saving your vision statement automatically prompts Gemini to parse and extract 3 to 7 clear, actionable bullet goals.
              </div>
              <div>
                <strong>💬 Contextual AI Memory Injection ($Goals):</strong> Type <code>$goals</code> in the <strong>AI Chat</strong> companion app (e.g. <i>"How do my habits lately align with my $goals?"</i>). The RAG model will query and compare your recent diary entries against your future vision goals!
              </div>
            </div>
          </>
        )}

        {tab === "paint" && (
          <>
            <h2 style={{ margin: 0, fontSize: "16px", color: "#000080", borderBottom: "2px solid #000080", paddingBottom: "4px" }}>
              Paint & Pixel Doodles
            </h2>
            <p style={{ margin: 0, fontSize: "12px", lineHeight: "1.6", color: "#333" }}>
              The <strong>Paint</strong> app lets you sketch retro pixel drawings and link them directly to your entries:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "11px" }}>
              <div>
                <strong>🎨 32x32 Grid Canvas:</strong> Draw using classic pencil and eraser options with a 16-color retro palette.
              </div>
              <div>
                <strong>📎 Journal Attachment:</strong> Click <i>Attach to Journal</i> to bind your doodle to your active diary entry. Doodles are saved directly to Firestore as text codes—no image storage required!
              </div>
              <div>
                <strong>🖼️ Memory Rendering:</strong> Your drawings display directly on Memory cards and show up in high-definition when viewing memory details.
              </div>
            </div>
          </>
        )}

        {tab === "profile" && (
          <>
            <h2 style={{ margin: 0, fontSize: "16px", color: "#000080", borderBottom: "2px solid #000080", paddingBottom: "4px" }}>
              System Monitor
            </h2>
            <p style={{ margin: 0, fontSize: "12px", lineHeight: "1.6", color: "#333" }}>
              The <strong>System Monitor</strong> parses diagnostic analytics of your Mnema database:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px" }}>
              <div>
                <strong>📊 Mood Diagnostics Graph:</strong> Plots a vector graph of your last 10 entries to track mood swings over time.
              </div>
              <div>
                <strong>📈 Memory Statistics:</strong> Displays total entries, average mental mood scores, and unique tag indices.
              </div>
              <div>
                <strong>⚙️ Diagnostics Console:</strong> Verifies the system is ONLINE and details active RAG backend configurations.
              </div>
            </div>
          </>
        )}

        {tab === "settings" && (
          <>
            <h2 style={{ margin: 0, fontSize: "16px", color: "#000080", borderBottom: "2px solid #000080", paddingBottom: "4px" }}>
              Settings Customization
            </h2>
            <p style={{ margin: 0, fontSize: "12px", lineHeight: "1.6", color: "#333" }}>
              Adjust features under the <strong>Settings</strong> app:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px" }}>
              <div>
                <strong>🎨 Desktop Customization:</strong> Change the theme color or customize the centered wallpaper text.
              </div>
              <div>
                <strong>📺 Screensavers:</strong> Select from Starfield, Flying Windows, or Mystify. Test immediately with the Preview button. Starts automatically after 60s of inactivity.
              </div>
              <div>
                <strong>🖥️ Desktop Icon Size:</strong> Adjust icon grids between Small (16x16), Normal (32x32), and Large (48x48).
              </div>
            </div>
          </>
        )}

        {tab === "terminal" && (
          <>
            <h2 style={{ margin: 0, fontSize: "16px", color: "#000080", borderBottom: "2px solid #000080", paddingBottom: "4px" }}>
              mShell Command Prompt
            </h2>
            <p style={{ margin: 0, fontSize: "12px", lineHeight: "1.6", color: "#333" }}>
              The <strong>mShell</strong> shortcut opens a classic text terminal prompt. 
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "11px" }}>
              <div>
                <strong>💾 Utilities & Tools:</strong> Run commands like <code>HELP</code>, <code>DIR</code>, <code>CLS</code>, <code>VER</code>, or <code>SYSINFO</code> to explore details about the operating system.
              </div>
              <div>
                <strong>🕵️ Vague Rumors & Secrets:</strong> Beyond standard utilities, there are rumors of hidden files, mysterious sentient messages, crawling pixel sea turtles, retro games, and other secret easter eggs. Try running various words in the command line to see what you discover!
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer OK/Apply buttons */}
      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", padding: "8px 12px 12px 12px", background: "#c0c0c0", flexShrink: 0 }}>
        {onClose && <W95Btn onClick={onClose} style={{ fontWeight: "bold" }}>Close</W95Btn>}
      </div>
    </div>
  );
}

// ─── Time Machine (Goals) App ──────────────────────────────────────────────────
function TimeMachineApp({ user }: { user: any }) {
  const [text, setText] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchGoals = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${BACKEND_URL}/api/goals`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          setText(data.text || "");
          setGoals(data.extractedGoals || []);
        }
      } catch (err) {
        console.error("Error fetching goals:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchGoals();
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/api/goals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ text })
      });
      if (res.ok) {
        const data = await res.json();
        setGoals(data.goals || []);
        alert("Future vision statement saved and goals extracted successfully!");
      } else {
        alert("Failed to extract goals. Make sure the API server is running.");
      }
    } catch (err) {
      console.error("Error saving goals:", err);
      alert("Error contacting the server.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#c0c0c0", fontFamily: SYS_FONT, padding: "8px", overflow: "hidden" }}>
      <div style={{ background: "linear-gradient(to right, #000080, #1084d0)", color: "white", padding: "2px 6px", fontSize: "11px", fontWeight: "bold", marginBottom: "6px" }}>
        Write your future vision and let Mnema extract your core goals
      </div>

      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          ⏳ Accessing Time Machine index...
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px", overflow: "hidden" }}>
          {/* Natural Language Vision Input */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "130px" }}>
            <label style={{ fontSize: "12px", marginBottom: "4px" }}>My Future Life Vision Statement:</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Describe your future in natural language... (e.g. In 5 years, I want to be a software engineer leading a team, speak fluent Japanese, and run a marathon.)"
              style={{
                flex: 1,
                padding: "8px",
                fontSize: "13px",
                lineHeight: "1.6",
                fontFamily: JOURNAL_FONT,
                resize: "none",
                ...sunken,
                background: "#fffffb",
                color: "#1a1208",
              }}
            />
          </div>

          {/* Action Row */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <W95Btn onClick={handleSave} disabled={saving || !text.trim()} style={{ fontWeight: "bold" }}>
              {saving ? "Extracting Goals..." : "Save & Extract Goals"}
            </W95Btn>
          </div>

          {/* AI Extracted Goals Result Display */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "130px", overflow: "hidden" }}>
            <label style={{ fontSize: "12px", marginBottom: "4px" }}>AI-Extracted Core Aspirations (available in Chat via $Goals):</label>
            <div style={{ flex: 1, background: "#ffffff", padding: "8px", overflow: "auto", ...sunken }}>
              {goals.length === 0 ? (
                <div style={{ fontSize: "11px", color: "#808080", fontStyle: "italic", textAlign: "center", marginTop: "20px" }}>
                  Write a vision statement above and click Save to extract your core goals.
                </div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: "16px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {goals.map((g, idx) => (
                    <li key={idx} style={{ fontSize: "12px", color: "#111" }}>
                      <strong>Goal {idx + 1}:</strong> {g}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Matrix Rain Overlay for Terminal ──────────────────────────────────────────
function MatrixRain({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvas.parentElement?.clientWidth || 400;
    canvas.height = canvas.parentElement?.clientHeight || 300;

    const columns = Math.floor(canvas.width / 14);
    const yPositions = Array(columns).fill(0);

    const draw = () => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#0f0";
      ctx.font = "14px monospace";

      yPositions.forEach((y, index) => {
        const text = String.fromCharCode(33 + Math.floor(Math.random() * 93));
        const x = index * 14;
        ctx.fillText(text, x, y);

        if (y > 100 + Math.random() * 10000) {
          yPositions[index] = 0;
        } else {
          yPositions[index] = y + 14;
        }
      });
    };

    const interval = setInterval(draw, 33);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      onComplete();
    }, 3000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [onComplete]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "transparent",
        pointerEvents: "none",
      }}
    />
  );
}

// ─── Terminal App ─────────────────────────────────────────────────────────────
function TerminalApp({ onClose, onShutDown, onOpenCreator, onOpenJournal }: { onClose: () => void; onShutDown: () => void; onOpenCreator: () => void; onOpenJournal: () => void }) {
  const TFONT = "'Cascadia Mono', 'Consolas', 'SF Mono', 'Monaco', 'Fira Code', monospace";

  const kekuAscii =
`  _  __    _
 | |/ /___| | ___   _
 | ' // _ \\ |/ / | | |
 | . \\  __/   <| |_| |
 |_|\\_\\___|_|\\_\\\\__,_|
`;

  interface TermLine {
    text?: string;
    color?: string;
    bold?: boolean;
    dim?: boolean;
    pre?: boolean;
    size?: number;
    mt?: number;
    mb?: number;
    spans?: { text: string; color?: string; bold?: boolean }[];
  }

  const welcomeLines: TermLine[] = [
    { text: "Hello! This is a passion project by", dim: true, mb: 2 },
    { text: kekuAscii, color: "#7ed6df", bold: true, size: 18, pre: true, mb: 4 },
    { text: "This is my first deployed project and it was mostly made for my personal needs.", dim: true },
    { text: "If you would like to learn more about me and this project, use command \u0000keku\u0000.", dim: true, mb: 8 },
    { text: "Welcome to the Terminal", mb: 2 },
    { text: "⚠ Caution: No actual hacking skills required. Side effects may include mass nostalgia.", dim: true, mb: 8 },
    { text: "Type 'help' to see the list of available commands.", dim: true, mb: 4 },
  ];

  const [history, setHistory] = useState<TermLine[]>([]);
  const [input, setInput] = useState("");
  const [promptColor, setPromptColor] = useState("#55ff55");
  const [isMatrix, setIsMatrix] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Snake states
  const [snakePlaying, setSnakePlaying] = useState(false);
  const [snakeScore, setSnakeScore] = useState(0);
  const [snakeHiScore, setSnakeHiScore] = useState(() => {
    try {
      return Number(localStorage.getItem("snake_hiscore") || 0);
    } catch (e) {
      return 0;
    }
  });
  const [snakeBody, setSnakeBody] = useState<{x: number, y: number}[]>([]);
  const [snakeFood, setSnakeFood] = useState<{x: number, y: number}>({x: 5, y: 5});
  const [snakeDir, setSnakeDir] = useState<{x: number, y: number}>({x: 1, y: 0});
  const [snakeOver, setSnakeOver] = useState(false);

  // Turtle states
  const [turtleActive, setTurtleActive] = useState(false);
  const [turtleX, setTurtleX] = useState(-50);

  // Fade Text overlay states
  const [fadeActive, setFadeActive] = useState(false);
  const [fadeText, setFadeText] = useState("");
  const [typedFadeText, setTypedFadeText] = useState("");

  // Printing queue for line-by-line sentient reveal
  const [printingQueue, setPrintingQueue] = useState<TermLine[]>([]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history, isMatrix]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Print queue line-by-line typewriter effect
  useEffect(() => {
    if (printingQueue.length === 0) return;
    const timer = setTimeout(() => {
      const nextLine = printingQueue[0];
      setHistory(prev => [...prev, nextLine]);
      setPrintingQueue(prev => prev.slice(1));
    }, 55); // 55ms delay per line
    return () => clearTimeout(timer);
  }, [printingQueue]);

  const handleTerminalClick = () => {
    if (!snakePlaying && !fadeActive) {
      inputRef.current?.focus();
    }
  };

  const pushLines = (lines: TermLine[]) => {
    setHistory(prev => [...prev, ...lines, { text: "" }]);
  };

  const stateRef = useRef({ snakeBody, snakeDir, snakeFood, snakePlaying, snakeOver, snakeScore, snakeHiScore });
  useEffect(() => {
    stateRef.current = { snakeBody, snakeDir, snakeFood, snakePlaying, snakeOver, snakeScore, snakeHiScore };
  });

  // Snake game logic tick
  useEffect(() => {
    if (!snakePlaying || snakeOver) return;

    const gameTick = () => {
      const { snakeBody: body, snakeDir: dir, snakeFood: food, snakeHiScore: hi } = stateRef.current;
      const head = body[0];
      if (!head) return;
      const newHead = { x: head.x + dir.x, y: head.y + dir.y };

      // Wall collision check
      if (newHead.x < 0 || newHead.x >= 20 || newHead.y < 0 || newHead.y >= 15) {
        setSnakeOver(true);
        return;
      }

      // Self collision check
      if (body.some(b => b.x === newHead.x && b.y === newHead.y)) {
        setSnakeOver(true);
        return;
      }

      const eating = newHead.x === food.x && newHead.y === food.y;

      if (eating) {
        setSnakeScore(s => {
          const next = s + 10;
          if (next > hi) {
            setSnakeHiScore(next);
            try {
              localStorage.setItem("snake_hiscore", String(next));
            } catch (e) {
              // ignore security errors
            }
          }
          return next;
        });

        // Spawn food
        let fx = 0, fy = 0;
        let spawned = false;
        const currentBody = [newHead, ...body];
        while (!spawned) {
          fx = Math.floor(Math.random() * 20);
          fy = Math.floor(Math.random() * 15);
          if (!currentBody.some(b => b.x === fx && b.y === fy)) {
            spawned = true;
          }
        }
        setSnakeFood({ x: fx, y: fy });
        setSnakeBody(prev => [newHead, ...prev]);
      } else {
        setSnakeBody(prev => [newHead, ...prev.slice(0, -1)]);
      }
    };

    const intervalId = setInterval(gameTick, 150);
    return () => clearInterval(intervalId);
  }, [snakePlaying, snakeOver]);

  // Key listeners for Snake
  useEffect(() => {
    if (!snakePlaying) return;

    const handleGameKeys = (e: KeyboardEvent) => {
      const k = (e.key || "").toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) {
        e.preventDefault();
      }

      if (k === "escape") {
        setSnakePlaying(false);
        setHistory(prev => [...prev, { text: `Snake game closed. Final Score: ${snakeScore}`, color: "#7ed6df" }, { text: "" }]);
        return;
      }
      if (k === "enter" && snakeOver) {
        setSnakeBody([{ x: 10, y: 7 }, { x: 9, y: 7 }, { x: 8, y: 7 }]);
        setSnakeFood({ x: 4, y: 4 });
        setSnakeDir({ x: 1, y: 0 });
        setSnakeScore(0);
        setSnakeOver(false);
        return;
      }

      if (snakeOver) return;

      if ((e.key === "ArrowUp" || k === "w") && snakeDir.y === 0) {
        setSnakeDir({ x: 0, y: -1 });
      } else if ((e.key === "ArrowDown" || k === "s") && snakeDir.y === 0) {
        setSnakeDir({ x: 0, y: 1 });
      } else if ((e.key === "ArrowLeft" || k === "a") && snakeDir.x === 0) {
        setSnakeDir({ x: -1, y: 0 });
      } else if ((e.key === "ArrowRight" || k === "d") && snakeDir.x === 0) {
        setSnakeDir({ x: 1, y: 0 });
      }
    };

    window.addEventListener("keydown", handleGameKeys);
    return () => window.removeEventListener("keydown", handleGameKeys);
  }, [snakePlaying, snakeDir, snakeOver, snakeScore]);

  // Turtle walk animation tick
  useEffect(() => {
    if (!turtleActive) return;
    let frameId: number;
    const startTime = Date.now();
    const duration = 4000;

    const step = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setTurtleX(-50 + progress * 850);

      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      } else {
        setTurtleActive(false);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [turtleActive]);

  // Fade Text screen typing effect
  useEffect(() => {
    if (!fadeActive || !fadeText) return;
    let index = 0;
    const interval = setInterval(() => {
      setTypedFadeText(fadeText.slice(0, index + 1));
      index++;
      if (index >= fadeText.length) {
        clearInterval(interval);
      }
    }, 55);
    return () => clearInterval(interval);
  }, [fadeActive, fadeText]);

  // Keypress exit for Fade Text
  useEffect(() => {
    if (!fadeActive) return;
    const handleFadeExit = () => {
      setFadeActive(false);
      setFadeText("");
      setTypedFadeText("");
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", handleFadeExit);
    return () => window.removeEventListener("keydown", handleFadeExit);
  }, [fadeActive]);

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd) return;

    const prompt = { text: `root/ $ ${cmd}`, color: promptColor, bold: true };
    const parts = cmd.toLowerCase().split(" ");
    const primaryCmd = parts[0];
    const C = "#7ed6df"; // cyan accent
    const W = "#e0e0e0"; // white
    const Y = "#f9ca24"; // yellow accent
    const D = "#888";    // dim
    const now = new Date();

    let out: TermLine[] = [];

    switch (primaryCmd) {
      case "help":
        out = [
          { text: "Welcome to the Help Menu!", color: C, bold: true },
          { text: "Here are some commands to try out:", dim: true },
          { text: "" },
          { spans: [{ text: "  help        ", color: W, bold: true }, { text: "show this help menu", color: D }] },
          { spans: [{ text: "  dir         ", color: W, bold: true }, { text: "list all files of current directory", color: D }] },
          { spans: [{ text: "  cls         ", color: W, bold: true }, { text: "clear the terminal screen", color: D }] },
          { spans: [{ text: "  ver         ", color: W, bold: true }, { text: "display version information", color: D }] },
          { spans: [{ text: "  date        ", color: W, bold: true }, { text: "show the current date and time", color: D }] },
          { spans: [{ text: "  sysinfo     ", color: W, bold: true }, { text: "display system specifications", color: D }] },
          { spans: [{ text: "  color       ", color: W, bold: true }, { text: "change prompt color (green, amber, white, blue)", color: D }] },
          { spans: [{ text: "  secret      ", color: W, bold: true }, { text: "reveal the secret commands", color: D }] },
          { spans: [{ text: "  turtle      ", color: W, bold: true }, { text: "spawn a tiny turtle to walk across the shell", color: D }] },
          { spans: [{ text: "  snake       ", color: W, bold: true }, { text: "play classic Snake in the terminal", color: D }] },
          { spans: [{ text: "  keku        ", color: W, bold: true }, { text: "learn about the creator", color: D }] },
          { spans: [{ text: "  kill all    ", color: W, bold: true }, { text: "shutdown the system", color: D }] },
          { text: "" },
          { text: "  (there are also A LOT of secret ones)", color: Y },
        ];
        break;
      case "cls":
        setHistory([]);
        setInput("");
        return;
      case "ver":
        out = [
          { text: "Mnema '98 [Version 1.0.1998]", color: C },
          { text: "(C) Copyright Microsoft Corp 1981-1998." },
          { text: "Mnema AI Integration Core active.", color: promptColor },
        ];
        break;
      case "date":
      case "time": {
        out = [
          { text: `Current date is ${now.toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' })}` },
          { text: `Current time is ${now.toLocaleTimeString()} - the perfect time to write.` },
        ];
        break;
      }
      case "sysinfo":
        out = [
          { text: "─────────────────────────────────────────", dim: true },
          { text: "Mnema '98 System Specifications:", color: C, bold: true },
          { text: "─────────────────────────────────────────", dim: true },
          { text: "Processor      : Intel Pentium II @ 266 MHz" },
          { text: "Memory (RAM)   : 64.0 MB SDRAM" },
          { text: "Display Card   : S3 Virge/DX PCI (4 MB VRAM)" },
          { text: "Sound Board    : Creative Labs Sound Blaster 16" },
          { text: "Storage        : Quantum Fireball 3.2 GB IDE HDD" },
          { text: "RAG Core Engine: Gemini 2.5 Flash", color: promptColor },
          { text: "Embeddings     : Gemini Embedding 2 (768-dim)", color: promptColor },
          { text: "─────────────────────────────────────────", dim: true },
        ];
        break;
      case "dir":
        out = [
          { text: " Volume in drive C has no label.", dim: true },
          { text: " Volume Serial Number is 1998-0710", dim: true },
          { text: " Directory of C:\\MNEMA", color: C },
          { text: "" },
          { text: ".              <DIR>        07-10-98  10:00p ." },
          { text: "..             <DIR>        07-10-98  10:00p .." },
          { text: "JOURNAL  EXE        348,160 07-10-98  10:00p JOURNAL.EXE" },
          { text: "MEMORIES EXE        512,000 07-10-98  10:00p MEMORIES.EXE" },
          { text: "CHAT     EXE        256,000 07-10-98  10:00p CHAT.EXE" },
          { text: "SETTINGS BAT          1,024 07-10-98  10:00p SETTINGS.BAT" },
          { text: "README   TXT          1,280 07-10-98  10:00p README.TXT" },
          { text: "FUTURE   EXE         98,000 07-10-98  10:00p TIMEMACHINE.EXE" },
          { text: "               6 File(s)      1,216,464 bytes", dim: true },
          { text: "               2 Dir(s)      640,000,000 bytes free", dim: true },
        ];
        break;
      case "color": {
        const colorArg = parts[1];
        const colorMap: Record<string, [string, string]> = {
          green: ["#55ff55", "CLASSIC GREEN"],
          amber: ["#ffb000", "RETRO AMBER"],
          white: ["#ffffff", "HIGH-CONTRAST WHITE"],
          blue: ["#00aaff", "CYBERPUNK BLUE"],
        };
        if (colorArg && colorMap[colorArg]) {
          setPromptColor(colorMap[colorArg][0]);
          out = [{ text: `Prompt color set to ${colorMap[colorArg][1]}.`, color: colorMap[colorArg][0] }];
        } else {
          out = [
            { text: "Unknown color. Supported:", color: "#eb4d4b" },
            { text: "  color green, color amber, color white, color blue", dim: true },
          ];
        }
        break;
      }
      case "exit":
      case "win":
        onClose();
        return;
      case "kill":
        if (parts[1] === "all") {
          const shutdownLines = [
            { text: "" },
            { text: "⚠ SYSTEM SHUTDOWN INITIATED", color: "#eb4d4b", bold: true },
            { text: "─────────────────────────────────────────", dim: true },
            { text: "Terminating all active processes...", color: "#eb4d4b" },
            { text: "Flushing memory buffers...", dim: true },
            { text: "Saving emotional state to disk...", dim: true },
            { text: "Disconnecting RAG neural pathways...", dim: true },
            { text: "Archiving dreams and aspirations...", dim: true },
            { text: "" },
            { text: "It is now safe to turn off your computer.", color: "#f9ca24", bold: true },
          ];
          setHistory(prev => [...prev, { text: `root/ $ ${cmd}`, color: promptColor, bold: true }, ...shutdownLines]);
          setInput("");
          setTimeout(() => onShutDown(), 3000);
          return;
        } else if (parts[1] === "anxiety") {
          out = [
            { text: "Permission denied.", color: "#eb4d4b" },
            { text: "Try:" },
            { text: "  go_for_walk", color: promptColor },
            { text: "  call_friend", color: promptColor },
            { text: "  write_journal", color: promptColor },
          ];
        } else {
          out = [{ text: "Usage: kill all | kill anxiety", dim: true }];
        }
        break;
      case "keku":
        out = [
          { text: "Opening The Creator...", color: C },
        ];
        setTimeout(() => onOpenCreator(), 500);
        break;
      case "secret":
        out = [
          { text: "🤫 Shhh... you found the secret stash!", color: Y, bold: true },
          { text: "" },
          { spans: [{ text: "  doom          ", color: W, bold: true }, { text: "attempt to run DOOM (results may vary)", color: D }] },
          { spans: [{ text: "  mnema         ", color: W, bold: true }, { text: "display the Mnema ASCII logo", color: D }] },
          { spans: [{ text: "  matrix        ", color: W, bold: true }, { text: "trigger the Matrix digital rain", color: D }] },
          { spans: [{ text: "  remember      ", color: W, bold: true }, { text: "⎅⟒⌇☊⍀⟟⌿⏁⟟⍝⋏ ⍀⟒⎅⏃☊⏁⟒⎅", color: D }] },
          { spans: [{ text: "  mirror        ", color: W, bold: true }, { text: "⏁⊑⟒ ☌⍾⏃⎅⟟⏃⋏ ⌇⌿⟒⌰⌰", color: D }] },
          { spans: [{ text: "  reflect       ", color: W, bold: true }, { text: "⏃⌇☍ ⏁⊑⟒ ⍜⏀⏃☊⌰⟒", color: D }] },
          { spans: [{ text: "  mnemosyne     ", color: W, bold: true }, { text: "⏁⊑⟒ ⎎⎊⏁⊊⏀⟒ ⎎⏃⎅⟒⌇", color: D }] },
          { spans: [{ text: "  super secret  ", color: W, bold: true }, { text: "shhhh.. dont tell anyone,", color: D }] },
          { text: "" },
          { text: "  ...or maybe there are even more. Who knows?", dim: true },
        ];
        break;
      case "doom":
        out = [
          { text: "Loading Doom...", color: C },
          { text: "ERROR: Direct3D driver initialization failed.", color: "#eb4d4b" },
          { text: "Keyboard device driver loaded." },
          { text: "(Just kidding, go play some real Doom!)", dim: true },
        ];
        break;
      case "mnema":
        out = [
          { text: " __  __ _                              ", color: C, pre: true },
          { text: "|  \\/  | |__   ___ _ __ ___   __ _    ", color: C, pre: true },
          { text: "| |\\/| | '_ \\ / _ \\ '_ ` _ \\ / _` |   ", color: C, pre: true },
          { text: "| |  | | | | |  __/ | | | | | (_| |_  ", color: C, pre: true },
          { text: "|_|  |_|_| |_|\\___|_| |_| |_|\\__,_( ) ", color: C, pre: true },
          { text: "                                  |/  ", color: C, pre: true },
          { text: "Mnema AI Memory Companion - Est. 1998", color: Y },
        ];
        break;
      case "matrix":
        setIsMatrix(true);
        setInput("");
        return;
      case "hello":
        out = [
          { text: "Hello again." },
          { text: "Nice to see you back." },
        ];
        break;
      case "turtle":
        setTurtleActive(true);
        setTurtleX(-50);
        out = [{ text: "🐢 A wild Turtlo appears and goes for a walk...", color: promptColor }];
        break;
      case "snake":
        setSnakeBody([{ x: 10, y: 7 }, { x: 9, y: 7 }, { x: 8, y: 7 }]);
        setSnakeFood({ x: 4, y: 4 });
        setSnakeDir({ x: 1, y: 0 });
        setSnakeScore(0);
        setSnakeOver(false);
        setSnakePlaying(true);
        setInput("");
        return;
      case "remember":
        out = [
          { text: "Every journal you write" },
          { text: "is a letter to someone" },
          { text: "you haven't become yet." },
        ];
        break;
      case "mnemosyne":
      case "menemoyse":
        setFadeText("Memory is imperfect.\nThat is why we write.");
        setFadeActive(true);
        setTypedFadeText("");
        out = [{ text: "Fading into Mnemosyne...", dim: true }];
        break;
      case "mirror":
        setFadeText("The person reading this\nhas survived every bad day\nthey've ever had.\nKeep going.");
        setFadeActive(true);
        setTypedFadeText("");
        out = [{ text: "Consulting the mirror...", dim: true }];
        break;
      case "find": {
        if (parts[1] === "keys") {
          out = [
            { text: "Searching..." },
            { text: "Searching..." },
            { text: "Nothing found." },
            { text: "Maybe check yesterday's jeans.", color: Y },
          ];
        } else {
          out = [
            { text: "Searching..." },
            { text: "Nothing found." },
          ];
        }
        break;
      }
      case "reflect": {
        const REFLECT_QUESTIONS = [
          "What made you smile today?",
          "What would yesterday's you think of today?",
          "What is something you want to remember about this month?",
          "What was the most peaceful moment of your day?",
          "If today was a chapter in a book, what would it be titled?",
          "What is a small choice you made today that you're glad about?",
          "What did you learn about yourself this week?",
        ];
        const randomQ = REFLECT_QUESTIONS[Math.floor(Math.random() * REFLECT_QUESTIONS.length)];
        out = [
          { text: randomQ, color: C, bold: true },
        ];
        break;
      }
      case "pet":
        out = [
          { text: "You pet the terminal." },
          { text: "It seems happy. ᵔ ᵕ ᵔ", color: promptColor },
        ];
        break;
      case "go_for_walk":
        out = [
          { text: "*You take a deep breath of fresh air. Your mind feels clearer.*", color: promptColor },
        ];
        break;
      case "call_friend":
        out = [
          { text: "*You ring up a friend. It's nice to hear their voice.*", color: promptColor },
        ];
        break;
      case "write_journal":
        out = [
          { text: "*Opening New Journal App...*", color: promptColor },
        ];
        setTimeout(() => onOpenJournal(), 500);
        break;
      case "super":
        if (parts[1] === "secret") {
          out = [
            { text: "🔓 UNLOCKED: ALL TERMINAL COMMANDS", color: C, bold: true },
            { text: "Here is every single command registered in this shell:", dim: true },
            { text: "" },
            { text: "--- Standard Commands ---", color: Y, bold: true },
            { spans: [{ text: "  help          ", color: W, bold: true }, { text: "show standard help menu", color: D }] },
            { spans: [{ text: "  dir           ", color: W, bold: true }, { text: "list directory files", color: D }] },
            { spans: [{ text: "  cls           ", color: W, bold: true }, { text: "clear the terminal", color: D }] },
            { spans: [{ text: "  ver           ", color: W, bold: true }, { text: "display version info", color: D }] },
            { spans: [{ text: "  date / time   ", color: W, bold: true }, { text: "display current date and time", color: D }] },
            { spans: [{ text: "  sysinfo       ", color: W, bold: true }, { text: "display system specifications", color: D }] },
            { spans: [{ text: "  color [val]   ", color: W, bold: true }, { text: "set text color (green/amber/white/blue)", color: D }] },
            { spans: [{ text: "  keku          ", color: W, bold: true }, { text: "view details about the creator", color: D }] },
            { spans: [{ text: "  exit / win    ", color: W, bold: true }, { text: "close the prompt shell", color: D }] },
            { text: "" },
            { text: "--- Hidden & Easter Egg Commands ---", color: Y, bold: true },
            { spans: [{ text: "  secret        ", color: W, bold: true }, { text: "reveal hidden Easter egg list", color: D }] },
            { spans: [{ text: "  turtle        ", color: W, bold: true }, { text: "spawn walking Turtlo", color: D }] },
            { spans: [{ text: "  snake         ", color: W, bold: true }, { text: "play prompt Snake game", color: D }] },
            { spans: [{ text: "  doom          ", color: W, bold: true }, { text: "⎅⍜⍜⎎ ☊⍜⋏⌇⍜⌰⟒", color: D }] },
            { spans: [{ text: "  mnema         ", color: W, bold: true }, { text: "⋔⋏⟒⋔⏃", color: D }] },
            { spans: [{ text: "  matrix        ", color: W, bold: true }, { text: "⋔⏃⏁⍀⟟⌿", color: D }] },
            { spans: [{ text: "  remember      ", color: W, bold: true }, { text: "⎅⟒⌇☊⍀⟟⌿⏁⟟⍝⋏ ⍀⟒⎅⏃☊⏁⟒⎅", color: D }] },
            { spans: [{ text: "  mirror        ", color: W, bold: true }, { text: "⏁⊑⟒ ☌⍾⏃⎅⟟⏃⋏ ⌇⌿⟒⌰⌰", color: D }] },
            { spans: [{ text: "  reflect       ", color: W, bold: true }, { text: "⏃⌇☍ ⏁⊑⟒ ⍜⏀⏃☊⌰⟒", color: D }] },
            { spans: [{ text: "  mnemosyne     ", color: W, bold: true }, { text: "⏁⊑⟒ ⎎⎊⏁⊊⏀⟒ ⎎⏃⎅⟒⌇", color: D }] },
            { spans: [{ text: "  pet           ", color: W, bold: true }, { text: "⌿⏁ ⏁⊑⟒ ⌇⊑⌰⌰", color: D }] },
            { spans: [{ text: "  find keys     ", color: W, bold: true }, { text: "⎎⟟⋏⎅ ⌇⍜⋔⟒⏁⊑⟟⋏☌", color: D }] },
            { spans: [{ text: "  hello         ", color: W, bold: true }, { text: "⊑⟒⌰⌰⍜", color: D }] },
            { spans: [{ text: "  kill all      ", color: W, bold: true }, { text: "initiate OS shutdown procedure", color: D }] },
            { spans: [{ text: "  kill anxiety  ", color: W, bold: true }, { text: "☍⟟⌰⌰", color: D }] },
            { spans: [{ text: "  go_for_walk   ", color: W, bold: true }, { text: "⌇⏁⟒⌿ ⍜⎊⏁⌇⟟⎅⟒", color: D }] },
            { spans: [{ text: "  call_friend   ", color: W, bold: true }, { text: "☊⏃⌰⌰ ⌇⍜⋔⟒⍜⋏⟒", color: D }] },
            { spans: [{ text: "  write_journal ", color: W, bold: true }, { text: "⍜⌿⟒⋏ ⏁⊑⟒ ⏁⟒⌿⏁ ⟒⎅⟟⏁⍜⍀", color: D }] },
            { spans: [{ text: "  super secret  ", color: W, bold: true }, { text: "shhhh.. dont tell anyone,", color: D }] },
          ];
        } else {
          out = [{ text: "Command not found. But it sounded important.", color: "#eb4d4b" }];
        }
        break;
      default:
        out = [{ text: `Command not found. But it sounded important.`, color: "#eb4d4b" }];
    }

    // Time-based check (midnight limits reminder)
    const hour = now.getHours();
    if (hour >= 0 && hour < 4) {
      out = [
        { text: "🌙 You should probably sleep... or write.", color: Y, dim: true },
        { text: "" },
        ...out,
      ];
    }

    setHistory(prev => [...prev, prompt]);
    setPrintingQueue(prev => [...prev, ...out, { text: "" }]);
    setInput("");
  };

  const renderSnakeGame = () => {
    const cells = [];
    for (let y = 0; y < 15; y++) {
      const row = [];
      for (let x = 0; x < 20; x++) {
        const isHead = snakeBody[0] && snakeBody[0].x === x && snakeBody[0].y === y;
        const isBody = snakeBody.slice(1).some(b => b.x === x && b.y === y);
        const isFood = snakeFood.x === x && snakeFood.y === y;
        let char = ".";
        let color = "#333344";
        if (isHead) {
          char = "■";
          color = promptColor;
        } else if (isBody) {
          char = "■";
          color = promptColor;
        } else if (isFood) {
          char = "★";
          color = "#f9ca24";
        }
        row.push(
          <span key={x} style={{ color, fontFamily: TFONT, fontSize: "18px", width: "18px", display: "inline-block", textAlign: "center" }}>
            {char}
          </span>
        );
      }
      cells.push(<div key={y} style={{ height: "18px", display: "flex", justifyContent: "center" }}>{row}</div>);
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", background: "#1a1a28", color: "#d4d4d4", fontFamily: TFONT, padding: "20px" }}>
        <div style={{ fontSize: "20px", color: promptColor, fontWeight: "bold", marginBottom: "10px" }}>🐍 mSnake Prompt Edition</div>
        <div style={{ display: "flex", gap: "20px", marginBottom: "10px", fontSize: "14px" }}>
          <div>Score: <span style={{ color: "#f9ca24" }}>{snakeScore}</span></div>
          <div>Hi-Score: <span style={{ color: "#7ed6df" }}>{snakeHiScore}</span></div>
        </div>
        <div style={{ border: `2px solid ${promptColor}`, background: "#0a0a14", padding: "4px", lineHeight: 0 }}>
          {cells}
        </div>
        {snakeOver ? (
          <div style={{ marginTop: "15px", textAlign: "center" }}>
            <div style={{ color: "#eb4d4b", fontWeight: "bold", fontSize: "16px" }}>GAME OVER</div>
            <div style={{ fontSize: "12px", marginTop: "4px" }}>Press [ENTER] to Restart or [ESC] to Exit</div>
          </div>
        ) : (
          <div style={{ marginTop: "15px", fontSize: "11px", color: "#666" }}>
            Use W/A/S/D or Arrows to steer • Press [ESC] to quit
          </div>
        )}
      </div>
    );
  };

  const renderLine = (line: TermLine, idx: number) => {
    const textVal = line.text || "";
    const parts = textVal.split("\u0000");
    const hasHighlight = parts.length > 1;
    return (
      <div
        key={idx}
        style={{
          minHeight: "1.1em",
          color: line.color || (line.dim ? "#666" : "#d4d4d4"),
          fontWeight: line.bold ? "bold" : "normal",
          fontSize: line.size ? `${line.size}px` : undefined,
          whiteSpace: line.pre ? "pre" : "pre-wrap",
          marginTop: line.mt ? `${line.mt}px` : undefined,
          marginBottom: line.mb ? `${line.mb}px` : undefined,
        }}
      >
        {line.spans
          ? line.spans.map((span, i) => (
              <span
                key={i}
                style={{
                  color: span.color,
                  fontWeight: span.bold ? "bold" : "normal",
                }}
              >
                {span.text}
              </span>
            ))
          : hasHighlight
          ? parts.map((seg, i) =>
              i % 2 === 1
                ? <span key={i} style={{ color: "#7ed6df", fontWeight: "bold" }}>{seg}</span>
                : <span key={i}>{seg}</span>
            )
          : (line.text || "\u00A0")
        }
      </div>
    );
  };

  return (
    <div
      onClick={handleTerminalClick}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#1e1e2e",
        fontFamily: TFONT,
        overflow: "hidden",
        position: "relative",
        fontSize: "14px",
        lineHeight: "1.45",
      }}
    >
      {isMatrix ? (
        <div style={{ position: "absolute", inset: 0, background: "#000" }}>
          <MatrixRain onComplete={() => {
            setIsMatrix(false);
            setHistory(prev => [...prev, { text: "Matrix animation completed.", color: "#55ff55" }, { text: "" }]);
          }} />
        </div>
      ) : snakePlaying ? (
        renderSnakeGame()
      ) : (
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 20px",
          }}
        >
          {/* Welcome banner — inline, scrollable */}
          {welcomeLines.map((line, idx) => renderLine(line, idx))}

          <div style={{ borderTop: "1px solid #333", margin: "4px 0 12px" }} />

          {/* Command history */}
          {history.map((line, idx) => renderLine(line, idx + 1000))}
        </div>
      )}

      {/* Fade overlay typing effect */}
      {fadeActive && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "#000000",
            color: "#55ff55",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 2000,
            fontFamily: TFONT,
            padding: "30px",
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: "20px", lineHeight: "1.8", whiteSpace: "pre-wrap", filter: `drop-shadow(0 0 4px #55ff55aa)` }}>
            {typedFadeText}
          </div>
          {typedFadeText.length >= fadeText.length && (
            <div style={{ fontSize: "11px", color: "#666", marginTop: "50px" }}>
              (Press any key to return)
            </div>
          )}
        </div>
      )}

      {/* Turtle animation overlay */}
      {turtleActive && (
        <div
          style={{
            position: "absolute",
            bottom: "60px",
            left: `${turtleX}px`,
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          <svg width="40" height="40" viewBox="0 0 16 16" style={{ imageRendering: "pixelated" }}>
            <rect x="5" y="3" width="6" height="9" fill="#1b4d3e" />
            <rect x="6" y="2" width="4" height="11" fill="#1b4d3e" />
            <rect x="4" y="4" width="8" height="7" fill="#1b4d3e" />
            <rect x="5" y="4" width="6" height="7" fill="#2ecc71" />
            <rect x="7" y="5" width="2" height="5" fill="#27ae60" />
            <rect x="6" y="7" width="4" height="1" fill="#27ae60" />
            <rect x="7" y="1" width="2" height="2" fill="#2ecc71" />
            <rect x="6" y="2" width="1" height="1" fill="#fff" />
            <rect x="9" y="2" width="1" height="1" fill="#fff" />
            <rect x="3" y="4" width="2" height="2" fill="#27ae60" />
            <rect x="11" y="4" width="2" height="2" fill="#27ae60" />
            <rect x="3" y="9" width="2" height="2" fill="#27ae60" />
            <rect x="11" y="9" width="2" height="2" fill="#27ae60" />
          </svg>
        </div>
      )}

      {/* Prompt input */}
      {!isMatrix && !snakePlaying && (
        <form
          onSubmit={handleCommandSubmit}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "8px 20px 12px",
            flexShrink: 0,
            borderTop: "1px solid #333",
            background: "#1a1a28",
          }}
        >
          <span style={{ marginRight: "8px", flexShrink: 0, color: promptColor, fontWeight: "bold", fontFamily: TFONT }}>
            root/ $
          </span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#d4d4d4",
              fontFamily: TFONT,
              fontSize: "14px",
              padding: 0,
              caretColor: promptColor,
            }}
            autoComplete="off"
            spellCheck={false}
          />
        </form>
      )}
    </div>
  );
}
// ─── Creator App (Hidden, accessible via mShell 'keku' command) ───────────────
function CreatorApp() {
  return (
    <div
      style={{
        height: "100%",
        overflow: "auto",
        background: "#ffffff",
        fontFamily: SYS_FONT,
        padding: "16px 20px",
        fontSize: "12px",
        lineHeight: "1.7",
        color: "#1a1a1a",
      }}
    >
      {/* Header */}
      <div
        style={{
          textAlign: "center",
          marginBottom: "16px",
          paddingBottom: "12px",
          borderBottom: "2px solid #000080",
        }}
      >
        <div
          style={{
            fontSize: "22px",
            fontWeight: "bold",
            color: "#000080",
            letterSpacing: "1px",
          }}
        >
          The Creator
        </div>
        <div style={{ fontSize: "11px", color: "#808080", marginTop: "2px" }}>
          The story behind Mnema
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          background: "#f5f5f0",
          padding: "14px 16px",
          border: "1px solid #ccc",
          marginBottom: "14px",
          fontFamily: JOURNAL_FONT,
          fontSize: "13px",
          lineHeight: "1.8",
          color: "#222",
        }}
      >
        <p style={{ margin: "0 0 12px 0" }}>
          This project has been on my mind for quite some time now, and I had already
          written the RAG for this app a long time ago. But I didn't know how to make
          a website and deploy this, so this stayed a concept for a long time.
        </p>
        <p style={{ margin: "0 0 12px 0" }}>
          I tried learning Web Dev to make this app but I couldn't make nearly as much
          progress as I wanted so I gave this a break.
        </p>
        <p style={{ margin: "0 0 12px 0" }}>
          Now with Vibe Coding I finally was able to make the website how I wanted it
          to be. For the RAG I initially wrote the entire pipeline — text formatting,
          chunking, embedding and then retrieval using semantic search (Dot prod). But
          for the Database I was using MongoDB and for the generation I was using
          Mistral, then I mocked up a simple web interface mostly HTML to test it all.
          It worked great.
        </p>
        <p style={{ margin: "0 0 12px 0" }}>
          Soon the idea evolved to add mood levels, Goals, Tracking and Stats. Then
          because I didn't have the responsibility of coding the frontend I could
          ideate freely and I really liked this OS-in-a-browser aesthetic so I went
          with it. Generated a few mockups using Figma AI and got the gist of the
          concept on screen. For the final UI I used Antigravity which did all the
          frontend (which is basically all this website is). Then I switched to a
          Firebase database because we were using it for the database as well. And for
          the LLM and embeddings I switched to Gemini. The entire app uses free APIs
          and I will host this on a free hosting site.
        </p>
        <p style={{ margin: "0 0 12px 0" }}>
          Frankly the name for the app was suggested by ChatGPT — it suggested
          Mnemosyne which was the Greek goddess of memory, so I shortened it to Mnema.
        </p>
        <p style={{ margin: "0", fontWeight: "bold", color: "#000080" }}>
          This was really fun to work on.
        </p>
      </div>

      {/* Social Links with pixelated icons */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          justifyContent: "center",
          padding: "10px 0",
          borderTop: "1px solid #ccc",
        }}
      >
        {/* GitHub */}
        <a
          href="https://github.com/Krishnanshu06"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 10px",
            background: "#c0c0c0",
            textDecoration: "none",
            color: "#000",
            fontSize: "11px",
            fontFamily: SYS_FONT,
            cursor: "pointer",
            boxShadow:
              "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" style={{ imageRendering: "pixelated" }}>
            <rect x="5" y="1" width="6" height="2" fill="#333" />
            <rect x="3" y="3" width="2" height="2" fill="#333" />
            <rect x="11" y="3" width="2" height="2" fill="#333" />
            <rect x="1" y="5" width="2" height="6" fill="#333" />
            <rect x="13" y="5" width="2" height="6" fill="#333" />
            <rect x="3" y="5" width="10" height="6" fill="#333" />
            <rect x="3" y="11" width="2" height="2" fill="#333" />
            <rect x="11" y="11" width="2" height="2" fill="#333" />
            <rect x="5" y="11" width="2" height="2" fill="#333" />
            <rect x="5" y="13" width="2" height="2" fill="#333" />
            <rect x="3" y="13" width="2" height="2" fill="#333" />
            <rect x="5" y="7" width="2" height="2" fill="#fff" />
            <rect x="9" y="7" width="2" height="2" fill="#fff" />
          </svg>
          GitHub
        </a>

        {/* YouTube (rickroll) */}
        <a
          href="https://youtu.be/dQw4w9WgXcQ?t=0"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 10px",
            background: "#c0c0c0",
            textDecoration: "none",
            color: "#000",
            fontSize: "11px",
            fontFamily: SYS_FONT,
            cursor: "pointer",
            boxShadow:
              "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" style={{ imageRendering: "pixelated" }}>
            <rect x="1" y="3" width="14" height="10" rx="2" fill="#ff0000" />
            <polygon points="6,5 6,11 12,8" fill="#ffffff" />
          </svg>
          YouTube
        </a>
      </div>
    </div>
  );
}

// ─── Settings App ─────────────────────────────────────────────────────────────
interface SettingsAppProps {
  desktopColor: string;
  setDesktopColor: (c: string) => void;
  journalFont: string;
  setJournalFont: (f: string) => void;
  fontSize: string;
  setFontSize: (s: string) => void;
  personality: string;
  setPersonality: (p: string) => void;
  screenSaver: string;
  setScreenSaver: (s: string) => void;
  iconSize: string;
  setIconSize: (s: string) => void;
  setScreenSaverActive: (b: boolean) => void;
  desktopText: string;
  setDesktopText: (t: string) => void;
  desktopTextPreset: string;
  setDesktopTextPreset: (p: string) => void;
  onResetIconPositions: () => void;
  onResetAllSettings: () => void;
  confirmCustom: (message: string, subMessage?: string) => Promise<boolean>;
  user: any;
  onClose: () => void;
}

function SettingsApp({
  desktopColor,
  setDesktopColor,
  journalFont,
  setJournalFont,
  fontSize,
  setFontSize,
  personality,
  setPersonality,
  screenSaver,
  setScreenSaver,
  iconSize,
  setIconSize,
  setScreenSaverActive,
  desktopText,
  setDesktopText,
  desktopTextPreset,
  setDesktopTextPreset,
  onResetIconPositions,
  onResetAllSettings,
  confirmCustom,
  user,
  onClose,
}: SettingsAppProps) {
  const [tab, setTab] = useState("display");
  const [sounds, setSounds] = useState(true);
  const [reminders, setReminders] = useState(true);
  const [summaries, setSummaries] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);

  const tabs = ["Display", "Fonts", "AI", "Data"];

  const handleExport = async () => {
    setExporting(true);
    try {
      const q = query(
        collection(db, "users", user.uid, "entries"),
        orderBy("date", "desc")
      );
      const querySnapshot = await getDocs(q);
      let content = `MNEMA DIARY EXPORT\nUser ID: ${user.uid}\nGenerated At: ${new Date().toLocaleString()}\n==========================================\n\n`;
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        content += `DATE: ${data.date || "Unknown"}\n`;
        content += `TITLE: ${data.title || "Untitled"}\n`;
        content += `SENTIMENT MOOD: ${data.mood || 5}/10\n`;
        if (data.tags && data.tags.length > 0) {
          content += `TAGS: ${data.tags.map((t: string) => `#${t}`).join(", ")}\n`;
        }
        content += `------------------------------------------\n`;
        content += `${data.content || ""}\n`;
        content += `==========================================\n\n`;
      });

      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mnema_journal_${new Date().toISOString().split("T")[0]}.txt`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error exporting journal:", err);
      alert("Failed to export journal entries.");
    } finally {
      setExporting(false);
    }
  };

  const handleClearData = async () => {
    const accepted1 = await confirmCustom("WARNING: Are you sure you want to permanently DELETE all your logged journal entries?", "This action CANNOT be undone.");
    if (!accepted1) return;
    const accepted2 = await confirmCustom("FINAL CONFIRMATION: Double check, this will wipe all memories, tags, and embeddings indexed in the cloud database.", "Delete all data?");
    if (!accepted2) return;
    
    setClearing(true);
    try {
      const q = query(collection(db, "users", user.uid, "entries"));
      const querySnapshot = await getDocs(q);
      const deletePromises: Promise<void>[] = [];
      querySnapshot.forEach((d) => {
        deletePromises.push(deleteDoc(doc(db, "users", user.uid, "entries", d.id)));
      });
      await Promise.all(deletePromises);
      alert("All journal data and database tags cleared successfully. Please reload the app.");
    } catch (err) {
      console.error("Error clearing database entries:", err);
      alert("Failed to delete database logs.");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", fontFamily: SYS_FONT }}>
      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #808080",
          padding: "4px 4px 0",
          background: "#c0c0c0",
          flexShrink: 0,
        }}
      >
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t.toLowerCase())}
            style={{
              padding: "3px 10px",
              fontSize: "12px",
              cursor: "default",
              border: "none",
              fontFamily: SYS_FONT,
              marginRight: "2px",
              background: tab === t.toLowerCase() ? "#c0c0c0" : "#a8a8a8",
              position: "relative",
              top: tab === t.toLowerCase() ? "1px" : "0",
              boxShadow:
                tab === t.toLowerCase()
                  ? "inset -1px 0 #0a0a0a, inset 1px 0 #ffffff, inset 0 1px #ffffff"
                  : "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "12px" }}>
        {tab === "display" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div
              style={{
                background: "#000080",
                color: "white",
                padding: "2px 6px",
                fontSize: "11px",
                fontFamily: SYS_FONT,
              }}
            >
              Display Settings
            </div>
            
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label style={{ fontSize: "12px", width: "120px", flexShrink: 0 }}>
                Desktop Color:
              </label>
              <select
                value={desktopColor}
                onChange={(e) => setDesktopColor(e.target.value)}
                style={{ ...inputStyle({ background: "#ffffff", cursor: "default" }) }}
              >
                <option value="teal">Teal (#008080)</option>
                <option value="navy">Navy Blue (#000080)</option>
                <option value="purple">Classic Purple (#5a189a)</option>
                <option value="grey">Retro Grey (#555555)</option>
                <option value="black">Terminal Black (#000000)</option>
              </select>
            </div>

            {/* Window Style: Disabled with Plus! 95 joke */}
            <div
              title="Window style changes require Microsoft Plus! 95. We couldn't find the CD-ROM on drive A: or D:!"
              style={{ display: "flex", alignItems: "center", gap: "8px", opacity: 0.6 }}
            >
              <label style={{ fontSize: "12px", width: "120px", flexShrink: 0, cursor: "help" }}>
                Window Style:
              </label>
              <select style={{ ...inputStyle({ background: "#e0e0e0", cursor: "help" }) }} disabled>
                <option>Windows 95 Classic</option>
              </select>
            </div>

            {/* Screensaver setting: fully functional */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label style={{ fontSize: "12px", width: "120px", flexShrink: 0 }}>
                Screen Saver:
              </label>
              <div style={{ display: "flex", gap: "4px", flex: 1 }}>
                <select
                  value={screenSaver}
                  onChange={(e) => setScreenSaver(e.target.value)}
                  style={{ ...inputStyle({ background: "#ffffff", cursor: "default", flex: 1 }) }}
                >
                  <option value="none">None</option>
                  <option value="windows">Flying Windows</option>
                  <option value="starfield">Starfield Simulation</option>
                  <option value="mystify">Mystify Your Mind</option>
                </select>
                <W95Btn
                  small
                  disabled={screenSaver === "none"}
                  onClick={() => setScreenSaverActive(true)}
                  style={{ minWidth: "60px" }}
                >
                  Preview
                </W95Btn>
              </div>
            </div>

            {/* Icon Size setting: fully functional */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label style={{ fontSize: "12px", width: "120px", flexShrink: 0 }}>
                Icon Size:
              </label>
              <select
                value={iconSize}
                onChange={(e) => setIconSize(e.target.value)}
                style={{ ...inputStyle({ background: "#ffffff", cursor: "default" }) }}
              >
                <option value="small">Small (16x16)</option>
                <option value="normal">Normal (32x32)</option>
                <option value="large">Large (48x48)</option>
              </select>
            </div>

            {/* Wallpaper Text setting: fully functional */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label style={{ fontSize: "12px", width: "120px", flexShrink: 0 }}>
                Wallpaper Text:
              </label>
              <select
                value={desktopTextPreset}
                onChange={(e) => {
                  const val = e.target.value;
                  setDesktopTextPreset(val);
                  if (val === "mnema98") {
                    setDesktopText("Mnema '98");
                  } else if (val === "mnemosyne") {
                    setDesktopText("Mnemosyne");
                  } else if (val === "mnema") {
                    setDesktopText("Mnema");
                  } else if (val === "machine") {
                    setDesktopText("It works on my machine!");
                  } else if (val === "disk2") {
                    setDesktopText("Insert Disk 2...");
                  }
                }}
                style={{ ...inputStyle({ background: "#ffffff", cursor: "default" }) }}
              >
                <option value="mnema98">Mnema '98</option>
                <option value="mnemosyne">Mnemosyne</option>
                <option value="mnema">Mnema</option>
                <option value="machine">It works on my machine!</option>
                <option value="disk2">Insert Disk 2...</option>
                <option value="custom">[Custom Text]</option>
              </select>
            </div>

            {/* Custom Wallpaper Text input */}
            {desktopTextPreset === "custom" && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <label style={{ fontSize: "12px", width: "120px", flexShrink: 0 }}>
                  Custom Text:
                </label>
                <input
                  type="text"
                  maxLength={25}
                  value={desktopText}
                  onChange={(e) => setDesktopText(e.target.value)}
                  placeholder="Enter custom text..."
                  style={{ ...inputStyle({ background: "#ffffff", flex: 1 }) }}
                />
              </div>
            )}
            
            {/* Enable sounds: Disabled with Sound Blaster 16 joke */}
            <div 
              title="Requires a Sound Blaster 16 card. Sound cards are expensive in 1998, check back later!"
              style={{ display: "flex", alignItems: "center", gap: "6px", opacity: 0.6, cursor: "help" }}
            >
              <input
                type="checkbox"
                id="sounds"
                checked={false}
                disabled
                style={{ cursor: "help" }}
              />
              <label htmlFor="sounds" style={{ fontSize: "12px", cursor: "help" }}>
                Enable desktop sounds
              </label>
            </div>
          </div>
        )}

        {tab === "fonts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div
              style={{
                background: "#000080",
                color: "white",
                padding: "2px 6px",
                fontSize: "11px",
                fontFamily: SYS_FONT,
              }}
            >
              Font Settings
            </div>
            
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label style={{ fontSize: "12px", width: "110px", flexShrink: 0 }}>
                Journal Font:
              </label>
              <select
                value={journalFont}
                onChange={(e) => setJournalFont(e.target.value)}
                style={{ ...inputStyle({ background: "#ffffff" }) }}
              >
                <option value="Special Elite">Special Elite (Typewriter)</option>
                <option value="Georgia">Georgia (Serif)</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Palatino">Palatino</option>
                <option value="Sans-Serif">Sans-Serif (Arial)</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <label style={{ fontSize: "12px", width: "110px", flexShrink: 0, paddingTop: "2px" }}>
                Font Size:
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {["Small", "Medium", "Large"].map((s) => (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <input
                      type="radio"
                      name="fontsize"
                      checked={fontSize.toLowerCase() === s.toLowerCase()}
                      onChange={() => setFontSize(s.toLowerCase())}
                    />
                    <label style={{ fontSize: "12px", cursor: "default" }}>{s}</label>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                padding: "8px",
                background: "#fffff8",
                fontFamily:
                  journalFont.toLowerCase() === "georgia"
                    ? "Georgia, serif"
                    : journalFont.toLowerCase() === "times new roman"
                    ? "'Times New Roman', Times, serif"
                    : journalFont.toLowerCase() === "palatino"
                    ? "'Palatino Linotype', Palatino, serif"
                    : journalFont.toLowerCase() === "sans-serif"
                    ? "Arial, Helvetica, sans-serif"
                    : JOURNAL_FONT,
                fontSize: fontSize.toLowerCase() === "small" ? "12px" : fontSize.toLowerCase() === "large" ? "18px" : "13px",
                lineHeight: "1.6",
                ...sunken,
                minHeight: "60px",
                color: "#000000"
              }}
            >
              Preview: The quick brown fox jumps over the lazy dog. This is how your journal
              entries will look as you write them late at night.
            </div>
          </div>
        )}

        {tab === "ai" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div
              style={{
                background: "#000080",
                color: "white",
                padding: "2px 6px",
                fontSize: "11px",
                fontFamily: SYS_FONT,
              }}
            >
              AI Personalization
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label style={{ fontSize: "12px", width: "110px", flexShrink: 0 }}>
                Personality:
              </label>
              <select
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                style={{ ...inputStyle({ background: "#ffffff" }) }}
              >
                <option value="friendly">Friendly & Warm</option>
                <option value="clinical">Clinical & Precise</option>
                <option value="poetic">Poetic & Reflective</option>
                <option value="terse">Brief & Direct</option>
              </select>
            </div>
            {/* Daily reminders: Greyed out checkbox with carrier pigeon joke */}
            <div 
              title="We tried writing reminders, but the carrier pigeon got lost on its way to 1998!"
              style={{ display: "flex", alignItems: "center", gap: "6px", opacity: 0.6, cursor: "help" }}
            >
              <input
                type="checkbox"
                id="reminders"
                checked={false}
                disabled
                style={{ cursor: "help" }}
              />
              <label htmlFor="reminders" style={{ fontSize: "12px", cursor: "help" }}>
                Daily writing reminders
              </label>
            </div>
            {/* Weekly summaries: Greyed out checkbox with virtual epoch joke */}
            <div 
              title="Weekly summaries require 7 days. It is currently day 1 of the virtual 1998 epoch."
              style={{ display: "flex", alignItems: "center", gap: "6px", opacity: 0.6, cursor: "help" }}
            >
              <input
                type="checkbox"
                id="summaries"
                checked={false}
                disabled
                style={{ cursor: "help" }}
              />
              <label htmlFor="summaries" style={{ fontSize: "12px", cursor: "help" }}>
                Weekly AI memory summaries
              </label>
            </div>
          </div>
        )}

        {tab === "data" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div
              style={{
                background: "#000080",
                color: "white",
                padding: "2px 6px",
                fontSize: "11px",
                fontFamily: SYS_FONT,
              }}
            >
              Data Management
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <W95Btn onClick={handleExport} disabled={exporting}>
                {exporting ? "Exporting..." : "Export Journal (.txt)"}
              </W95Btn>
              
              {/* Import Backup: Disabled with floppy disk drive joke */}
              <div title="Floppy disk drive (A:) not found. Please insert a 3.5&quot; floppy disk to proceed." style={{ display: "flex", flexDirection: "column", cursor: "help" }}>
                <W95Btn disabled style={{ cursor: "help", width: "100%" }}>Import Backup File...</W95Btn>
              </div>
              
              {/* Create Backup: Disabled with disk size joke */}
              <div title="Backup failed: Not enough storage space on your 1.44MB floppy disk!" style={{ display: "flex", flexDirection: "column", cursor: "help" }}>
                <W95Btn disabled style={{ cursor: "help", width: "100%" }}>Create Full Backup</W95Btn>
              </div>
            </div>

            <div
              style={{
                borderTop: "1px solid #808080",
                paddingTop: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <div style={{ fontSize: "11px", color: "#808080" }}>System Maintenance</div>
              <W95Btn onClick={onResetIconPositions}>
                Reset Icon Positions
              </W95Btn>
              <W95Btn onClick={onResetAllSettings}>
                Reset All Settings
              </W95Btn>
            </div>

            <div
              style={{
                borderTop: "1px solid #808080",
                paddingTop: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <div style={{ fontSize: "11px", color: "#808080" }}>Danger Zone</div>
              <W95Btn onClick={handleClearData} disabled={clearing} style={{ color: "#a00000" }}>
                {clearing ? "Clearing..." : "Clear All Data..."}
              </W95Btn>
            </div>
          </div>
        )}



        <div
          style={{
            display: "flex",
            gap: "6px",
            justifyContent: "flex-end",
            marginTop: "16px",
          }}
        >
          <W95Btn onClick={onClose}>OK</W95Btn>
          <W95Btn onClick={onClose}>Cancel</W95Btn>
          <W95Btn onClick={onClose} style={{ fontWeight: "bold" }}>Apply</W95Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Screen Saver Component ───────────────────────────────────────────────────
function ScreenSaver({ type }: { type: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrame: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    if (type === "starfield") {
      // Starfield simulation
      const numStars = 200;
      const stars: { x: number; y: number; z: number }[] = [];
      for (let i = 0; i < numStars; i++) {
        stars.push({
          x: Math.random() * width - width / 2,
          y: Math.random() * height - height / 2,
          z: Math.random() * width,
        });
      }

      const draw = () => {
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = "white";
        for (let i = 0; i < numStars; i++) {
          const s = stars[i];
          s.z -= 3;
          if (s.z <= 0) {
            s.z = width;
            s.x = Math.random() * width - width / 2;
            s.y = Math.random() * height - height / 2;
          }

          const k = 128.0 / s.z;
          const px = s.x * k + width / 2;
          const py = s.y * k + height / 2;

          if (px >= 0 && px < width && py >= 0 && py < height) {
            const size = (1 - s.z / width) * 4;
            ctx.beginPath();
            ctx.arc(px, py, size, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        animFrame = requestAnimationFrame(draw);
      };
      draw();
    } else if (type === "mystify") {
      // Mystify Your Mind: bouncing lines
      const numPoints = 4;
      const points: { x: number; y: number; vx: number; vy: number }[] = [];
      for (let i = 0; i < numPoints; i++) {
        points.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 0.5) * 6,
        });
      }

      const history: { x: number; y: number }[][] = [];
      const maxHistory = 15;
      let hue = 0;

      const draw = () => {
        ctx.fillStyle = "rgba(0, 0, 0, 0.1)"; // line trailing effect
        ctx.fillRect(0, 0, width, height);

        const currentPoints: { x: number; y: number }[] = [];
        points.forEach((p) => {
          p.x += p.vx;
          p.y += p.vy;

          if (p.x <= 0 || p.x >= width) p.vx *= -1;
          if (p.y <= 0 || p.y >= height) p.vy *= -1;

          currentPoints.push({ x: p.x, y: p.y });
        });

        history.push(currentPoints);
        if (history.length > maxHistory) {
          history.shift();
        }

        hue = (hue + 1) % 360;
        ctx.lineWidth = 2;

        history.forEach((pts, step) => {
          ctx.strokeStyle = `hsla(${(hue + step * 8) % 360}, 100%, 50%, ${step / maxHistory})`;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
          }
          ctx.lineTo(pts[0].x, pts[0].y);
          ctx.stroke();
        });

        animFrame = requestAnimationFrame(draw);
      };
      draw();
    } else if (type === "windows") {
      // Flying Windows (classic logo colors in flags)
      const numWindows = 25;
      const items: { x: number; y: number; z: number; color: string; rot: number; rotSpeed: number }[] = [];
      const colors = ["#ff595e", "#ffca3a", "#8ac926", "#1982c4"];
      for (let i = 0; i < numWindows; i++) {
        items.push({
          x: Math.random() * width - width / 2,
          y: Math.random() * height - height / 2,
          z: Math.random() * width,
          color: colors[Math.floor(Math.random() * colors.length)],
          rot: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.04,
        });
      }

      const draw = () => {
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, width, height);

        items.forEach((item) => {
          item.z -= 3;
          item.rot += item.rotSpeed;
          if (item.z <= 0) {
            item.z = width;
            item.x = Math.random() * width - width / 2;
            item.y = Math.random() * height - height / 2;
          }

          const k = 140.0 / item.z;
          const px = item.x * k + width / 2;
          const py = item.y * k + height / 2;
          const size = (1 - item.z / width) * 70;

          if (px >= -size && px < width + size && py >= -size && py < height + size) {
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(item.rot);

            ctx.fillStyle = item.color;
            ctx.beginPath();
            ctx.moveTo(-size/2, -size/2);
            ctx.quadraticCurveTo(0, -size/3, size/2, -size/2);
            ctx.lineTo(size/2, size/2);
            ctx.quadraticCurveTo(0, size/3, -size/2, size/2);
            ctx.closePath();
            ctx.fill();

            // White retro border
            ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
            ctx.stroke();

            // Simple flying tail
            ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
            ctx.fillRect(-size/3, -size/3, size * 0.5, size * 0.5);

            ctx.restore();
          }
        });

        animFrame = requestAnimationFrame(draw);
      };
      draw();
    }

    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener("resize", handleResize);
    };
  }, [type]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        background: "black",
        zIndex: 999999,
        cursor: "none",
      }}
    />
  );
}

// ─── Desktop Icon ─────────────────────────────────────────────────────────────
function DesktopIcon({
  icon,
  label,
  onDoubleClick,
  selected,
  onClick,
  size = "normal",
}: {
  icon: React.ComponentType<{ size?: number }> | React.ReactNode;
  label: string;
  onDoubleClick: () => void;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  size?: string;
}) {
  let pixelSize = 42;
  let containerWidth = "68px";
  let gap = "1px";
  let fontSize = "11px";

  if (size === "small") {
    pixelSize = 32;
    containerWidth = "56px";
    gap = "1px";
    fontSize = "10px";
  } else if (size === "large") {
    pixelSize = 52;
    containerWidth = "84px";
    gap = "2px";
    fontSize = "12px";
  }

  const IconComponent = icon as React.ComponentType<{ size?: number }>;
  const renderedIcon = typeof icon === "function"
    ? <IconComponent size={pixelSize} />
    : icon;

  return (
    <div
      onDoubleClick={onDoubleClick}
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: gap,
        padding: "4px",
        cursor: "default",
        width: containerWidth,
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "2px",
          background: selected ? "rgba(0,0,128,0.4)" : "transparent",
          outline: selected ? "1px dotted #ffffff" : "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {renderedIcon}
      </div>
      <span
        style={{
          fontSize: fontSize,
          textAlign: "center",
          color: "white",
          background: selected ? "#000080" : "transparent",
          padding: "1px 3px",
          fontFamily: SYS_FONT,
          lineHeight: "1.3",
          textShadow: selected ? "none" : "1px 1px 2px #000, -1px -1px 2px #000",
          wordBreak: "break-word",
        }}
      >
        {label}
      </span>
    </div>
  );
}
function PaintApp({
  currentDoodle,
  setCurrentDoodle,
  onClose,
}: {
  currentDoodle: string | null;
  setCurrentDoodle: (val: string | null) => void;
  onClose: () => void;
}) {
  const palette = [
    "transparent", // 0
    "#000000",     // 1
    "#808080",     // 2
    "#c0c0c0",     // 3
    "#ffffff",     // 4
    "#800000",     // 5
    "#ff0000",     // 6
    "#808000",     // 7
    "#ffff00",     // 8
    "#008000",     // 9
    "#00ff00",     // 10
    "#008080",     // 11
    "#00ffff",     // 12
    "#000000",     // 13
    "#0000ff",     // 14
    "#800080",     // 15
  ];

  const [grid, setGrid] = useState<number[]>(() => {
    if (currentDoodle && currentDoodle.length === 1024) {
      return currentDoodle.split("").map((c) => parseInt(c, 16));
    }
    return Array(1024).fill(0);
  });

  const [selectedColor, setSelectedColor] = useState(1);
  const [tool, setTool] = useState<"pencil" | "eraser">("pencil");
  const isDrawing = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 320, 320);

    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const colorIdx = grid[y * 32 + x];
        if (colorIdx !== 0) {
          ctx.fillStyle = palette[colorIdx];
          ctx.fillRect(x * 10, y * 10, 10, 10);
        } else {
          ctx.fillStyle = "#f5f6fa";
          ctx.fillRect(x * 10, y * 10, 10, 10);
          ctx.strokeStyle = "#e8ecef";
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x * 10, y * 10, 10, 10);
        }
      }
    }
  }, [grid]);

  const drawPixel = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / 10);
    const y = Math.floor((clientY - rect.top) / 10);

    if (x >= 0 && x < 32 && y >= 0 && y < 32) {
      const idx = y * 32 + x;
      const targetColor = tool === "eraser" ? 0 : selectedColor;
      if (grid[idx] !== targetColor) {
        setGrid((prev) => {
          const next = [...prev];
          next[idx] = targetColor;
          return next;
        });
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isDrawing.current = true;
    drawPixel(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDrawing.current) {
      drawPixel(e.clientX, e.clientY);
    }
  };

  const handleMouseUpOrLeave = () => {
    isDrawing.current = false;
  };

  const handleSave = () => {
    const doodleStr = grid.map((val) => val.toString(16)).join("");
    setCurrentDoodle(doodleStr);
    onClose();
  };

  const handleClear = () => {
    if (window.confirm("Clear canvas?")) {
      setGrid(Array(1024).fill(0));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#c0c0c0", fontFamily: SYS_FONT }}>
      <MenuBar items={["File", "Edit", "Colors", "Help"]} />
      
      <div style={{ display: "flex", flex: 1, padding: "6px", gap: "6px", overflow: "hidden" }}>
        {/* Left Toolbar */}
        <div style={{ width: "42px", display: "flex", flexDirection: "column", gap: "4px", ...raised, padding: "4px", background: "#c0c0c0" }}>
          <button
            onClick={() => setTool("pencil")}
            style={{
              padding: "4px",
              background: tool === "pencil" ? "#e0e0e0" : "#c0c0c0",
              border: "none",
              cursor: "default",
              boxShadow: tool === "pencil"
                ? "inset -1px -1px #ffffff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a"
                : "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Pencil Tool"
          >
            <svg fill="currentColor" width="18" height="18" viewBox="0 0 0.494 0.868" style={{ display: "inline-block", verticalAlign: "middle" }}>
              <g id="pen">
                <path d="M0.42 0.778A0.028 0.028 0 0 0 0.392 0.75H0.088A0.028 0.028 0 0 0 0.06 0.778v0.064q0.002 0.026 0.028 0.028h0.304A0.028 0.028 0 0 0 0.42 0.842z"/>
                <path d="M0.402 0.58 0.48 0.386A0.18 0.18 0 0 0 0.458 0.218L0.3 0.006Q0.294 0.002 0.282 0.002q-0.016 0 -0.012 0.012v0.302q0.048 0.02 0.05 0.068c0 0.04 -0.03 0.074 -0.07 0.074S0.174 0.426 0.174 0.384Q0.17 0.338 0.212 0.318V0.012Q0.214 0.004 0.21 0.002 0.204 0 0.2 0.006L0.034 0.218a0.18 0.18 0 0 0 -0.022 0.17l0.08 0.198a0.06 0.06 0 0 0 -0.02 0.044c0 0.034 0.024 0.06 0.056 0.06h0.246c0.03 0 0.054 -0.026 0.054 -0.06A0.06 0.06 0 0 0 0.402 0.58"/>
              </g>
            </svg>
          </button>
          <button
            onClick={() => setTool("eraser")}
            style={{
              padding: "4px",
              background: tool === "eraser" ? "#e0e0e0" : "#c0c0c0",
              border: "none",
              cursor: "default",
              boxShadow: tool === "eraser"
                ? "inset -1px -1px #ffffff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a"
                : "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf",
              fontSize: "12px",
            }}
            title="Eraser Tool"
          >
            🧽
          </button>
          
          <div style={{ flex: 1 }} />
          
          {/* Selected Color indicator */}
          <div style={{ height: "26px", border: "1px solid #808080", background: palette[selectedColor] === "transparent" ? "#ffffff" : palette[selectedColor], display: "flex", alignItems: "center", justifyContent: "center", ...sunken }} title="Current Color" />
        </div>

        {/* Canvas container */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", overflow: "auto", ...sunken, background: "#808080", padding: "10px" }}>
          <canvas
            ref={canvasRef}
            width={320}
            height={320}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            style={{
              display: "block",
              cursor: "crosshair",
              boxShadow: "2px 2px 6px rgba(0,0,0,0.4)",
            }}
          />
        </div>
      </div>

      {/* Color Palette (Bottom tray) */}
      <div style={{ padding: "6px", display: "flex", flexDirection: "column", gap: "6px", borderTop: "1px solid #808080" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: "2px", width: "100%", background: "#fff", padding: "4px", ...sunken }}>
          {palette.map((color, i) => (
            <div
              key={i}
              onClick={() => { setSelectedColor(i); setTool("pencil"); }}
              style={{
                height: "18px",
                background: color === "transparent" ? "#ffffff" : color,
                border: selectedColor === i ? "2px solid #000" : "1px solid #808080",
                cursor: "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {color === "transparent" && <span style={{ fontSize: "8px", color: "#808080" }}>X</span>}
            </div>
          ))}
        </div>

        {/* Save/Cancel Actions */}
        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
          <W95Btn onClick={handleSave} style={{ fontWeight: "bold", display: "flex", alignItems: "center" }}>
            <svg fill="currentColor" width="14" height="14" viewBox="0 0 0.75 0.75" xmlns="http://www.w3.org/2000/svg" data-name="Layer 1" style={{ marginRight: "6px" }}>
              <path d="M0.21 0.29a0.031 0.031 0 0 0 -0.044 0 0.031 0.031 0 0 0 -0.007 0.01 0.031 0.031 0 0 0 0.007 0.034 0.037 0.037 0 0 0 0.01 0.007A0.026 0.026 0 0 0 0.188 0.344a0.031 0.031 0 0 0 0.029 -0.043 0.031 0.031 0 0 0 -0.007 -0.01M0.313 0.344a0.031 0.031 0 0 0 0.029 -0.043 0.031 0.031 0 0 0 -0.007 -0.01 0.031 0.031 0 0 0 -0.028 -0.009 0.019 0.019 0 0 0 -0.006 0.002l-0.006 0.003 -0.005 0.004A0.033 0.033 0 0 0 0.281 0.313a0.031 0.031 0 0 0 0.031 0.031m-0.113 0.065a0.031 0.031 0 0 0 -0.024 0A0.031 0.031 0 0 0 0.156 0.438a0.031 0.031 0 0 0 0.043 0.029 0.037 0.037 0 0 0 0.01 -0.007A0.031 0.031 0 0 0 0.219 0.438a0.031 0.031 0 0 0 -0.009 -0.022 0.028 0.028 0 0 0 -0.01 -0.007M0.438 0.406h-0.125a0.031 0.031 0 0 0 0 0.063h0.125a0.031 0.031 0 0 0 0 -0.063m0.022 -0.116a0.031 0.031 0 0 0 -0.044 0 0.031 0.031 0 0 0 -0.007 0.01A0.031 0.031 0 1 0 0.469 0.313a0.026 0.026 0 0 0 -0.003 -0.012 0.031 0.031 0 0 0 -0.007 -0.01m0.12 0.121a0.025 0.025 0 0 0 -0.006 -0.003 0.031 0.031 0 0 0 -0.024 0 0.037 0.037 0 0 0 -0.01 0.007A0.033 0.033 0 0 0 0.531 0.438a0.031 0.031 1 0 0.063 0 0.033 0.033 0 0 0 -0.009 -0.022ZM0.625 0.156H0.125a0.094 0.094 0 0 0 -0.094 0.094v0.25a0.094 0.094 0 0 0 0.094 0.094h0.5a0.094 0.094 0 0 0 0.094 -0.094V0.25a0.094 0.094 0 0 0 -0.094 -0.094m0.031 0.344a0.031 0.031 0 0 1 -0.031 0.031H0.125a0.031 0.031 0 0 1 -0.031 -0.031V0.25a0.031 0.031 0 0 1 0.031 -0.031h0.5a0.031 0.031 0 0 1 0.031 0.031Zm-0.072 -0.21A0.031 0.031 0 0 0 0.531 0.313a0.031 0.031 0 1 0 0.06 -0.012 0.031 0.031 0 0 0 -0.007 -0.01"/>
            </svg>
            Attach to Journal
          </W95Btn>
          <W95Btn onClick={handleClear}>Clear</W95Btn>
          <W95Btn onClick={onClose}>Cancel</W95Btn>
        </div>
      </div>
    </div>
  );
}
// ─── Start Menu ───────────────────────────────────────────────────────────────
function StartMenu({
  onOpenApp,
  onClose,
  onShutDown,
}: {
  onOpenApp: (id: AppId) => void;
  onClose: () => void;
  onShutDown: () => void;
}) {
  const items: { id: AppId; label: string; icon: React.ReactNode }[] = [
    { id: "journal", label: "New Journal Entry", icon: <IconJournal size={20} /> },
    { id: "memories", label: "Memories", icon: <IconFolder size={20} /> },
    { id: "chat", label: "Chat", icon: <IconChat size={20} /> },
    { id: "profile", label: "System Monitor", icon: <IconProfile size={20} /> },
    { id: "settings", label: "Settings", icon: <IconSettings size={20} /> },
    { id: "help", label: "Help & Support", icon: <IconHelp size={20} /> },
    { id: "goals", label: "Time Machine", icon: <IconTimeMachine size={20} /> },
    { id: "terminal", label: "mShell", icon: <IconTerminal size={20} /> },
    { id: "paint", label: "Paint", icon: <IconPaint size={20} /> },
  ];

  return (
    <div
      style={{
        position: "fixed",
        bottom: "48px",
        left: 0,
        zIndex: 10000,
        background: "#c0c0c0",
        width: "240px",
        boxShadow:
          "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf, 3px 0 0 #000",
        display: "flex",
      }}
    >
      {/* Vertical stripe */}
      <div
        style={{
          width: "34px",
          background: "linear-gradient(to top, #000080, #404080)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          paddingBottom: "10px",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: "white",
            fontSize: "16px",
            fontWeight: "bold",
            fontFamily: SYS_FONT,
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            letterSpacing: "3px",
          }}
        >
          Mnema{" "}
          <span style={{ color: "#a0a0ff", fontWeight: "normal" }}>98</span>
        </span>
      </div>
      {/* Menu items */}
      <div style={{ flex: 1 }}>
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              onOpenApp(item.id);
              onClose();
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "#000080";
              (e.currentTarget as HTMLElement).style.color = "white";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "black";
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              width: "100%",
              padding: "8px 12px",
              fontSize: "13px",
              cursor: "default",
              background: "transparent",
              border: "none",
              fontFamily: SYS_FONT,
              textAlign: "left",
              color: "black",
            }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        <div style={{ borderTop: "1px solid #808080", margin: "4px 0" }} />
        <button
          onClick={onShutDown}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#000080";
            (e.currentTarget as HTMLElement).style.color = "white";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "black";
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            width: "100%",
            padding: "8px 12px",
            fontSize: "13px",
            cursor: "default",
            background: "transparent",
            border: "none",
            fontFamily: SYS_FONT,
            color: "black",
          }}
        >
          Shut Down...
        </button>
      </div>
    </div>
  );
}

// ─── Taskbar ──────────────────────────────────────────────────────────────────
const APP_LABELS: Record<AppId, string> = {
  journal: "New Journal",
  memories: "Memories",
  chat: "Chat w/ Mnema",
  profile: "System Monitor",
  settings: "Settings",
  help: "Help & Support",
  goals: "Time Machine",
  terminal: "mShell",
  creator: "The Creator",
  paint: "Paint",
};

const TrayOrangeIcon = () => (
  <svg width="20" height="20" viewBox="-20 0 190 190" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: "12px" }}>
    <path fillRule="evenodd" clipRule="evenodd" d="M129.49 114.51C129.121 116.961 128.187 119.293 126.762 121.322C125.337 123.351 123.461 125.021 121.28 126.2C120.676 126.535 120.043 126.816 119.39 127.04C120.22 138.04 102.74 142.04 93.32 139.42L96.82 151.66L87.82 151.98L72.07 129.43C66.76 130.93 60.49 131.65 56.44 125.15C56.0721 124.553 55.7382 123.935 55.44 123.3C54.4098 123.3 53.3614 123.617 52.31 123.62C49.31 123.62 44.31 122.72 41.77 120.96C39.7563 119.625 38.1588 117.75 37.16 115.55C31.75 116.29 27.16 115.02 24.16 111.88C20.36 107.97 19.28 101.51 21.26 94.58C23.87 85.33 31.81 74.91 47.59 71C48.9589 69.2982 50.5972 67.8322 52.44 66.66C62.35 60.31 78.44 59.76 90.65 65.79C95.3836 64.9082 100.27 65.376 104.75 67.14C113.53 70.43 119.91 77.31 121.11 84.3C123.487 85.5317 125.433 87.4568 126.69 89.82C129.32 94.76 129.69 99.71 127.92 103.71C129.587 107.049 130.138 110.835 129.49 114.51ZM123.01 109.31C121.612 110.048 120.056 110.434 118.475 110.434C116.894 110.434 115.338 110.048 113.94 109.31L114.67 104.46C117.75 104.76 120.26 103.8 121.57 101.83C123.04 99.64 122.81 96.39 120.95 92.9C118.87 88.99 114.38 88.37 111.89 88.34H111.73C105.49 88.34 99.13 91.89 96.56 96.52L92.82 94.73C93.5553 92.3449 94.8046 90.15 96.48 88.3C95.0376 87.0754 93.9474 85.4887 93.32 83.703C92.696 81.9173 92.5574 79.9971 92.92 78.14L96.61 77.8C96.7789 79.302 97.4 80.7172 98.3911 81.8583C99.3822 82.9994 100.697 83.8125 102.16 84.19C105.238 82.8161 108.58 82.1335 111.95 82.19C112.43 82.19 112.89 82.24 113.36 82.27C110.969 78.0312 107.18 74.7545 102.64 73C91.56 68.7 84.09 75.37 82.38 77.67C78.26 83.19 80.9 88.41 82.91 91.8L79.61 94.8C76.736 92.314 74.8075 88.9127 74.15 85.17C69.92 86.44 64.24 86.17 61.06 80.74L64.06 78.68C67.43 81.2 72.78 80.98 75.32 77.87C75.9252 76.4949 76.6905 75.1959 77.6 74C79.044 72.093 80.7864 70.4316 82.76 69.08C74.47 66.82 62.76 67.19 55.68 71.73C53.7668 72.841 52.192 74.4517 51.1244 76.3895C50.0569 78.3274 49.5368 80.5192 49.62 82.73C49.62 86.3 52.42 91.94 56.19 92.82L54 97.07C51.5946 96.5129 49.4109 95.2487 47.73 93.44L44.48 97.58L41.23 96L44.41 87.68C43.8904 86.064 43.624 84.3774 43.62 82.68C43.628 81.3361 43.7687 79.9963 44.04 78.68C34.04 82.81 29.1 89.68 27.29 95.96C25.9 100.79 26.44 105.15 28.72 107.49C30.53 109.35 33.3 109.79 35.91 109.62L42.91 104.17L45.21 106.11L43.13 112.93C44.22 116.4 47.79 118.19 54.3 116.93C54.6375 114.169 55.7272 111.554 57.45 109.37C58.7133 107.552 60.3846 106.056 62.33 105L65.75 95.79L69.17 95.64L68.8 103.19C74.55 102.6 80.98 103.77 86.97 102.87L88.07 106.87C79.29 110.93 70.3 104.31 62.15 113.04C59.22 116.18 60.34 118.91 62.15 121.66C64.76 125.59 69.66 123.23 74.67 121.66C82.26 119.34 87.77 117.66 98.16 118.51C95.68 113.8 95.92 108.11 99.24 101.85L104.13 103.78C100.7 111.69 103.91 116.27 106.13 118.29C109.56 121.41 114.72 122.35 118.13 120.47C119.436 119.749 120.559 118.737 121.412 117.513C122.265 116.289 122.825 114.885 123.05 113.41C123.275 112.051 123.258 110.663 123 109.31H123.01Z" fill="white" />
  </svg>
);

const TrayNetworkIcon = () => (
  <svg version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 12 12" style={{ marginRight: "12px" }} width="16" height="16">
    <g>
      <path d="M1.324 0a0.66 0.66 0 0 0 -0.66 0.66v10.68c0 0.365 0.296 0.66 0.66 0.66s0.66 -0.296 0.66 -0.66V0.66a0.66 0.66 0 0 0 -0.66 -0.66" fill="white"/>
      <path d="M4.441 4.043a0.66 0.66 0 0 0 -0.66 0.66v6.637c0 0.365 0.296 0.66 0.66 0.66s0.66 -0.296 0.66 -0.66V4.703a0.66 0.66 0 0 0 -0.66 -0.66" fill="white"/>
      <path d="M7.559 7.361a0.66 0.66 0 0 0 -0.66 0.66v3.318c0 0.365 0.296 0.66 0.66 0.66s0.66 -0.296 0.66 -0.66v-3.318a0.66 0.66 0 0 0 -0.66 -0.66" fill="white"/>
      <path d="M10.676 9.646a0.66 0.66 0 0 0 -0.66 0.66v1.034c0 0.365 0.296 0.66 0.66 0.66s0.66 -0.296 0.66 -0.66v-1.034a0.66 0.66 0 0 0 -0.66 -0.66" fill="white"/>
    </g>
  </svg>
);

const TrayVolumeIcon = () => (
  <svg version="1.1" id="Uploaded to svgrepo.com" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="16" height="16" viewBox="0 0 0.48 0.48" xml:space="preserve" style={{ marginRight: "12px" }}>
    <path className="puchipuchi_een" d="M0.24 0.09v0.3c0 0.017 -0.012 0.023 -0.026 0.015l-0.099 -0.059C0.102 0.337 0.076 0.33 0.06 0.33H0.045c-0.017 0 -0.03 -0.013 -0.03 -0.03v-0.12c0 -0.017 0.013 -0.03 0.03 -0.03h0.015c0.017 0 0.042 -0.007 0.056 -0.015l0.099 -0.059C0.228 0.067 0.24 0.073 0.24 0.09m0.162 0.15 0.039 -0.039a0.03 0.03 0 1 0 -0.042 -0.042L0.36 0.198l-0.039 -0.039a0.03 0.03 0 1 0 -0.042 0.042L0.318 0.24l-0.039 0.039a0.03 0.03 0 1 0 0.042 0.042L0.36 0.282l0.039 0.039c0.006 0.006 0.014 0.009 0.021 0.009s0.015 -0.003 0.021 -0.009a0.03 0.03 0 0 0 0 -0.042z" fill="white" />
  </svg>
);

const OrangeSliceLogo = () => (
  <svg width="18" height="18" viewBox="0 0 512 512" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <g transform="rotate(45 256 256)">
      <path style={{ fill: "#F6E088" }} d="M256,380.198c137.186,0,248.396-111.21,248.396-248.396H7.604 C7.604,268.988,118.814,380.198,256,380.198z"/>
      <path style={{ fill: "#CF691C" }} d="M156.698,325.972c30.36,15.569,64.198,23.811,99.302,23.811c58.224,0,112.964-22.674,154.135-63.845 c41.171-41.171,63.845-95.911,63.845-154.135H38.02c0,58.224,22.674,112.964,63.845,154.135 c11.545,11.545,24.157,21.636,37.614,30.18"/>
      <path style={{ fill: "#491E17" }} d="M481.584,124.198H30.416H0v7.604c0,68.38,26.629,132.668,74.981,181.019 C123.332,361.173,187.62,387.802,256,387.802s132.667-26.629,181.019-74.981C485.371,264.47,512,200.182,512,131.802v-7.604H481.584 z M263.604,150.159l135.672,135.672c-37.199,34.662-84.858,54.403-135.672,56.197V150.159z M410.03,275.079l-10.751-10.751 c26.193-28.254,43.208-62.981,49.354-100.893l-15.012-2.433c-5.632,34.742-21.18,66.588-45.106,92.563L274.357,139.406h191.884 C464.45,190.222,444.693,237.879,410.03,275.079z M237.643,139.406L101.97,275.078c-34.663-37.199-54.42-84.857-56.213-135.672 H237.643z M426.266,302.068c-45.48,45.48-105.949,70.526-170.266,70.526s-124.786-25.046-170.266-70.526 c-43.683-43.683-68.517-101.192-70.41-162.662h15.231c1.889,57.405,25.121,111.099,65.931,151.908 c11.84,11.84,24.933,22.344,38.915,31.222l8.151-12.839c-10.926-6.937-21.262-14.954-30.829-23.868l135.672-135.67v191.873 c-31.088-1.074-60.735-8.729-88.228-22.828l-6.94,13.533c31.446,16.125,66.984,24.649,102.772,24.649 c60.256,0,116.905-23.465,159.512-66.072c40.81-40.809,64.043-94.503,65.931-151.908h15.231 C494.783,200.875,469.949,258.385,426.266,302.068z"/>
    </g>
  </svg>
);

const TASKBAR_COLORS: Record<string, string> = {
  teal: "#005a5a",
  navy: "#00005a",
  purple: "#3b0e5a",
  grey: "#404040",
  black: "#101010",
};

function Taskbar({
  windows,
  activeId,
  startOpen,
  onStartClick,
  onWindowClick,
  desktopColor,
}: {
  windows: Record<AppId, WinState>;
  activeId: AppId | null;
  startOpen: boolean;
  onStartClick: () => void;
  onWindowClick: (id: AppId) => void;
  desktopColor: string;
}) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const timeStr = time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const openWindows = (Object.entries(windows) as [AppId, WinState][]).filter(
    ([, s]) => s.isOpen
  );

  const themeBg = TASKBAR_COLORS[desktopColor] || "#005a5a";

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: "48px",
        background: themeBg,
        borderTop: "2px solid rgba(255,255,255,0.35)",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "0 6px",
        zIndex: 9999,
      }}
    >
      {/* Start button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onStartClick();
        }}
        style={{
          height: "34px",
          padding: "0 12px",
          fontSize: "13px",
          fontWeight: "bold",
          background: startOpen ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.18)",
          color: "white",
          border: "none",
          cursor: "default",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontFamily: SYS_FONT,
          boxShadow: startOpen
            ? "inset -1px -1px rgba(255,255,255,0.4), inset 1px 1px rgba(0,0,0,0.6), inset -2px -2px rgba(255,255,255,0.2), inset 2px 2px rgba(0,0,0,0.8)"
            : "inset -1px -1px rgba(0,0,0,0.6), inset 1px 1px rgba(255,255,255,0.4), inset -2px -2px rgba(0,0,0,0.4), inset 2px 2px rgba(255,255,255,0.2)",
        }}
      >
        <OrangeSliceLogo />
        Start
      </button>

      {/* Separator */}
      <div
        style={{
          width: "2px",
          height: "34px",
          background: "rgba(0,0,0,0.4)",
          borderRight: "1px solid rgba(255,255,255,0.2)",
          margin: "0 4px",
        }}
      />

      {/* Open window buttons */}
      <div style={{ display: "flex", gap: "4px", flex: 1, overflow: "hidden" }}>
        {openWindows.map(([id, state]) => {
          const isActive = !state.isMinimized && id === activeId;
          return (
            <button
              key={id}
              onClick={() => onWindowClick(id)}
              style={{
                height: "34px",
                padding: "0 12px",
                fontSize: "12px",
                maxWidth: "160px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                background: isActive ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.12)",
                color: "white",
                border: "none",
                cursor: "default",
                fontFamily: SYS_FONT,
                boxShadow: isActive
                  ? "inset -1px -1px rgba(255,255,255,0.4), inset 1px 1px rgba(0,0,0,0.6), inset -2px -2px rgba(255,255,255,0.2), inset 2px 2px rgba(0,0,0,0.8)"
                  : "inset -1px -1px rgba(0,0,0,0.6), inset 1px 1px rgba(255,255,255,0.4), inset -2px -2px rgba(0,0,0,0.4), inset 2px 2px rgba(255,255,255,0.2)",
              }}
            >
              {APP_LABELS[id]}
            </button>
          );
        })}
      </div>

      {/* System tray */}
      <div
        style={{
          height: "34px",
          padding: "0 10px",
          display: "flex",
          alignItems: "center",
          boxShadow: "inset 1px 1px rgba(0,0,0,0.6), inset -1px -1px rgba(255,255,255,0.4), inset 2px 2px rgba(0,0,0,0.4), inset -2px -2px rgba(255,255,255,0.2)",
          fontSize: "12px",
          fontFamily: SYS_FONT,
          whiteSpace: "nowrap",
          background: "rgba(0,0,0,0.15)",
          color: "white",
        }}
      >
        <TrayOrangeIcon />
        <TrayNetworkIcon />
        <TrayVolumeIcon />
        <div style={{ width: "1px", height: "20px", background: "rgba(0,0,0,0.4)", borderRight: "1px solid rgba(255,255,255,0.2)", margin: "0 10px 0 2px" }} />
        {timeStr}
      </div>
    </div>
  );
}

// ─── App Config ───────────────────────────────────────────────────────────────
const APP_CONFIG: Record<
  AppId,
  { title: string; width: number; height: number; x: number; y: number }
> = {
  journal: { title: "New Journal Entry — Mnema", width: 560, height: 490, x: 80, y: 40 },
  memories: { title: "Memories — Mnema", width: 610, height: 470, x: 130, y: 60 },
  chat: { title: "Chat", width: 470, height: 440, x: 220, y: 50 },
  profile: { title: "System Monitor", width: 430, height: 490, x: 170, y: 45 },
  settings: { title: "Mnema Settings", width: 400, height: 390, x: 150, y: 70 },
  help: { title: "Help & Support — Mnema", width: 500, height: 420, x: 100, y: 80 },
  goals: { title: "Time Machine — Future Life Goals", width: 500, height: 490, x: 200, y: 70 },
  terminal: { title: "mShell", width: 750, height: 520, x: 80, y: 60 },
  creator: { title: "The Creator — Keku", width: 520, height: 500, x: 140, y: 50 },
  paint: { title: "Paint — Mnema", width: 440, height: 490, x: 180, y: 60 },
};

const APP_CONTENT: Record<AppId, React.ReactNode> = {
  journal: <JournalApp />,
  memories: <MemoriesApp />,
  chat: <ChatApp />,
  profile: <ProfileApp />,
  settings: <SettingsApp />,
  help: <HelpApp />,
  goals: <div />,
  terminal: <div />,
  creator: <div />,
  paint: <div />,
};

// ─── Desktop Icons config ─────────────────────────────────────────────────────
const DESKTOP_ICONS: { key: string; id: AppId; icon: React.ComponentType<{ size?: number }>; label: string }[] = [
  { key: "journal", id: "journal", icon: IconJournal, label: "New Journal" },
  { key: "memories", id: "memories", icon: IconFolder, label: "Memories" },
  { key: "chat", id: "chat", icon: IconChat, label: "Chat" },
  { key: "profile", id: "profile", icon: IconProfile, label: "System Monitor" },
  { key: "settings", id: "settings", icon: IconSettings, label: "Settings" },
  { key: "help", id: "help", icon: IconHelp, label: "Help & Support" },
  { key: "goals", id: "goals", icon: IconTimeMachine, label: "Time Machine" },
  { key: "terminal", id: "terminal", icon: IconTerminal, label: "mShell" },
  { key: "paint", id: "paint", icon: IconPaint, label: "Paint" },
  { key: "recycle", id: "memories", icon: IconRecycle, label: "Recycle Bin" },
];

// ─── Main App ─────────────────────────────────────────────────────────────────
// ─── Login Window ─────────────────────────────────────────────────────────────
function LoginDialog() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
        localStorage.removeItem("mnema_help_opened");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      let friendlyMessage = err.message;
      if (err.code === "auth/invalid-credential") {
        friendlyMessage = "Invalid email or password.";
      } else if (err.code === "auth/weak-password") {
        friendlyMessage = "Password should be at least 6 characters.";
      } else if (err.code === "auth/email-already-in-use") {
        friendlyMessage = "An account already exists with this email.";
      }
      setError(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        width: "360px",
        background: "#c0c0c0",
        boxShadow:
          "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf, 3px 3px 0 #000000",
        fontFamily: SYS_FONT,
        display: "flex",
        flexDirection: "column",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Title Bar */}
      <div
        style={{
          background: "linear-gradient(to right, #000080, #1084d0)",
          padding: "3px 4px",
          display: "flex",
          alignItems: "center",
          userSelect: "none",
        }}
      >
        <span
          style={{
            color: "white",
            fontSize: "11px",
            fontWeight: "bold",
            flex: 1,
            fontFamily: SYS_FONT,
          }}
        >
          {isSignUp ? "Mnema98 — Sign Up" : "Enter Network Password"}
        </span>
      </div>

      {/* Content */}
      <form onSubmit={handleSubmit} style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {/* Retro Keys Icon */}
          <svg width="36" height="36" viewBox="0 0 32 32" style={{ imageRendering: "pixelated", flexShrink: 0 }}>
            <rect x="2" y="10" width="28" height="12" fill="#d0c090" stroke="#000" strokeWidth="1" />
            <circle cx="24" cy="16" r="4" fill="#ffffff" stroke="#000" strokeWidth="1" />
            <rect x="6" y="14" width="10" height="4" fill="#808080" stroke="#000" strokeWidth="0.5" />
            <rect x="8" y="18" width="2" height="2" fill="#808080" stroke="#000" strokeWidth="0.5" />
            <rect x="12" y="18" width="2" height="2" fill="#808080" stroke="#000" strokeWidth="0.5" />
          </svg>
          <div style={{ fontSize: "11px", color: "#000", flex: 1, lineHeight: "1.4" }}>
            {isSignUp
              ? "Create a new user account to log on to Mnema."
              : "Type your email address and password to log on to Mnema."}
          </div>
        </div>

        {/* Inputs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <label style={{ fontSize: "11px", width: "70px", textAlign: "right" }}>Email:</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@domain.com"
              required
              style={{ ...inputStyle({ flex: 1, height: "20px" }) }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <label style={{ fontSize: "11px", width: "70px", textAlign: "right" }}>Password:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ ...inputStyle({ flex: 1, height: "20px" }) }}
            />
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              color: "#a00000",
              fontSize: "11px",
              marginTop: "4px",
              padding: "4px",
              background: "#ffdddd",
              border: "1px solid #a00000",
              wordBreak: "break-word",
            }}
          >
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", marginTop: "12px" }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              background: "#c0c0c0",
              border: "none",
              cursor: "default",
              fontFamily: SYS_FONT,
              fontSize: "12px",
              padding: "3px 12px",
              minWidth: "75px",
              boxShadow: "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf",
            }}
          >
            {loading ? "..." : "OK"}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            style={{
              background: "#c0c0c0",
              border: "none",
              cursor: "default",
              fontFamily: SYS_FONT,
              fontSize: "12px",
              padding: "3px 12px",
              minWidth: "75px",
              boxShadow: "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf",
            }}
          >
            {isSignUp ? "Cancel" : "Sign Up"}
          </button>
        </div>
      </form>
    </div>
  );
}

const COLOR_MAP: Record<string, string> = {
  teal: "#008080",
  navy: "#000080",
  purple: "#5a189a",
  grey: "#555555",
  black: "#000000",
};

function RetroConfirmModal({
  message,
  subMessage,
  onConfirm,
  onCancel,
}: {
  message: string;
  subMessage?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 999999,
      }}
    >
      <div
        style={{
          width: "360px",
          background: "#c0c0c0",
          border: "2px solid",
          borderColor: "#fff #5a5a5a #5a5a5a #fff",
          boxShadow: "2px 2px 12px rgba(0,0,0,0.5)",
          fontFamily: SYS_FONT,
          fontSize: "12px",
          color: "#000",
        }}
      >
        {/* Title bar */}
        <div
          style={{
            background: "linear-gradient(90deg, #000080, #1084d0)",
            color: "#fff",
            padding: "3px 6px",
            fontWeight: "bold",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Confirm Action</span>
          <button
            onClick={onCancel}
            style={{
              background: "#c0c0c0",
              border: "1px solid",
              borderColor: "#fff #5a5a5a #5a5a5a #fff",
              padding: "0 4px",
              fontSize: "9px",
              cursor: "default",
              color: "#000",
              fontWeight: "bold",
            }}
          >
            ✕
          </button>
        </div>
        {/* Content */}
        <div style={{ padding: "20px", display: "flex", gap: "16px", alignItems: "flex-start" }}>
          {/* Warning Icon (Exclamation mark inside yellow triangle) */}
          <div style={{ flexShrink: 0 }}>
            <svg width="32" height="32" viewBox="0 0 32 32" style={{ imageRendering: "pixelated" }}>
              <polygon points="16,2 30,28 2,28" fill="#f1c40f" stroke="#000" strokeWidth="1.5" />
              <rect x="15" y="10" width="2" height="8" fill="#000" />
              <circle cx="16" cy="22" r="1.5" fill="#000" />
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: "bold", marginBottom: "8px", fontSize: "12px", lineHeight: "1.4" }}>{message}</div>
            {subMessage && <div style={{ color: "#555", fontSize: "11px", lineHeight: "1.3" }}>{subMessage}</div>}
          </div>
        </div>
        {/* Buttons */}
        <div style={{ padding: "0 20px 15px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button
            onClick={onConfirm}
            style={{
              width: "75px",
              padding: "4px",
              background: "#c0c0c0",
              border: "2px solid",
              borderColor: "#fff #5a5a5a #5a5a5a #fff",
              fontWeight: "bold",
              cursor: "default",
              outline: "none",
              fontFamily: SYS_FONT,
            }}
          >
            OK
          </button>
          <button
            onClick={onCancel}
            style={{
              width: "75px",
              padding: "4px",
              background: "#c0c0c0",
              border: "2px solid",
              borderColor: "#fff #5a5a5a #5a5a5a #fff",
              cursor: "default",
              outline: "none",
              fontFamily: SYS_FONT,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [selectedIconIndex, setSelectedIconIndex] = useState<number | null>(null);

  // Current session draft doodle
  const [currentDoodle, setCurrentDoodle] = useState<string | null>(null);

  // Retro confirmation modal state
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    subMessage?: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);

  const confirmCustom = (message: string, subMessage?: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmDialog({
        message,
        subMessage,
        onConfirm: () => {
          setConfirmDialog(null);
          resolve(true);
        },
        onCancel: () => {
          setConfirmDialog(null);
          resolve(false);
        },
      });
    });
  };

  // Icon Positions State
  const [iconPositions, setIconPositions] = useState<Record<string, { x: number; y: number }>>(() => {
    const defaultPositions = {
      journal: { x: 12, y: 12 },
      memories: { x: 96, y: 12 },
      chat: { x: 180, y: 12 },
      profile: { x: 264, y: 12 },
      settings: { x: 348, y: 12 },
      help: { x: 432, y: 12 },
      goals: { x: 516, y: 12 },
      terminal: { x: 600, y: 12 },
      paint: { x: 12, y: 104 },
      recycle: { x: 96, y: 104 },
    };

    const saved = localStorage.getItem("mnema_iconPositions");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          return { ...defaultPositions, ...parsed };
        }
      } catch (e) {
        console.error("Error loading icon positions:", e);
      }
    }
    return defaultPositions;
  });

  useEffect(() => {
    localStorage.setItem("mnema_iconPositions", JSON.stringify(iconPositions));
  }, [iconPositions]);

  // Global Settings States
  const [desktopColor, setDesktopColor] = useState(() => localStorage.getItem("mnema_desktopColor") || "teal");
  const [journalFont, setJournalFont] = useState(() => localStorage.getItem("mnema_journalFont") || "Special Elite");
  const [fontSize, setFontSize] = useState(() => localStorage.getItem("mnema_fontSize") || "medium");
  const [personality, setPersonality] = useState(() => localStorage.getItem("mnema_personality") || "friendly");
  const [screenSaver, setScreenSaver] = useState(() => localStorage.getItem("mnema_screenSaver") || "windows");
  const [iconSize, setIconSize] = useState(() => localStorage.getItem("mnema_iconSize") || "normal");
  const [screenSaverActive, setScreenSaverActive] = useState(false);
  const [desktopTextPreset, setDesktopTextPreset] = useState(() => localStorage.getItem("mnema_desktopTextPreset") || "mnema98");
  const [desktopText, setDesktopText] = useState(() => localStorage.getItem("mnema_desktopText") || "Mnema '98");

  useEffect(() => {
    localStorage.setItem("mnema_desktopColor", desktopColor);
  }, [desktopColor]);

  useEffect(() => {
    localStorage.setItem("mnema_journalFont", journalFont);
  }, [journalFont]);

  useEffect(() => {
    localStorage.setItem("mnema_fontSize", fontSize);
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem("mnema_personality", personality);
  }, [personality]);

  useEffect(() => {
    localStorage.setItem("mnema_screenSaver", screenSaver);
  }, [screenSaver]);

  useEffect(() => {
    localStorage.setItem("mnema_iconSize", iconSize);
  }, [iconSize]);

  useEffect(() => {
    localStorage.setItem("mnema_desktopTextPreset", desktopTextPreset);
  }, [desktopTextPreset]);

  useEffect(() => {
    localStorage.setItem("mnema_desktopText", desktopText);
  }, [desktopText]);

  const handleResetIconPositions = () => {
    localStorage.removeItem("mnema_iconPositions");
    setIconPositions({
      journal: { x: 12, y: 12 },
      memories: { x: 12, y: 116 },
      chat: { x: 12, y: 220 },
      profile: { x: 12, y: 324 },
      settings: { x: 12, y: 428 },
      help: { x: 12, y: 532 },
      goals: { x: 12, y: 636 },
      terminal: { x: 112, y: 12 },
      paint: { x: 112, y: 116 },
      recycle: { x: 112, y: 220 },
    });
    alert("Desktop icon grid positions restored to default!");
  };

  const handleResetAllSettings = async () => {
    const accepted = await confirmCustom("Are you sure you want to reset all desktop and app preferences to default?", "Your journal entries will NOT be touched.");
    if (!accepted) return;
    
    // Clear localStorage values
    localStorage.removeItem("mnema_desktopColor");
    localStorage.removeItem("mnema_journalFont");
    localStorage.removeItem("mnema_fontSize");
    localStorage.removeItem("mnema_personality");
    localStorage.removeItem("mnema_screenSaver");
    localStorage.removeItem("mnema_iconSize");
    localStorage.removeItem("mnema_desktopTextPreset");
    localStorage.removeItem("mnema_desktopText");
    localStorage.removeItem("mnema_iconPositions");

    // Reset parent states
    setDesktopColor("teal");
    setJournalFont("Special Elite");
    setFontSize("medium");
    setPersonality("friendly");
    setScreenSaver("windows");
    setIconSize("normal");
    setDesktopTextPreset("mnema98");
    setDesktopText("Mnema '98");
    setIconPositions({
      journal: { x: 12, y: 12 },
      memories: { x: 12, y: 92 },
      chat: { x: 12, y: 172 },
      profile: { x: 12, y: 252 },
      settings: { x: 12, y: 332 },
      help: { x: 12, y: 412 },
      goals: { x: 12, y: 492 },
      terminal: { x: 12, y: 572 },
      recycle: { x: 12, y: 652 },
    });

    alert("All system preferences and settings have been restored to defaults!");
  };

  const [recycleJoke, setRecycleJoke] = useState<string | null>(null);

  const recycleJokes = [
    "Recycle Bin is empty. Your memories are too precious to throw away!",
    "Error 0x004D6E656D61: Cannot delete memories. They are write-protected by your heart.",
    "This action requires 640KB of RAM. That should be enough for anybody.",
    "Are you sure you want to empty the Recycle Bin? Just kidding, we'd never let you do that.",
    "The Recycle Bin has achieved sentience and refuses to open. Please try again in 1999.",
    "You can't recycle memories. Trust us, we tried.",
    "Nothing here. Mnema remembers everything — even the things you wish it didn't.",
    "Recycle Bin Status: 0 items. Mnemosyne, goddess of memory, does not forget.",
    "This program has performed an illegal operation and will be shut down. Just kidding. But seriously, the bin is empty.",
    "Defragmenting emotional baggage... 0% complete. Estimated time: ∞",
    "Please insert a floppy disk in drive A: to delete files.",
    "Cannot delete 'regrets.dll'. Access is denied by future opportunities.",
    "Recycle Bin contains: 0 bytes. Emotional baggage detected but could not be compressed.",
    "Your trash has been successfully converted into nostalgia. It cannot be deleted.",
    "Windows was unable to empty the Recycle Bin. Please reboot your brain and try again."
  ];

  const triggerRecycleJoke = () => {
    const randomIdx = Math.floor(Math.random() * recycleJokes.length);
    setRecycleJoke(recycleJokes[randomIdx]);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // Open Help window by default for new users / first-time login
  useEffect(() => {
    if (user) {
      const hasOpenedHelp = localStorage.getItem("mnema_help_opened") === "true";
      if (!hasOpenedHelp) {
        setWindows((prev) => ({
          ...prev,
          help: { ...prev.help, isOpen: true, zIndex: 12 },
        }));
        setActiveId("help");
        localStorage.setItem("mnema_help_opened", "true");
      }
    }
  }, [user]);

  // Screensaver Inactivity Watcher (1 min timeout)
  useEffect(() => {
    if (screenSaver === "none" || screenSaverActive) return;

    let timer: NodeJS.Timeout;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setScreenSaverActive(true);
      }, 60000);
    };

    const events = ["mousemove", "mousedown", "keypress", "scroll", "touchstart"];
    events.forEach((name) => document.addEventListener(name, resetTimer));

    resetTimer();

    return () => {
      clearTimeout(timer);
      events.forEach((name) => document.removeEventListener(name, resetTimer));
    };
  }, [screenSaver, screenSaverActive]);

  // Screensaver Deactivation Watcher
  useEffect(() => {
    if (!screenSaverActive) return;

    const deactivate = () => {
      setScreenSaverActive(false);
    };

    const events = ["mousemove", "mousedown", "keypress", "touchstart"];
    const delayTimer = setTimeout(() => {
      events.forEach((name) => document.addEventListener(name, deactivate));
    }, 500);

    return () => {
      clearTimeout(delayTimer);
      events.forEach((name) => document.removeEventListener(name, deactivate));
    };
  }, [screenSaverActive]);

  const [windows, setWindows] = useState<Record<AppId, WinState>>(() => {
    const w = {} as Record<AppId, WinState>;
    (Object.entries(APP_CONFIG) as [AppId, (typeof APP_CONFIG)[AppId]][]).forEach(([id, cfg]) => {
      w[id] = {
        isOpen: false,
        isMinimized: false,
        x: cfg.x,
        y: cfg.y,
        width: cfg.width,
        height: cfg.height,
        zIndex: 1,
      };
    });
    return w;
  });

  const [nextZ, setNextZ] = useState(10);
  const [activeId, setActiveId] = useState<AppId | null>(null);
  const [startOpen, setStartOpen] = useState(false);

  const dragRef = useRef<{
    active: boolean;
    winId: AppId | null;
    startMX: number;
    startMY: number;
    startWX: number;
    startWY: number;
  }>({ active: false, winId: null, startMX: 0, startMY: 0, startWX: 0, startWY: 0 });

  const resizeRef = useRef<{
    active: boolean;
    winId: AppId | null;
    dir: "r" | "b" | "se";
    startMX: number;
    startMY: number;
    startWidth: number;
    startHeight: number;
  }>({ active: false, winId: null, dir: "se", startMX: 0, startMY: 0, startWidth: 0, startHeight: 0 });

  const iconDragRef = useRef<{
    active: boolean;
    key: string | null;
    startMX: number;
    startMY: number;
    startIX: number;
    startIY: number;
  }>({ active: false, key: null, startMX: 0, startMY: 0, startIX: 0, startIY: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragRef.current.active && dragRef.current.winId) {
        const dx = e.clientX - dragRef.current.startMX;
        const dy = e.clientY - dragRef.current.startMY;
        const id = dragRef.current.winId;
        setWindows((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            x: Math.max(0, dragRef.current.startWX + dx),
            y: Math.max(0, dragRef.current.startWY + dy),
          },
        }));
      } else if (resizeRef.current.active && resizeRef.current.winId) {
        const dx = e.clientX - resizeRef.current.startMX;
        const dy = e.clientY - resizeRef.current.startMY;
        const id = resizeRef.current.winId;
        const dir = resizeRef.current.dir;

        setWindows((prev) => {
          const win = prev[id];
          let nextWidth = win.width;
          let nextHeight = win.height;

          if (dir === "r" || dir === "se") {
            nextWidth = Math.max(250, resizeRef.current.startWidth + dx);
          }
          if (dir === "b" || dir === "se") {
            nextHeight = Math.max(200, resizeRef.current.startHeight + dy);
          }

          return {
            ...prev,
            [id]: {
              ...win,
              width: nextWidth,
              height: nextHeight,
            },
          };
        });
      } else if (iconDragRef.current.active && iconDragRef.current.key) {
        const dx = e.clientX - iconDragRef.current.startMX;
        const dy = e.clientY - iconDragRef.current.startMY;
        const key = iconDragRef.current.key;
        setIconPositions((prev) => ({
          ...prev,
          [key]: {
            x: Math.max(0, iconDragRef.current.startIX + dx),
            y: Math.max(0, iconDragRef.current.startIY + dy),
          },
        }));
      }
    };

    const onUp = () => {
      dragRef.current.active = false;
      resizeRef.current.active = false;
      iconDragRef.current.active = false;
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  const bringToFront = useCallback((id: AppId) => {
    setNextZ((z) => {
      const nz = z + 1;
      setWindows((prev) => ({ ...prev, [id]: { ...prev[id], zIndex: nz } }));
      return nz;
    });
    setActiveId(id);
  }, []);

  const openWindow = useCallback(
    (id: AppId) => {
      setWindows((prev) => ({ ...prev, [id]: { ...prev[id], isOpen: true, isMinimized: false } }));
      bringToFront(id);
    },
    [bringToFront]
  );

  const closeWindow = (id: AppId) => {
    setWindows((prev) => ({ ...prev, [id]: { ...prev[id], isOpen: false } }));
    if (activeId === id) setActiveId(null);
  };

  const minimizeWindow = (id: AppId) => {
    setWindows((prev) => ({ ...prev, [id]: { ...prev[id], isMinimized: true } }));
    if (activeId === id) setActiveId(null);
  };

  const handleDragStart = (e: React.MouseEvent, id: AppId) => {
    e.preventDefault();
    dragRef.current = {
      active: true,
      winId: id,
      startMX: e.clientX,
      startMY: e.clientY,
      startWX: windows[id].x,
      startWY: windows[id].y,
    };
    bringToFront(id);
  };

  const handleResizeStart = (e: React.MouseEvent, id: AppId, dir: "r" | "b" | "se") => {
    e.preventDefault();
    resizeRef.current = {
      active: true,
      winId: id,
      dir,
      startMX: e.clientX,
      startMY: e.clientY,
      startWidth: windows[id].width,
      startHeight: windows[id].height,
    };
    bringToFront(id);
  };

  const handleIconDragStart = (e: React.MouseEvent, key: string) => {
    if (e.button !== 0) return; // Left click only
    const pos = iconPositions[key] || { x: 12, y: 12 };
    iconDragRef.current = {
      active: true,
      key,
      startMX: e.clientX,
      startMY: e.clientY,
      startIX: pos.x,
      startIY: pos.y,
    };
  };

  const handleFocus = (id: AppId) => {
    bringToFront(id);
  };

  const handleTaskbarClick = (id: AppId) => {
    if (windows[id].isMinimized) {
      setWindows((prev) => ({ ...prev, [id]: { ...prev[id], isMinimized: false } }));
      bringToFront(id);
    } else if (activeId === id) {
      minimizeWindow(id);
    } else {
      bringToFront(id);
    }
  };

  const renderAppContent = (id: AppId) => {
    switch (id) {
      case "journal":
        return (
          <JournalApp
            user={user}
            journalFont={journalFont}
            fontSize={fontSize}
            currentDoodle={currentDoodle}
            setCurrentDoodle={setCurrentDoodle}
            onOpenPaint={() => openWindow("paint")}
            onClose={() => closeWindow("journal")}
          />
        );
      case "memories":
        return <MemoriesApp user={user} confirmCustom={confirmCustom} />;
      case "chat":
        return <ChatApp user={user} personality={personality} />;
      case "profile":
        return <ProfileApp user={user} />;
      case "help":
        return <HelpApp onClose={() => closeWindow("help")} />;
      case "goals":
        return <TimeMachineApp user={user} />;
      case "terminal":
        return <TerminalApp onClose={() => closeWindow("terminal")} onShutDown={() => signOut(auth)} onOpenCreator={() => openWindow("creator")} onOpenJournal={() => openWindow("journal")} />;
      case "creator":
        return <CreatorApp />;
      case "paint":
        return (
          <PaintApp
            currentDoodle={currentDoodle}
            setCurrentDoodle={setCurrentDoodle}
            onClose={() => closeWindow("paint")}
          />
        );
      case "settings":
        return (
          <SettingsApp
            desktopColor={desktopColor}
            setDesktopColor={setDesktopColor}
            journalFont={journalFont}
            setJournalFont={setJournalFont}
            fontSize={fontSize}
            setFontSize={setFontSize}
            personality={personality}
            setPersonality={setPersonality}
            screenSaver={screenSaver}
            setScreenSaver={setScreenSaver}
            iconSize={iconSize}
            setIconSize={setIconSize}
            setScreenSaverActive={setScreenSaverActive}
            desktopText={desktopText}
            setDesktopText={setDesktopText}
            desktopTextPreset={desktopTextPreset}
            setDesktopTextPreset={setDesktopTextPreset}
            onResetIconPositions={handleResetIconPositions}
            onResetAllSettings={handleResetAllSettings}
            confirmCustom={confirmCustom}
            user={user}
            onClose={() => closeWindow("settings")}
          />
        );
      default:
        return null;
    }
  };

  if (loadingAuth) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          background: COLOR_MAP[desktopColor] || "#008080",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontFamily: SYS_FONT,
          fontSize: "14px",
          userSelect: "none",
        }}
      >
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
          {/* Hourglass retro animation */}
          <div style={{ fontSize: "24px" }}>⏳</div>
          <div>Loading Mnema 98...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          background: COLOR_MAP[desktopColor] || "#008080",
          position: "relative",
          fontFamily: SYS_FONT,
          userSelect: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <LoginDialog />
      </div>
    );
  }

  return (
    <div
      onClick={() => {
        setStartOpen(false);
        setSelectedIconIndex(null);
      }}
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: COLOR_MAP[desktopColor] || "#008080",
        position: "relative",
        fontFamily: SYS_FONT,
        userSelect: "none",
      }}
    >
      {/* Centered Desktop Wallpaper Text */}
      {desktopText && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            fontSize: "64px",
            fontWeight: "bold",
            fontFamily: SYS_FONT,
            color: "rgba(0, 0, 0, 0.18)",
            textShadow: "1px 1px 0 rgba(255, 255, 255, 0.12)",
            pointerEvents: "none",
            userSelect: "none",
            textAlign: "center",
            zIndex: 1,
            maxWidth: "90vw",
            wordBreak: "break-word",
          }}
        >
          {desktopText}
        </div>
      )}

      {/* Desktop icons */}
      {DESKTOP_ICONS.map((di, i) => {
        const col = Math.floor(i / 7);
        const row = i % 7;
        const defaultX = 12 + col * 100;
        const defaultY = 12 + row * 104;
        const pos = iconPositions[di.key] || { x: defaultX, y: defaultY };
        return (
          <div
            key={di.key}
            onMouseDown={(e) => handleIconDragStart(e, di.key)}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: pos.x,
              top: pos.y,
              zIndex: 5,
            }}
          >
            <DesktopIcon
              icon={di.icon}
              label={di.label}
              selected={selectedIconIndex === i}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedIconIndex(i);
              }}
              onDoubleClick={() => {
                if (di.key === "recycle") {
                  triggerRecycleJoke();
                } else {
                  openWindow(di.id);
                }
              }}
              size={iconSize}
            />
          </div>
        );
      })}

      {/* Windows */}
      {(Object.entries(windows) as [AppId, WinState][]).map(([id, state]) => (
        <Win95Window
          key={id}
          id={id}
          title={APP_CONFIG[id].title}
          state={state}
          isActive={activeId === id}
          onClose={() => closeWindow(id)}
          onMinimize={() => minimizeWindow(id)}
          onFocus={() => handleFocus(id)}
          onDragStart={(e) => handleDragStart(e, id)}
          onResizeStart={(e, dir) => handleResizeStart(e, id, dir)}
        >
          {renderAppContent(id)}
        </Win95Window>
      ))}

      {/* Start menu */}
      {startOpen && (
        <StartMenu
          onOpenApp={openWindow}
          onClose={() => setStartOpen(false)}
          onShutDown={() => {
            signOut(auth);
            setStartOpen(false);
          }}
        />
      )}

      {/* Taskbar */}
      <Taskbar
        windows={windows}
        activeId={activeId}
        startOpen={startOpen}
        onStartClick={() => setStartOpen((s) => !s)}
        onWindowClick={handleTaskbarClick}
        desktopColor={desktopColor}
      />

      {/* Screen Saver overlay */}
      {screenSaverActive && screenSaver !== "none" && (
        <ScreenSaver type={screenSaver} />
      )}

      {/* Recycle Bin Dialog Overlay */}
      {recycleJoke && (
        <div
          onClick={() => setRecycleJoke(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.15)",
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "320px",
              background: "#c0c0c0",
              boxShadow:
                "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf, 3px 3px 0 #000000",
              fontFamily: SYS_FONT,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Title Bar */}
            <div
              style={{
                background: "linear-gradient(to right, #000080, #1084d0)",
                padding: "3px 4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                color: "white",
                fontSize: "11px",
                fontWeight: "bold",
              }}
            >
              <span>Recycle Bin</span>
              <TitleBtn label="✕" onClick={() => setRecycleJoke(null)} />
            </div>

            {/* Warning Content */}
            <div style={{ display: "flex", gap: "12px", padding: "16px", alignItems: "center" }}>
              <span style={{ fontSize: "24px", userSelect: "none" }}>⚠️</span>
              <div style={{ fontSize: "12px", color: "black", lineHeight: "1.4", flex: 1, wordBreak: "break-word" }}>
                {recycleJoke}
              </div>
            </div>

            {/* Close Button */}
            <div style={{ display: "flex", justifyContent: "center", paddingBottom: "12px" }}>
              <W95Btn onClick={() => setRecycleJoke(null)} style={{ minWidth: "65px", fontWeight: "bold" }}>
                OK
              </W95Btn>
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <RetroConfirmModal
          message={confirmDialog.message}
          subMessage={confirmDialog.subMessage}
          onConfirm={confirmDialog.onConfirm}
          onCancel={confirmDialog.onCancel}
        />
      )}
    </div>
  );
}
