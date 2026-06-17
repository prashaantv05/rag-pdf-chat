import os
import time
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_community.vectorstores import FAISS

# Load environment variables
load_dotenv()

# Resolve directories relative to this file's location
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(BASE_DIR, "faiss_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# Initialize the embedding model
embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001"
)

# Initialize the Gemini Chat model
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0
)

def process_pdf(pdf_path: str, username: str = "default") -> str:
    """
    Loads PDF, chunkifies it, generates embeddings (handling rate limits),
    and caches the FAISS vector database.
    Returns the dynamic pdf_name (cache key).
    """
    pdf_name = os.path.splitext(os.path.basename(pdf_path))[0]
    user_cache_dir = os.path.join(CACHE_DIR, username)
    os.makedirs(user_cache_dir, exist_ok=True)
    faiss_index_path = os.path.join(user_cache_dir, pdf_name)
    
    if os.path.exists(faiss_index_path):
        print(f"Loading cached FAISS index from {faiss_index_path}...")
        # Just verify it loads correctly
        FAISS.load_local(
            faiss_index_path,
            embeddings,
            allow_dangerous_deserialization=True
        )
        print("Loaded cached index successfully!")
        return pdf_name

    print(f"No cached index found. Processing PDF: {pdf_path}...")
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF file not found at: {pdf_path}")
        
    # Step 1: Load the PDF
    loader = PyPDFLoader(pdf_path)
    docs = loader.load()
    print(f"Total pages loaded: {len(docs)}")
    
    # Step 2: Split into chunks
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200
    )
    chunks = splitter.split_documents(docs)
    print(f"Total chunks created: {len(chunks)}")
    
    if len(chunks) == 0:
        raise ValueError("This PDF does not contain any extractable text. Scanned images or empty documents are not supported.")
    
    # Step 3: Generate embeddings in batches with rate-limit retries
    batch_size = 20  # Stay safely under rate limits
    all_texts = [chunk.page_content for chunk in chunks]
    all_embeddings = []
    
    total_batches = (len(all_texts) - 1) // batch_size + 1
    
    for i in range(0, len(all_texts), batch_size):
        batch = all_texts[i:i + batch_size]
        batch_num = i // batch_size + 1
        print(f"Embedding batch {batch_num}/{total_batches} (size {len(batch)})...")
        
        backoff = 70  # Using 70 seconds to safely clear the sliding window
        while True:
            try:
                batch_embeddings = embeddings.embed_documents(batch)
                all_embeddings.extend(batch_embeddings)
                # Sleep briefly between batches to respect rate limits
                time.sleep(2)
                break
            except Exception as e:
                if "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e):
                    print(f"Rate limit (RESOURCE_EXHAUSTED) hit. Waiting {backoff} seconds for quota to reset...")
                    time.sleep(backoff)
                    backoff = min(backoff + 10, 120)  # Increase wait time if it hits again
                else:
                    raise e
                    
    # Create the FAISS database from the pre-computed embeddings
    text_embeddings = list(zip(all_texts, all_embeddings))
    metadatas = [chunk.metadata for chunk in chunks]
    
    print("\nCreating FAISS index...")
    db = FAISS.from_embeddings(
        text_embeddings=text_embeddings,
        embedding=embeddings,
        metadatas=metadatas
    )
    
    # Save the index locally to cache it for future runs
    db.save_local(faiss_index_path)
    print("Index created and cached successfully!")
    return pdf_name

def rewrite_query(query: str, history: list) -> str:
    """
    Rewrites context-dependent queries into standalone queries using the LLM.
    """
    if not history:
        return query
        
    history_str = ""
    for msg in history:
        role = msg.role if hasattr(msg, "role") else msg.get("role", "")
        content = msg.content if hasattr(msg, "content") else msg.get("content", "")
        role_label = "User" if role == "user" else "Assistant"
        history_str += f"{role_label}: {content}\n"
        
    prompt = f"""Given the following conversation history and a follow-up question, rephrase the follow-up question to be a standalone question (grounded in the conversation context) that can be used for search in a vector database. Do NOT answer the question, only output the rephrased standalone question. Do not add any preamble.

Conversation History:
{history_str}

Follow-up Question: {query}
Standalone Question:"""
    
    try:
        response = llm.invoke(prompt)
        # Handle string response or ChatMessage response
        rewritten = response.content.strip() if hasattr(response, "content") else str(response).strip()
        print(f"Original Query: '{query}' -> Rewritten Standalone Query: '{rewritten}'")
        return rewritten
    except Exception as e:
        print(f"Error rewriting query: {e}. Falling back to original query.")
        return query

def generate_answer(pdf_name: str, query: str, history: list = None, username: str = "default") -> str:
    """
    Retrieves the closest chunks from the FAISS database corresponding to pdf_name,
    preserves conversational history, and sends the context to Gemini to answer the query.
    """
    if history is None:
        history = []
        
    faiss_index_path = os.path.join(CACHE_DIR, username, pdf_name)
    if not os.path.exists(faiss_index_path):
        raise FileNotFoundError(f"Vector store cache not found for PDF: {pdf_name}")
        
    db = FAISS.load_local(
        faiss_index_path,
        embeddings,
        allow_dangerous_deserialization=True
    )
    
    # 1. Rewrite query to be standalone based on conversation history
    search_query = rewrite_query(query, history)
    
    # 2. Retrieve relevant chunks (k=8 as per requirements)
    results = db.similarity_search(search_query, k=8)
    
    # Create context from retrieved chunks
    context = "\n\n".join([doc.page_content for doc in results])
    
    # Build history string for the prompt
    history_str = ""
    for msg in history:
        role = msg.role if hasattr(msg, "role") else msg.get("role", "")
        content = msg.content if hasattr(msg, "content") else msg.get("content", "")
        role_label = "User" if role == "user" else "Assistant"
        history_str += f"{role_label}: {content}\n"
    
    # Build prompt including context and conversation history
    prompt = f"""
You are a helpful assistant.

Answer the user's question ONLY using the provided context.
If the answer is not present in the context, say:
"I could not find the answer in the provided document."

Context:
{context}

Conversation History:
{history_str}

Question:
{query}
"""
    
    # Generate answer
    response = llm.invoke(prompt)
    
    if isinstance(response.content, list):
        return response.content[0]["text"]
    else:
        return response.content
