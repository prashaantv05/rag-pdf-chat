import os
import shutil
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import rag
import database

app = FastAPI(title="DocMind AI Backend")

# Enable CORS for React + Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Resolve upload directory relative to this file
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    pdf_name: str
    query: str
    username: str
    history: list[ChatMessage] = []

class AuthRequest(BaseModel):
    username: str
    password: str

@app.post("/register")
async def register(request: AuthRequest):
    """Registers a new user inside the SQLite database."""
    username_clean = request.username.strip()
    if not username_clean or not request.password:
        raise HTTPException(status_code=400, detail="Username and password cannot be empty.")
    
    success = database.register_user(username_clean, request.password)
    if not success:
        raise HTTPException(status_code=400, detail="Username is already taken.")
        
    return {"status": "success", "message": "Registered successfully."}

@app.post("/login")
async def login(request: AuthRequest):
    """Verifies user credentials against database hash records."""
    username_clean = request.username.strip()
    valid = database.verify_user(username_clean, request.password)
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid username or password.")
        
    return {
        "status": "success", 
        "message": "Logged in successfully.",
        "username": username_clean.lower()
    }

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...), username: str = Form(...)):
    """
    Saves the uploaded PDF file to a user-specific namespaced folder and starts the embedding process.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    
    # Namespace uploads directory by username
    user_upload_dir = os.path.join(UPLOAD_DIR, username.strip().lower())
    os.makedirs(user_upload_dir, exist_ok=True)
    
    file_path = os.path.join(user_upload_dir, file.filename)
    
    try:
        # Save the uploaded file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        print(f"File saved to {file_path} for user {username}. Processing...")
        
        # Process the PDF namespaced under username
        pdf_name = rag.process_pdf(file_path, username.strip().lower())
        
        return {
            "status": "success",
            "message": "PDF processed and indexed successfully.",
            "pdf_name": pdf_name,
            "filename": file.filename
        }
    except Exception as e:
        print(f"Error during upload/processing: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")

@app.post("/chat")
async def chat_with_pdf(request: ChatRequest):
    """
    Takes the PDF name, user query, history, and username, 
    retrieves context from user-specific FAISS store, and queries Gemini.
    """
    if not request.pdf_name:
        raise HTTPException(status_code=400, detail="No active PDF selected. Please upload a PDF first.")
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    if not request.username.strip():
        raise HTTPException(status_code=400, detail="User context is missing.")
        
    try:
        answer = rag.generate_answer(
            request.pdf_name, 
            request.query, 
            request.history, 
            request.username.strip().lower()
        )
        return {
            "status": "success",
            "answer": answer
        }
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=404, detail=str(fnf))
    except Exception as e:
        print(f"Error during chat retrieval/generation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate answer: {str(e)}")

@app.get("/health")
async def health_check():
    """Simple API health check endpoint."""
    return {"status": "healthy"}
