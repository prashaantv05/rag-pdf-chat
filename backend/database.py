import sqlite3
import os
import hashlib

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "users.db")

def init_db():
    """Initializes the SQLite database and creates the users table if it doesn't exist."""
    conn = sqlite3.connect(DB_PATH, timeout=15.0)
    try:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL
            )
        """)
        conn.commit()
    finally:
        conn.close()

def hash_password(password: str, salt_hex: str = None) -> tuple[str, str]:
    """Generates a PBKDF2 password hash with a salt."""
    if salt_hex is None:
        salt = os.urandom(16)
    else:
        salt = bytes.fromhex(salt_hex)
    
    # 100,000 iterations of pbkdf2_hmac with sha256
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return key.hex(), salt.hex()

def register_user(username: str, password: str) -> bool:
    """Registers a new user inside the SQLite database. Returns False if username exists."""
    init_db()
    clean_username = username.strip().lower()
    if not clean_username or not password:
        return False
        
    h, s = hash_password(password)
    conn = sqlite3.connect(DB_PATH, timeout=15.0)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)",
            (clean_username, h, s)
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()

def verify_user(username: str, password: str) -> bool:
    """Verifies a user's password. Returns True if correct, False otherwise."""
    init_db()
    clean_username = username.strip().lower()
    if not clean_username or not password:
        return False
        
    conn = sqlite3.connect(DB_PATH, timeout=15.0)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT password_hash, salt FROM users WHERE username = ?", (clean_username,))
        row = cursor.fetchone()
    finally:
        conn.close()
    
    if not row:
        return False
        
    db_hash, db_salt = row
    h, _ = hash_password(password, db_salt)
    return h == db_hash
