import os
from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from firebase_admin import auth as firebase_auth
import google.generativeai as genai
from dotenv import load_dotenv

# 1. Load settings
load_dotenv()

# Import our custom RAG methods
import methods
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("GEMINI_API_KEY is missing from the .env file!")
genai.configure(api_key=api_key)

# 2. Create the FastAPI app
app = FastAPI(title="Mnema 98 API Server")

# 3. Enable CORS
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 4. Request Schemas (Pydantic Models)

class JournalRequest(BaseModel):
    text: str
    mood: int
    date: str = None  # Optional custom date (YYYY-MM-DD)

class ChatRequest(BaseModel):
    query: str
    dateRange: list[str] = None  # Optional: For date-specific queries
    personality: str = None      # Optional: custom AI agent personality

class GoalsRequest(BaseModel):
    text: str


# 5. Firebase Token Verification Dependency
# This function intercepts incoming requests, reads the "Authorization" header,
# verifies the token with Firebase, and extracts the unique User ID (UID).

def get_current_user_id(authorization: str = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header. Expected 'Bearer <token>'"
        )
    
    token = authorization.split("Bearer ")[1]
    try:
        # Verify the JWT token signature against Firebase Auth servers
        decoded_token = firebase_auth.verify_id_token(token)
        return decoded_token["uid"]
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail=f"Unauthorized: Invalid Firebase token. {str(e)}"
        )


# 6. API Endpoints

@app.get("/")
def read_root():
    return {"status": "online", "message": "Mnema 98 API is running!"}


@app.post("/api/journals")
def save_journal(request: JournalRequest, uid: str = Depends(get_current_user_id)):
    """Receives journal input, chunks it, generates embeddings, and saves it in Firestore."""
    try:
        print(f"DEBUG API: text={request.text[:40]}..., mood={request.mood}, date={request.date}")
        methods.TakeJournal(request.text, request.mood, uid, request.date)
        return {"status": "success", "message": "Journal saved and indexed."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat")
def chat_with_mnema(request: ChatRequest, uid: str = Depends(get_current_user_id)):
    """Retrieves relevant diary context (semantic or date-filtered) and calls Gemini for RAG response."""
    try:
        # If user provided a date filter, retrieve context by date.
        # Otherwise, perform similarity search.
        if request.dateRange:
            response_text, references = methods.GenerateFromDate(request.dateRange, request.query, uid, request.personality)
        else:
            response_text, references = methods.GenerateFromQuery(request.query, uid, request.personality)
            
        return {"response": response_text, "references": references}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/goals")
def save_goals(request: GoalsRequest, uid: str = Depends(get_current_user_id)):
    """Receives natural language goals text, extracts concrete goals, and saves to Firestore."""
    try:
        goals = methods.ExtractGoalsFromText(request.text)
        # Store in Firestore
        doc_ref = methods.db.collection("users").document(uid).collection("settings").document("timemachine")
        doc_ref.set({
            "text": request.text,
            "extractedGoals": goals,
            "updatedAt": methods.firestore.SERVER_TIMESTAMP
        })
        return {"status": "success", "goals": goals}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/goals")
def get_goals(uid: str = Depends(get_current_user_id)):
    """Retrieves the user's saved goals text and extracted goals."""
    try:
        doc_ref = methods.db.collection("users").document(uid).collection("settings").document("timemachine")
        doc = doc_ref.get()
        if doc.exists:
            return doc.to_dict()
        return {"text": "", "extractedGoals": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Debug routes
@app.get("/list-models")
def list_models():
    try:
        available_models = []
        for m in genai.list_models():
            available_models.append({
                "name": m.name,
                "description": m.description,
                "supported_methods": m.supported_generation_methods
            })
        return {"models": available_models}
    except Exception as e:
        return {"error": str(e)}
