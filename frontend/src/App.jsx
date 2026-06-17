import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Upload, 
  MessageSquare, 
  Send, 
  Sun, 
  Moon, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  Trash2, 
  Bot, 
  User, 
  Sparkles,
  Terminal,
  Plus
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Custom lightweight Markdown renderer
const MarkdownMessage = ({ text }) => {
  const getParsedHtml = (markdown) => {
    if (!markdown) return '';
    
    // Escape standard HTML tags for safety
    let html = markdown
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Handle Code Blocks: ```lang code ```
    html = html.replace(/```([\s\S]+?)```/g, (match, code) => {
      const lines = code.trim().split('\n');
      let lang = '';
      let codeText = code;
      if (lines.length > 0 && !lines[0].includes(' ') && lines[0].length < 15) {
        lang = lines[0];
        codeText = lines.slice(1).join('\n');
      }
      return `<pre class="my-3 overflow-x-auto rounded-xl border border-gold-500/10 dark:border-gold-500/5 bg-obsidian-950 p-4 font-mono text-sm leading-relaxed"><code class="text-gold-200">${codeText.trim()}</code></pre>`;
    });

    // Handle Inline Code: `code`
    html = html.replace(/`([^`]+?)`/g, '<code class="px-1.5 py-0.5 rounded bg-gold-500/10 dark:bg-gold-500/5 font-mono text-sm border border-gold-500/20 text-gold-600 dark:text-gold-300">$1</code>');

    // Handle Headers
    html = html.replace(/^\s*###\s+(.+)$/gm, '<h3 class="text-lg font-bold mt-4 mb-2 tracking-tight">$1</h3>');
    html = html.replace(/^\s*##\s+(.+)$/gm, '<h2 class="text-xl font-bold mt-5 mb-2 tracking-tight border-b border-gold-500/10 pb-1">$1</h2>');
    html = html.replace(/^\s*#\s+(.+)$/gm, '<h1 class="text-2xl font-extrabold mt-6 mb-3 tracking-tight">$1</h1>');

    // Handle Bold: **text**
    html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<strong class="font-bold text-gold-600 dark:text-gold-450">$1</strong>');

    // Handle Tables: | col1 | col2 |
    let lines = html.split('\n');
    let inTable = false;
    let hasHeader = false;
    let newLines = [];
    let tableRows = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (line.startsWith('|') && line.endsWith('|')) {
        if (!inTable) {
          inTable = true;
          hasHeader = false;
          tableRows = [];
        }
        
        // Separator row
        if (line.replace(/[\s|:-]/g, '') === '') {
          hasHeader = true;
          continue;
        }
        
        let cols = line.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
        tableRows.push(cols);
      } else {
        if (inTable) {
          let tableHtml = '<div class="overflow-x-auto my-3"><table class="min-w-full border-collapse border border-gold-500/15 text-sm">';
          tableRows.forEach((row, rowIdx) => {
            tableHtml += '<tr class="border-b border-gold-500/10">';
            row.forEach(col => {
              if (rowIdx === 0) {
                tableHtml += `<th class="px-4 py-2 bg-obsidian-900 border border-gold-500/15 font-semibold text-left text-gold-450">${col}</th>`;
              } else {
                tableHtml += `<td class="px-4 py-2 border border-gold-500/10">${col}</td>`;
              }
            });
            tableHtml += '</tr>';
          });
          tableHtml += '</table></div>';
          newLines.push(tableHtml);
          inTable = false;
        }
        newLines.push(lines[i]);
      }
    }
    if (inTable) {
      let tableHtml = '<div class="overflow-x-auto my-3"><table class="min-w-full border-collapse border border-gold-500/15 text-sm">';
      tableRows.forEach((row, rowIdx) => {
        tableHtml += '<tr class="border-b border-gold-500/10">';
        row.forEach(col => {
          tableHtml += `<td class="px-4 py-2 border border-gold-500/10">${col}</td>`;
        });
        tableHtml += '</tr>';
      });
      tableHtml += '</table></div>';
      newLines.push(tableHtml);
    }
    html = newLines.join('\n');

    // Handle Unordered Lists: - item or * item
    html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li class="my-1 list-disc ml-6">$1</li>');
    html = html.replace(/(<li class="my-1 list-disc ml-6">[\s\S]+?<\/li>)/g, (match) => {
      return `<ul class="my-2">${match}</ul>`;
    });
    html = html.replace(/<\/ul>\s*<ul class="my-2">/g, '');

    // Handle Ordered Lists: 1. item
    html = html.replace(/^\s*\d+\.\s+(.+)$/gm, '<li class="my-1 list-decimal ml-6">$1</li>');
    html = html.replace(/(<li class="my-1 list-decimal ml-6">[\s\S]+?<\/li>)/g, (match) => {
      return `<ol class="my-2">${match}</ol>`;
    });
    html = html.replace(/<\/ol>\s*<ol class="my-2">/g, '');

    // Handle Blockquotes: > text
    html = html.replace(/^\s*>\s+(.+)$/gm, '<blockquote class="border-l-3 border-gold-500 pl-4 py-1 my-3 italic text-obsidian-500 dark:text-obsidian-400">$1</blockquote>');

    // Handle Paragraphs
    let blocks = html.split(/\n\n+/);
    html = blocks.map(b => {
      b = b.trim();
      if (!b) return "";
      if (b.startsWith('<h') || b.startsWith('<ul') || b.startsWith('<ol') || b.startsWith('<div') || b.startsWith('<pre') || b.startsWith('<blockquote')) {
        return b;
      }
      return `<p class="mb-3 leading-relaxed">${b.replace(/\n/g, "<br>")}</p>`;
    }).join("\n");

    return html;
  };

  return (
    <div 
      className="markdown-content text-obsidian-800 dark:text-obsidian-200 text-sm sm:text-base select-text"
      dangerouslySetInnerHTML={{ __html: getParsedHtml(text) }}
    />
  );
};

export default function App() {
  // Authentication states
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('docmind_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Chat/Session states
  const [messages, setMessages] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Load user sessions when user toggles
  useEffect(() => {
    if (user) {
      const key = `rag_chat_sessions_${user.username}`;
      const saved = localStorage.getItem(key);
      setSessions(saved ? JSON.parse(saved) : []);
    } else {
      setSessions([]);
    }
    setCurrentSessionId(null);
    setActivePdf(null);
    setMessages([]);
  }, [user]);

  // Sync active sessions to localStorage
  useEffect(() => {
    if (user) {
      const key = `rag_chat_sessions_${user.username}`;
      localStorage.setItem(key, JSON.stringify(sessions));
    }
  }, [sessions, user]);

  const [input, setInput] = useState('');
  
  // PDF state
  const [activePdf, setActivePdf] = useState(null); // { name, filename }
  const [isUploading, setIsUploading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  
  // Theme state
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  // Error / Status States
  const [error, setError] = useState(null);
  const [rateLimitInfo, setRateLimitInfo] = useState(null);

  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  // Initialize Theme on Mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
      setIsDarkMode(true);
    } else {
      document.documentElement.classList.remove('dark');
      setIsDarkMode(false);
    }
    
    // Check API health on mount
    axios.get(`${API_URL}/health`)
      .catch(() => setError("Backend API connection failed. Please ensure the FastAPI backend is running locally."));
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const toggleTheme = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDarkMode(true);
    }
  };

  // Auth Submit handlers
  const handleLogin = async (e) => {
    e.preventDefault();
    const cleanUsername = authUsername.trim();
    if (!cleanUsername || !authPassword) return;

    setAuthLoading(true);
    setAuthError(null);

    try {
      const response = await axios.post(`${API_URL}/login`, {
        username: cleanUsername,
        password: authPassword
      });

      if (response.data.status === 'success') {
        const loggedUser = { username: response.data.username };
        localStorage.setItem('docmind_user', JSON.stringify(loggedUser));
        setUser(loggedUser);
        setAuthUsername('');
        setAuthPassword('');
      }
    } catch (err) {
      console.error(err);
      setAuthError(err.response?.data?.detail || "Invalid username or password.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    const cleanUsername = authUsername.trim();
    if (!cleanUsername || !authPassword) return;

    setAuthLoading(true);
    setAuthError(null);

    try {
      const response = await axios.post(`${API_URL}/register`, {
        username: cleanUsername,
        password: authPassword
      });

      if (response.data.status === 'success') {
        // Auto-login on registration success
        const loginResponse = await axios.post(`${API_URL}/login`, {
          username: cleanUsername,
          password: authPassword
        });

        if (loginResponse.data.status === 'success') {
          const loggedUser = { username: loginResponse.data.username };
          localStorage.setItem('docmind_user', JSON.stringify(loggedUser));
          setUser(loggedUser);
          setAuthUsername('');
          setAuthPassword('');
        }
      }
    } catch (err) {
      console.error(err);
      setAuthError(err.response?.data?.detail || "Registration failed. Username may already be taken.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('docmind_user');
    setUser(null);
  };

  // Handle PDF file upload
  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setIsUploading(true);
    setError(null);
    setRateLimitInfo(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('username', user.username);

    try {
      const response = await axios.post(`${API_URL}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.status === 'success') {
        const newSessionId = Date.now().toString();
        const initialMessages = [
          { 
            role: 'ai', 
            content: `Successfully loaded and indexed **${response.data.filename}**! You can now ask questions about the contents of this document.` 
          }
        ];
        const newSession = {
          id: newSessionId,
          pdfName: response.data.pdf_name,
          pdfFilename: response.data.filename,
          title: `Chat with ${response.data.filename}`,
          messages: initialMessages,
          timestamp: Date.now()
        };
        
        setSessions(prev => [newSession, ...prev]);
        setCurrentSessionId(newSessionId);
        setActivePdf({
          name: response.data.pdf_name,
          filename: response.data.filename,
        });
        setMessages(initialMessages);
        setIsSidebarOpen(false);
      }
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail || "Failed to upload and index the PDF file.";
      setError(detail);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = ''; // Reset file input
    }
  };

  // Handle Sending Chat Messages
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !activePdf || isThinking || !user) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);
    setRateLimitInfo(null);

    // Add User Message to Chat
    const userMessageObj = { role: 'user', content: userMessage };
    setMessages(prev => [...prev, userMessageObj]);
    setIsThinking(true);

    // Sync user message to active session
    if (currentSessionId) {
      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          let title = s.title;
          if (s.title.startsWith('Chat with ')) {
            title = userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '');
          }
          return {
            ...s,
            messages: [...s.messages, userMessageObj],
            title,
            timestamp: Date.now()
          };
        }
        return s;
      }));
    }

    try {
      const response = await axios.post(`${API_URL}/chat`, {
        pdf_name: activePdf.name,
        query: userMessage,
        history: messages,
        username: user.username
      });

      if (response.data.status === 'success') {
        const aiMessageObj = { role: 'ai', content: response.data.answer };
        setMessages(prev => [...prev, aiMessageObj]);

        // Sync AI response to active session
        if (currentSessionId) {
          setSessions(prev => prev.map(s => {
            if (s.id === currentSessionId) {
              return {
                ...s,
                messages: [...s.messages, aiMessageObj],
                timestamp: Date.now()
              };
            }
            return s;
          }));
        }
      }
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail || "Failed to generate answer. Please try again.";
      
      // Specially detect Rate Limits/Quota Exceeded
      if (detail.includes("RESOURCE_EXHAUSTED") || detail.includes("429")) {
        setRateLimitInfo("API Daily quota exceeded. Please configure a new API key or switch to a paid plan.");
      } else {
        setError(detail);
      }
    } finally {
      setIsThinking(false);
    }
  };

  const handleResetChat = () => {
    setMessages([]);
    setError(null);
    setRateLimitInfo(null);
    if (currentSessionId) {
      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          return {
            ...s,
            messages: [],
            timestamp: Date.now()
          };
        }
        return s;
      }));
    }
  };

  const handleClearPdf = () => {
    setActivePdf(null);
    setMessages([]);
    setError(null);
    setRateLimitInfo(null);
    if (currentSessionId) {
      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          return {
            ...s,
            pdfName: '',
            pdfFilename: '',
            messages: [],
            timestamp: Date.now()
          };
        }
        return s;
      }));
    }
  };

  const handleNewChat = () => {
    setCurrentSessionId(null);
    setActivePdf(null);
    setMessages([]);
    setError(null);
    setRateLimitInfo(null);
    setIsSidebarOpen(false);
  };

  const handleSelectSession = (session) => {
    setCurrentSessionId(session.id);
    if (session.pdfName && session.pdfFilename) {
      setActivePdf({
        name: session.pdfName,
        filename: session.pdfFilename
      });
    } else {
      setActivePdf(null);
    }
    setMessages(session.messages || []);
    setError(null);
    setRateLimitInfo(null);
    setIsSidebarOpen(false);
  };

  const handleDeleteSession = (sessionId, e) => {
    e.stopPropagation();
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (currentSessionId === sessionId) {
      handleNewChat();
    }
  };

  const handleCopyText = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageIndex(index);
    setTimeout(() => setCopiedMessageIndex(null), 2000);
  };

  // RENDER LOGIN / REGISTER OVERLAY PAGE IF NO USER SESSION ACTIVE
  if (!user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#fafafa] dark:bg-[#040406] text-obsidian-900 dark:text-obsidian-100 p-4 transition-colors duration-300 relative overflow-hidden">
        
        {/* Glow backdrop decorations */}
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-gold-500/3 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-gold-500/3 blur-[120px] pointer-events-none" />

        <div className="w-full max-w-md p-8 rounded-3xl border border-obsidian-200 dark:border-gold-500/10 bg-white/75 dark:bg-[#0c0c0e]/80 backdrop-blur-md shadow-[0_16px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_16px_50px_rgba(212,175,55,0.04)] animate-fade-in relative z-10">
          
          {/* logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="p-3.5 bg-gold-500/10 rounded-2xl text-gold-500 border border-gold-500/20 mb-4 shadow-[0_0_20px_rgba(212,175,55,0.15)] animate-pulse">
              <Sparkles className="h-8 w-8 stroke-[1.8]" />
            </div>
            <h1 className="text-3xl font-black text-gold-gradient tracking-tight">DocMind AI</h1>
            <p className="text-xs text-obsidian-550 dark:text-obsidian-400 font-bold uppercase tracking-widest mt-1.5">Document Intelligence</p>
          </div>

          <h3 className="text-xl font-bold tracking-tight text-center mb-2">
            {isRegistering ? "Create your account" : "Sign in to your account"}
          </h3>
          <p className="text-xs text-obsidian-450 dark:text-obsidian-450 text-center mb-6 font-medium">
            Turn Your Documents Into Conversations.
          </p>

          <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-4">
            
            {authError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                <span>{authError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-obsidian-450 dark:text-obsidian-400 uppercase tracking-wider">Username</label>
              <input
                type="text"
                required
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full px-4 py-3 rounded-xl border border-obsidian-200 dark:border-[#1e1e24] bg-white dark:bg-[#040406] text-sm font-medium outline-none focus:ring-2 focus:ring-gold-500/10 focus:border-gold-500 transition-all duration-200"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-obsidian-450 dark:text-obsidian-400 uppercase tracking-wider">Password</label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-4 py-3 rounded-xl border border-obsidian-200 dark:border-[#1e1e24] bg-white dark:bg-[#040406] text-sm font-medium outline-none focus:ring-2 focus:ring-gold-500/10 focus:border-gold-500 transition-all duration-200"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3.5 bg-gradient-to-r from-gold-600 via-gold-500 to-gold-600 hover:from-gold-500 hover:via-gold-400 hover:to-gold-500 text-obsidian-950 font-bold rounded-xl shadow-[0_4px_15px_rgba(212,175,55,0.15)] hover:shadow-[0_4px_22px_rgba(212,175,55,0.3)] hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-6"
            >
              {authLoading ? (
                <div className="w-5 h-5 border-2 border-obsidian-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>{isRegistering ? "Register Account" : "Log In"}</span>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsRegistering(!isRegistering);
                setAuthError(null);
                setAuthUsername('');
                setAuthPassword('');
              }}
              className="text-xs text-obsidian-450 hover:text-gold-550 dark:text-obsidian-400 dark:hover:text-gold-400 font-bold transition-colors cursor-pointer hover:underline"
            >
              {isRegistering ? "Already have an account? Sign In" : "Don't have an account? Create one"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#fafafa] dark:bg-[#040406] text-obsidian-900 dark:text-obsidian-100 transition-colors duration-300 relative">
      
      {/* Mobile Drawer Overlay Backdrop */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-xs z-25 transition-all duration-300"
        />
      )}

      {/* ================= LEFT SIDEBAR ================= */}
      <aside className={`fixed md:relative inset-y-0 left-0 w-80 bg-white dark:bg-[#0c0c0e] border-r border-obsidian-200 dark:border-gold-500/10 shadow-[4px_0_24px_rgba(0,0,0,0.2)] z-30 transition-transform duration-300 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      } ${
        isSidebarOpen ? 'flex' : 'hidden md:flex'
      } flex-col shrink-0`}>
        
        {/* Sidebar Header */}
        <div className="p-6 border-b border-obsidian-100 dark:border-gold-500/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gold-500/10 rounded-xl text-gold-500 border border-gold-500/20 shadow-[0_0_15px_rgba(212,175,55,0.15)]">
              <Sparkles className="h-5.5 w-5.5 stroke-[1.8]" />
            </div>
            <div>
              <h1 className="font-extrabold tracking-tight text-gold-gradient text-lg">DocMind AI</h1>
              <p className="text-[10px] text-obsidian-400 font-semibold tracking-widest uppercase mt-0.5">Document Intelligence</p>
            </div>
          </div>
          
          {/* Close Sidebar Button inside Drawer on Mobile */}
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden p-2 hover:bg-obsidian-100 dark:hover:bg-obsidian-850 rounded-xl text-obsidian-400 hover:text-gold-500 cursor-pointer"
          >
            <svg className="h-5.5 w-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 p-5 flex flex-col gap-5 overflow-hidden">
          
          {/* New Chat Button */}
          <button 
            onClick={handleNewChat}
            className="w-full py-3 px-4 bg-gradient-to-r from-gold-600 via-gold-500 to-gold-600 hover:from-gold-500 hover:via-gold-400 hover:to-gold-500 text-obsidian-950 rounded-xl transition-all duration-300 font-bold shadow-[0_4px_12px_rgba(212,175,55,0.15)] hover:shadow-[0_4px_20px_rgba(212,175,55,0.3)] hover:-translate-y-0.5 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-gold-500/50 shrink-0 cursor-pointer"
          >
            <Plus className="h-4.5 w-4.5 stroke-[2.5]" />
            New Chat
          </button>
          
          {/* Active PDF Status */}
          <div className="flex flex-col gap-2.5 shrink-0">
            <h2 className="text-[11px] font-bold text-obsidian-400 uppercase tracking-widest">Active Document</h2>
            
            {activePdf ? (
              <div className="p-4 rounded-xl border border-gold-500/20 bg-gold-500/5 dark:bg-gold-950/10 flex flex-col gap-3 gold-glow transition-all duration-300">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-gold-500 shrink-0 mt-0.5" />
                  <div className="overflow-hidden">
                    <p className="text-sm font-semibold text-obsidian-950 dark:text-obsidian-100 truncate leading-snug">{activePdf.filename}</p>
                    <p className="text-[10px] text-obsidian-400 font-mono truncate mt-0.5">{activePdf.name}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-1.5 text-xs text-gold-600 dark:text-gold-400 font-bold bg-gold-500/10 border border-gold-500/20 rounded-lg px-2.5 py-1.5 self-start">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Cached & Indexed
                </div>

                <button 
                  onClick={handleClearPdf}
                  className="mt-1 w-full py-2 bg-obsidian-100 dark:bg-obsidian-850 hover:bg-rose-500/15 hover:text-rose-500 hover:border-rose-500/30 text-xs font-semibold rounded-lg text-obsidian-500 dark:text-obsidian-400 transition-all border border-transparent flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Unload Document
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-obsidian-350 dark:border-gold-500/10 bg-obsidian-50/50 dark:bg-obsidian-900/20 text-center flex flex-col items-center justify-center gap-2 py-6">
                <Upload className="h-5.5 w-5.5 text-obsidian-400" />
                <p className="text-xs text-obsidian-400 font-medium">No document loaded</p>
              </div>
            )}
          </div>

          {/* Recent Chats Section */}
          <div className="flex flex-col gap-2.5 flex-1 overflow-hidden">
            <h2 className="text-[11px] font-bold text-obsidian-400 uppercase tracking-widest shrink-0">Recent Chats</h2>
            
            {sessions.length > 0 ? (
              <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                {sessions.map((session) => {
                  const isActive = currentSessionId === session.id;
                  return (
                    <div
                      key={session.id}
                      onClick={() => handleSelectSession(session)}
                      className={`group relative p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all duration-200 ${
                        isActive 
                          ? 'bg-gradient-to-r from-gold-500/15 to-transparent border-gold-500/30 dark:border-gold-500/20 text-gold-600 dark:text-gold-450 font-bold shadow-[0_2px_15px_rgba(212,175,55,0.08)]' 
                          : 'bg-[#fafafc] dark:bg-[#0e0e11]/40 hover:bg-obsidian-100 dark:hover:bg-obsidian-850/80 border-obsidian-200 dark:border-[#1e1e24] text-obsidian-600 dark:text-obsidian-350'
                      }`}
                    >
                      <MessageSquare className={`h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-gold-500' : ''}`} />
                      
                      <div className="flex-1 min-w-0 pr-6">
                        <p className="text-sm truncate leading-snug">{session.title}</p>
                        <p className="text-[10px] text-obsidian-400 truncate mt-0.5">{session.pdfFilename || 'No active file'}</p>
                      </div>

                      <button
                        onClick={(e) => handleDeleteSession(session.id, e)}
                        className="absolute right-3 opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-500/20 text-obsidian-400 hover:text-rose-500 rounded transition-all duration-200 cursor-pointer"
                        title="Delete Chat"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 text-center border border-dashed border-obsidian-200 dark:border-[#1e1e24] rounded-xl bg-obsidian-50/20 dark:bg-obsidian-900/10 shrink-0">
                <p className="text-xs text-obsidian-400 font-medium">No recent chats</p>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          {activePdf && (
            <div className="flex flex-col gap-2.5 shrink-0 border-t border-obsidian-100 dark:border-gold-500/10 pt-4">
              <h2 className="text-[11px] font-bold text-obsidian-400 uppercase tracking-widest">Conversation</h2>
              <button 
                onClick={handleResetChat}
                className="w-full py-2.5 bg-obsidian-100 dark:bg-[#1a1a22] hover:bg-obsidian-200 dark:hover:bg-[#20202a] text-sm font-semibold rounded-lg text-obsidian-750 dark:text-obsidian-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-transparent hover:border-obsidian-200 dark:hover:border-gold-500/10"
              >
                <RefreshCw className="h-4 w-4" />
                Clear Chat History
              </button>
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-6 border-t border-obsidian-100 dark:border-gold-500/10 flex items-center justify-between shrink-0 bg-obsidian-50/50 dark:bg-[#09090b]/40 gap-4">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <button 
              onClick={toggleTheme}
              className="p-2.5 bg-obsidian-100 dark:bg-obsidian-805 hover:bg-obsidian-200 dark:hover:bg-obsidian-850 rounded-xl transition-all shadow-sm border border-transparent hover:border-gold-500/20 cursor-pointer shrink-0"
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDarkMode ? <Sun className="h-4 w-4 text-gold-500" /> : <Moon className="h-4 w-4 text-obsidian-550" />}
            </button>
            
            <div className="flex flex-col min-w-0">
              <p className="text-[9px] text-obsidian-450 uppercase font-bold tracking-wider leading-none">Logged In</p>
              <p className="text-xs font-bold text-gold-500 truncate mt-1 flex items-center gap-1 leading-none">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>
                {user.username}
              </p>
            </div>
          </div>

          <button 
            onClick={handleLogout}
            className="p-2.5 bg-obsidian-100 dark:bg-obsidian-800 hover:bg-rose-500/10 text-obsidian-450 hover:text-rose-500 rounded-xl transition-all border border-transparent hover:border-rose-500/20 cursor-pointer shadow-sm shrink-0"
            title="Log Out"
          >
            <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ================= MAIN CHAT AREA ================= */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative transition-all duration-300">
        
        {/* Top Header Row */}
        <header className="h-16 border-b border-obsidian-200 dark:border-gold-500/10 bg-white/70 dark:bg-[#040406]/70 backdrop-blur-md px-6 flex items-center justify-between shrink-0 z-10 transition-all duration-300">
          <div className="flex items-center gap-3">
            {/* Hamburger menu button for mobile layout */}
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="md:hidden p-2 text-obsidian-500 hover:text-gold-500 hover:bg-obsidian-100 dark:hover:bg-obsidian-850 rounded-xl focus:outline-none cursor-pointer"
              title="Open Navigation"
            >
              <svg className="h-5.5 w-5.5 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="hidden md:block">
              {/* Desktop Indicator details */}
              <h2 className="text-sm font-bold text-obsidian-950 dark:text-obsidian-50 tracking-tight leading-none">
                {activePdf ? `Chatting with: ${activePdf.filename}` : "DocMind AI"}
              </h2>
              <p className="text-[11px] text-obsidian-450 dark:text-obsidian-400 font-medium mt-1">
                {activePdf ? "Grounded in your document contents" : "Upload a PDF to get started"}
              </p>
            </div>
            <div className="md:hidden">
              {/* Mobile Centered logo label */}
              <h2 className="text-sm font-bold text-obsidian-950 dark:text-obsidian-50 tracking-tight leading-none">
                {activePdf ? activePdf.filename : "DocMind AI"}
              </h2>
            </div>
          </div>
          
          {/* Mobile Theme Toggle */}
          <div className="flex items-center gap-2">
            <button 
              onClick={toggleTheme}
              className="p-2.5 bg-obsidian-100 dark:bg-obsidian-800 border border-transparent hover:border-gold-500/25 rounded-xl cursor-pointer"
            >
              {isDarkMode ? <Sun className="h-4 w-4 text-gold-500" /> : <Moon className="h-4 w-4 text-obsidian-550" />}
            </button>
          </div>
        </header>

        {/* Alert Bars for Errors */}
        {error && (
          <div className="bg-rose-500/10 border-b border-rose-500/20 text-rose-800 dark:text-rose-300 p-4 flex gap-3 items-start shrink-0 z-15 animate-fade-in mx-6 mt-4 rounded-xl">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-rose-500" />
            <div className="text-sm font-semibold">{error}</div>
            <button onClick={() => setError(null)} className="ml-auto text-xs hover:underline text-rose-500 font-bold cursor-pointer">Dismiss</button>
          </div>
        )}

        {rateLimitInfo && (
          <div className="bg-gold-500/10 border-b border-gold-500/20 text-gold-800 dark:text-gold-300 p-4 flex gap-3 items-start shrink-0 z-15 animate-fade-in mx-6 mt-4 rounded-xl">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-gold-505" />
            <div className="text-sm font-semibold">
              <span className="font-bold">Daily API Quota Hit:</span> {rateLimitInfo}
            </div>
            <button onClick={() => setRateLimitInfo(null)} className="ml-auto text-xs hover:underline text-gold-500 font-bold cursor-pointer">Dismiss</button>
          </div>
        )}

        {/* Chat History Messages Wrapper */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {activePdf ? (
            // Active Chat Messages
            <div className="max-w-[800px] mx-auto space-y-6 pb-28">
              {messages.map((message, idx) => (
                <div 
                  key={idx} 
                  className={`group flex gap-4 items-start ${message.role === 'user' ? 'flex-row-reverse' : ''} animate-fade-in`}
                >
                  {/* Avatar Bubble */}
                  <div className={`p-2.5 rounded-xl shrink-0 border transition-all duration-300 ${
                    message.role === 'user' 
                      ? 'bg-obsidian-250 dark:bg-[#1a1a22] border-obsidian-350 dark:border-gold-500/10 text-obsidian-800 dark:text-obsidian-250 shadow-sm' 
                      : 'bg-gold-500/10 text-gold-650 dark:text-gold-450 border-gold-500/25 shadow-[0_2px_10px_rgba(212,175,55,0.08)]'
                  }`}>
                    {message.role === 'user' ? <User className="h-4.5 w-4.5" /> : <Bot className="h-4.5 w-4.5" />}
                  </div>

                  {/* Message bubble content */}
                  <div className={`p-5 rounded-2xl border max-w-[85%] sm:max-w-[80%] transition-all duration-355 relative ${
                    message.role === 'user' 
                      ? 'bg-obsidian-100 dark:bg-[#131317]/90 border-obsidian-200 dark:border-[#22222a] rounded-tr-none' 
                      : 'bg-white dark:bg-[#0c0c0e]/95 border-obsidian-200 dark:border-gold-500/5 rounded-tl-none shadow-[0_4px_20px_rgba(0,0,0,0.06)]'
                  }`}>
                    {message.role === 'user' ? (
                      <p className="text-obsidian-900 dark:text-obsidian-100 text-sm sm:text-base leading-relaxed select-text whitespace-pre-wrap">{message.content}</p>
                    ) : (
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <MarkdownMessage text={message.content} />
                        </div>
                        <button
                          onClick={() => handleCopyText(message.content, idx)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-obsidian-100 dark:hover:bg-obsidian-850 text-obsidian-450 hover:text-gold-500 rounded-lg transition-all duration-200 shrink-0 self-start cursor-pointer mt-0.5 border border-transparent hover:border-gold-500/15"
                          title="Copy reply to clipboard"
                        >
                          {copiedMessageIndex === idx ? (
                            <span className="text-[10px] text-gold-500 font-bold px-0.5">Copied!</span>
                          ) : (
                            <svg className="h-4 w-4 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                            </svg>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {/* Thinking / Loader State */}
              {isThinking && (
                <div className="flex gap-4 items-start">
                  <div className="p-2.5 rounded-xl bg-gold-500/10 text-gold-500 border border-gold-500/20 shrink-0 animate-pulse">
                    <Bot className="h-4.5 w-4.5" />
                  </div>
                  <div className="p-4 rounded-2xl border border-obsidian-250 dark:border-gold-500/5 bg-white dark:bg-[#0c0c0e]/95 rounded-tl-none flex items-center gap-1.5 shadow-[0_4px_15px_rgba(0,0,0,0.05)]">
                    <span className="w-2.5 h-2.5 rounded-full bg-gold-500 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-gold-500 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-gold-500 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>
          ) : (
            // Welcome Empty State (Redesigned with feature grid guides)
            <div className="max-w-2xl mx-auto min-h-full flex flex-col justify-center items-center gap-8 text-center px-4 py-8">
              <div className="p-5 bg-gold-500/10 rounded-2xl text-gold-500 border border-gold-500/20 animate-pulse shadow-[0_0_30px_rgba(212,175,55,0.18)] transition-all duration-300">
                <Sparkles className="h-10 w-10 stroke-[1.8]" />
              </div>
              
              <div className="space-y-3">
                <h3 className="text-3.5xl sm:text-4.5xl font-black tracking-tight text-gold-gradient">DocMind AI</h3>
                <p className="text-sm sm:text-base text-gold-500 font-bold tracking-wide leading-relaxed">
                  Turn Your Documents Into Conversations.
                </p>
                <p className="text-xs text-obsidian-450 dark:text-obsidian-400 max-w-md mx-auto leading-relaxed">
                  Instantly upload, vector-index, and chat with your PDFs using grounded contextual intelligence.
                </p>
              </div>

              {/* Upload Drop Box area */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full max-w-xl border-2 border-dashed border-obsidian-300 dark:border-[#22222a] hover:border-gold-500/50 hover:bg-gold-500/3 dark:hover:bg-gold-500/2 rounded-2xl p-10 cursor-pointer flex flex-col items-center justify-center gap-4 transition-all duration-300 group bg-white dark:bg-[#0c0c0e]/30 shadow-sm hover:shadow-[0_12px_40px_rgba(212,175,55,0.06)] gold-glow-hover"
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept=".pdf" 
                  className="hidden" 
                />
                
                {isUploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="gold-spinner mb-1" />
                    <p className="text-sm font-bold text-obsidian-800 dark:text-obsidian-200">Processing and Indexing PDF...</p>
                    <p className="text-xs text-gold-500 font-bold uppercase tracking-wider animate-pulse">Running Embeddings & Constructing FAISS Cache</p>
                  </div>
                ) : (
                  <>
                    <div className="p-3.5 bg-obsidian-50 dark:bg-[#131317] rounded-2xl group-hover:bg-gold-500/10 group-hover:text-gold-500 border border-transparent group-hover:border-gold-500/20 transition-all duration-300">
                      <Upload className="h-6 w-6 text-obsidian-400 group-hover:text-gold-500 transition-colors" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-obsidian-800 dark:text-obsidian-200 group-hover:text-gold-500 transition-colors duration-250">Drag & drop or click to upload PDF</p>
                      <p className="text-xs text-obsidian-400 mt-1 font-medium">Supports PDF document analysis up to 50MB</p>
                    </div>
                  </>
                )}
              </div>

              {/* ChatGPT style Feature Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl mt-4">
                <div className="p-4 rounded-xl border border-obsidian-200 dark:border-[#1e1e24] bg-white/50 dark:bg-[#0c0c0e]/20 text-left transition-all duration-300 hover:border-gold-500/30 hover:-translate-y-1">
                  <div className="p-2 bg-gold-500/10 text-gold-500 rounded-lg w-fit mb-3">
                    <Sparkles className="h-4 w-4 stroke-[2]" />
                  </div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-obsidian-400">Contextual Memory</h4>
                  <p className="text-xs text-obsidian-550 dark:text-obsidian-350 mt-1.5 leading-relaxed">Applies chat history rewrite models to follow conversational topics seamlessly.</p>
                </div>

                <div className="p-4 rounded-xl border border-obsidian-200 dark:border-[#1e1e24] bg-white/50 dark:bg-[#0c0c0e]/20 text-left transition-all duration-300 hover:border-gold-500/30 hover:-translate-y-1">
                  <div className="p-2 bg-gold-500/10 text-gold-500 rounded-lg w-fit mb-3">
                    <FileText className="h-4 w-4 stroke-[2]" />
                  </div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-obsidian-400">Local Cache Store</h4>
                  <p className="text-xs text-obsidian-550 dark:text-obsidian-350 mt-1.5 leading-relaxed">Caches document vectors locally to skip token costs on subsequent sessions.</p>
                </div>

                <div className="p-4 rounded-xl border border-obsidian-200 dark:border-[#1e1e24] bg-white/50 dark:bg-[#0c0c0e]/20 text-left transition-all duration-300 hover:border-gold-500/30 hover:-translate-y-1">
                  <div className="p-2 bg-gold-500/10 text-gold-500 rounded-lg w-fit mb-3">
                    <Terminal className="h-4 w-4 stroke-[2]" />
                  </div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-obsidian-400">Grounded Scope</h4>
                  <p className="text-xs text-obsidian-550 dark:text-obsidian-350 mt-1.5 leading-relaxed">Limits response models to PDF scopes. Prevents generic information hallucinations.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Input Fixed Bar */}
        {activePdf && (
          <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-[#fafafa] dark:from-[#040406] via-[#fafafa]/90 dark:via-[#040406]/90 to-transparent shrink-0">
            <div className="max-w-[800px] mx-auto">
              <form 
                onSubmit={handleSendMessage}
                className="relative flex items-center bg-white dark:bg-[#0c0c0e] border border-obsidian-200 dark:border-gold-500/15 rounded-2xl p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] focus-within:ring-2 focus-within:ring-gold-500/15 focus-within:border-gold-500 focus-within:shadow-[0_8px_30px_rgba(212,175,55,0.08)] transition-all duration-300"
              >
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isThinking}
                  placeholder="Ask a question about your document..." 
                  className="flex-1 bg-transparent border-0 outline-none px-4 py-3.5 text-sm sm:text-base text-obsidian-900 dark:text-obsidian-100 placeholder-obsidian-400 font-medium"
                />
                <button 
                  type="submit"
                  disabled={!input.trim() || isThinking}
                  className="p-3.5 bg-gradient-to-r from-gold-600 to-gold-500 hover:from-gold-500 hover:to-gold-400 text-obsidian-950 rounded-xl transition-all duration-200 flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-[0_2px_12px_rgba(212,175,55,0.25)]"
                >
                  <Send className="h-4.5 w-4.5 stroke-[2.5]" />
                </button>
              </form>
              <p className="text-[10px] text-center text-obsidian-450 dark:text-obsidian-400 mt-2.5 font-bold tracking-wide">
                Grounded context query • Gemini 2.5 Flash • Vector cache index enabled
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
