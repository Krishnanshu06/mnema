import os
import re
from datetime import datetime, timedelta
import firebase_admin
from firebase_admin import credentials, firestore
import google.generativeai as genai

import json

# 1. Initialize Firebase Admin SDK
# This checks if an instance is already initialized (important for FastAPI auto-reload)
if not firebase_admin._apps:
    # First, try to load credentials from the environment variable (production)
    firebase_creds_json = os.getenv("FIREBASE_CREDENTIALS")
    if firebase_creds_json:
        try:
            creds_dict = json.loads(firebase_creds_json)
            cred = credentials.Certificate(creds_dict)
        except Exception as e:
            raise ValueError(f"Failed to parse FIREBASE_CREDENTIALS environment variable: {str(e)}")
    else:
        # Fallback to local file for development
        cred = credentials.Certificate("service-account.json")
        
    firebase_admin.initialize_app(cred)

db = firestore.client()

# 2. Define Model Names
EMBEDDING_MODEL = "models/gemini-embedding-2"
GENERATIVE_MODEL = "models/gemini-2.5-flash"


# 3. Text Processing Utilities

def getSentences(longStr: str) -> list[str]:
    """Splits a long string into individual sentences using a simple regular expression."""
    sentences = re.split(r'(?<=[.!?])\s+', longStr.replace("\n", " ").strip())
    return [s.strip() for s in sentences if s.strip()]


def createDataDict(text: str, mood: int, custom_date: str = None) -> dict:
    """Formats raw entry inputs into a structured journal dictionary."""
    if custom_date:
        try:
            # Parse frontend format YYYY-MM-DD
            dt = datetime.strptime(custom_date, "%Y-%m-%d")
            date = dt.strftime('%d/%m/%Y')
        except ValueError:
            date = custom_date
    else:
        date = datetime.today().strftime('%d/%m/%Y')
    data = text.replace("\n", " ").strip()
    charCount = len(data)
    return {"date": date, "charCount": charCount, "mood": mood, "data": data}


def makeChunks(journalData: dict, maxChar: int = 1000) -> list[dict]:
    """Splits long entries into smaller semantic chunks to improve search accuracy."""
    journals = journalData
    output = []

    if journals['charCount'] >= maxChar:
        sentences = getSentences(journals["data"])
        combined_sentences = []
        sum_char_count = 0
        for sentence in sentences:
            if sum_char_count + len(sentence) < maxChar:
                sum_char_count += len(sentence)
                combined_sentences.append(sentence)
            else:
                combined_text = " ".join(combined_sentences)
                output.append({
                    "date": journals["date"],
                    "charCount": len(combined_text),
                    "mood": journals['mood'],
                    "data": f'On {journals["date"]}: {combined_text}'
                })
                combined_sentences = [sentence]
                sum_char_count = len(sentence)
            
        if combined_sentences:
            combined_text = " ".join(combined_sentences)
            output.append({
                "date": journals["date"],
                "charCount": len(combined_text),
                "mood": journals['mood'],
                "data": f'On {journals["date"]}: {combined_text}'
            })
    else:
        output.append({
            "date": journals["date"],
            "charCount": journals["charCount"],
            "mood": journals['mood'],
            "data": f'On {journals["date"]}: {journals["data"]}'
        })
 
    return output


# 4. Gemini API Integrations

def getEmbedding(text: str) -> list[float]:
    """Generates a 768-dimensional vector embedding for a given text using Gemini."""
    result = genai.embed_content(
        model=EMBEDDING_MODEL,
        content=text,
        task_type="retrieval_document"
    )
    return result["embedding"]


# 5. Database Firestore Operations

def ChunksToDB(chunks: list[dict], userID: str):
    """Saves journal chunks and their vector embeddings to the user's subcollection in Firestore."""
    user_journals_ref = db.collection("users").document(userID).collection("journals")
    
    for chunk in chunks:
        # Generate the embedding vector via Gemini API
        vector = getEmbedding(chunk["data"])
        
        entry = {
            "date": chunk["date"],
            "mood": chunk["mood"],
            "data": chunk["data"],
            "charCount": chunk["charCount"],
            "embedding": vector,
            "createdAt": firestore.SERVER_TIMESTAMP
        }
        user_journals_ref.add(entry)


def GetTopChunks(query: str, userID: str, noResults: int = 5) -> tuple[str, list[dict]]:
    """Retrieves relevant chunks by generating a query vector and performing in-memory cosine similarity."""
    # Query expansion for relative dates
    expanded_query = query
    today = datetime.today()
    if "yesterday" in query.lower():
        yesterday = today - timedelta(days=1)
        expanded_query += f" {yesterday.strftime('%d/%m/%Y')}"
    elif "today" in query.lower():
        expanded_query += f" {today.strftime('%d/%m/%Y')}"

    # 1. Generate query embedding vector
    query_result = genai.embed_content(
        model=EMBEDDING_MODEL,
        content=expanded_query,
        task_type="retrieval_query"
    )
    query_vector = query_result["embedding"]

    # 2. Get all journals for this user from Firestore
    journals_ref = db.collection("users").document(userID).collection("journals")
    docs = journals_ref.stream()

    matches = []
    for doc in docs:
        data = doc.to_dict()
        if "embedding" in data and "data" in data:
            doc_vector = data["embedding"]
            
            # Since Gemini's embeddings are normalized (L2 norm = 1),
            # the dot product is mathematically equivalent to cosine similarity.
            score = sum(q * d for q, d in zip(query_vector, doc_vector))
            matches.append((score, data))
            
    if not matches:
        return "No memories found.", []

    # 3. Sort by similarity score descending
    matches.sort(key=lambda x: x[0], reverse=True)
    top_matches = matches[:noResults]
    
    formatted_context = " \n".join([item[1]["data"] for item in top_matches])
    raw_chunks = [{
        "date": item[1].get("date"),
        "mood": item[1].get("mood"),
        "data": item[1].get("data")
    } for item in top_matches]
    
    return formatted_context, raw_chunks


def GetDatedChunks(date_list: list[str], userID: str) -> tuple[str, list[dict]]:
    """Retrieves chunks written on specific dates."""
    journals_ref = db.collection("users").document(userID).collection("journals")
    query = journals_ref.where("date", "in", date_list).stream()
    
    matches = []
    raw_chunks = []
    for doc in query:
        data = doc.to_dict()
        if "data" in data:
            matches.append(data["data"])
            raw_chunks.append({
                "date": data.get("date"),
                "mood": data.get("mood"),
                "data": data.get("data")
            })
            
    if not matches:
        return "No memories found for these dates.", []
        
    return " \n".join(matches), raw_chunks


# 6. RAG Prompting & Generation

def getGeneration(query: str, retrieved_context: str, personality: str = None) -> str:
    """Sends the context and question to Gemini to generate the RAG response with custom personality."""
    today_str = datetime.today().strftime('%A, %B %d, %Y')
    
    # Map personalities to instruction snippets
    p_instr = "Answer the question as if you are my diary assistant, speaking directly to me."
    if personality == "clinical":
        p_instr = "Respond in a highly objective, clinical, structured, and analytical tone. Analyze the emotional patterns objectively."
    elif personality == "poetic":
        p_instr = "Respond in a warm, poetic, nostalgic, and deeply reflective tone. Emphasize sensory details and paint a vivid picture of the past."
    elif personality == "terse":
        p_instr = "Respond in an extremely brief, direct, and concise tone. Keep your answer strictly to 1 or 2 short sentences."
    elif personality == "friendly":
        p_instr = "Respond in a warm, friendly, empathetic, and encouraging tone, as if talking to a close friend."

    prompt = (
        f"You are Mnema, a reflective memory companion. You have access to my diary logs below.\n"
        f"Today's date is {today_str}.\n"
        f"Use the current date to reason about relative times (like yesterday, last week, etc.) when interpreting questions and logs.\n\n"
        f"Context:\n{retrieved_context}\n\n"
        f"Question: {query}\n\n"
        f"Instructions: {p_instr} "
        f"If the context doesn't contain the answer, tell me gently that you couldn't find any memories about it."
    )
    
    model = genai.GenerativeModel(GENERATIVE_MODEL)
    response = model.generate_content(prompt)
    return response.text.strip()


# 7. High-Level Core Functions

def TakeJournal(text: str, mood: int, userID: str, custom_date: str = None):
    """Processes a raw entry text and pushes chunks to the DB."""
    print(f"DEBUG METHODS: custom_date received={custom_date}")
    data_dict = createDataDict(text, mood, custom_date)
    chunks = makeChunks(data_dict)
    ChunksToDB(chunks, userID)


def ExtractGoalsFromText(text: str) -> list[str]:
    """Uses Gemini to parse user's vision statement and return 3-7 clear, bulleted goals."""
    if not text.strip():
        return []
    prompt = (
        "You are an AI cognitive analyst. Read the following personal statement about the user's future goals and dreams:\n"
        f"\"{text}\"\n\n"
        "Extract a clear, concise list of 3-7 key life goals, target achievements, or core aspirations mentioned in the text. "
        "Respond ONLY with a JSON array of strings, for example: [\"Become a senior software engineer\", \"Run a marathon\", \"Learn to speak French\"]. "
        "Do not include markdown wrappers like ```json or any other text outside the JSON array."
    )
    try:
        model = genai.GenerativeModel(GENERATIVE_MODEL)
        response = model.generate_content(prompt)
        # Clean and parse JSON response
        clean_text = re.sub(r'```json|```', '', response.text).strip()
        parsed = json.loads(clean_text)
        if isinstance(parsed, list):
            return [str(g) for g in parsed]
    except Exception as e:
        print(f"Error extracting goals: {str(e)}")
        # Fallback simple bullet list extraction if JSON parsing fails
        try:
            lines = [line.strip("- *•").strip() for line in response.text.split("\n") if line.strip()]
            return [l for l in lines if l][:7]
        except Exception:
            pass
    return []


def GetTimeMachineContext(userID: str) -> str:
    """Retrieves user's future goals from the Time Machine settings document."""
    try:
        doc_ref = db.collection("users").document(userID).collection("settings").document("timemachine")
        doc = doc_ref.get()
        if doc.exists:
            data = doc.to_dict()
            goals = data.get("extractedGoals", [])
            raw_text = data.get("text", "")
            if goals:
                goals_list = "\n".join([f"- {g}" for g in goals])
                return f"\n--- User's Future Goals (from Time Machine) ---\n{goals_list}\nRaw Vision Statement: {raw_text}\n"
    except Exception as e:
        print(f"Error fetching Time Machine context: {str(e)}")
    return ""


def GenerateFromQuery(query: str, userID: str, personality: str = None) -> tuple[str, list[dict]]:
    """Given a query, retrieves top context and returns a RAG response."""
    top_chunks_str, raw_chunks = GetTopChunks(query, userID)
    
    # Check for $Goals token (case-insensitive)
    if "$goals" in query.lower():
        time_machine_context = GetTimeMachineContext(userID)
        top_chunks_str = time_machine_context + "\n" + top_chunks_str

    response_text = getGeneration(query, top_chunks_str, personality)
    return response_text, raw_chunks


def GenerateFromDate(date_range: list[str], query: str, userID: str, personality: str = None) -> tuple[str, list[dict]]:
    """Given a query and date filter, retrieves matching logs and returns a RAG response."""
    dated_chunks_str, raw_chunks = GetDatedChunks(date_range, userID)
    
    # Check for $Goals token (case-insensitive)
    if "$goals" in query.lower():
        time_machine_context = GetTimeMachineContext(userID)
        dated_chunks_str = time_machine_context + "\n" + dated_chunks_str

    response_text = getGeneration(query, dated_chunks_str, personality)
    return response_text, raw_chunks
