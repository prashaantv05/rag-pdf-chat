import os
import time
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_google_genai import ChatGoogleGenerativeAI

# Load environment variables
load_dotenv()

# Configuration
PDF_FILE_PATH = "sample2.pdf"

pdf_name = os.path.splitext(os.path.basename(PDF_FILE_PATH))[0]
FAISS_INDEX_PATH = os.path.join("faiss_cache", pdf_name)

# Initialize the embedding model
embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001"
)
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0
)

# Load or create the FAISS vector store
if os.path.exists(FAISS_INDEX_PATH):
    print("Loading cached FAISS index...")
    db = FAISS.load_local(
        FAISS_INDEX_PATH,
        embeddings,
        allow_dangerous_deserialization=True
    )
    print("Loaded cached index successfully!")
else:
    print("No cached index found. Processing PDF and generating embeddings...")
    
    # Step 1: Load the PDF
    if not os.path.exists(PDF_FILE_PATH):
        raise FileNotFoundError(f"PDF file not found at: {PDF_FILE_PATH}")
        
    loader = PyPDFLoader(PDF_FILE_PATH)
    docs = loader.load()
    print(f"Total pages loaded: {len(docs)}")
    
    # Step 2: Split into chunks
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,  # Increased chunk size for better semantic context
        chunk_overlap=200
    )
    chunks = splitter.split_documents(docs)
    print(f"Total chunks created: {len(chunks)}")
    print("-" * 50)
    print("Preview of the first chunk:")
    print(chunks[0].page_content[:300] + "...")
    print("-" * 50)
    
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
    db.save_local(FAISS_INDEX_PATH)
    print("Index created and cached successfully!")
    print(f"Indexed {len(chunks)} chunks.")


# ==========================================
# STEP 5 & 6: Interactive RAG Chat
# ==========================================

while True:
    # Take user question
    query = input("\n💬 Enter your question: ")

    # Retrieve relevant chunks
    results = db.similarity_search(query, k=8)

    # Create context from retrieved chunks
    context = "\n\n".join([doc.page_content for doc in results])

    # Build prompt
    prompt = f"""
You are a helpful assistant.

Answer the user's question ONLY using the provided context.
If the answer is not present in the context, say:
"I could not find the answer in the provided document."

Context:
{context}

Question:
{query}
"""

    # Generate answer
    response = llm.invoke(prompt)

    print("\n🤖 Answer:\n")

    # Print only the text
    if isinstance(response.content, list):
        print(response.content[0]["text"])
    else:
        print(response.content)

    # Ask whether to continue
    choice = input("\nDo you wish to continue? (yes/y or no/n): ").strip().lower()

    if choice not in ["yes", "y"]:
        print("\n👋 Thank you for using the RAG chatbot!")
        break