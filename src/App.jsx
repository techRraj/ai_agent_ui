import { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [serverStatus, setServerStatus] = useState('checking');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [typingIndicator, setTypingIndicator] = useState(false);
  const [showLeads, setShowLeads] = useState(false);
  const [recentLeads, setRecentLeads] = useState([]);
  const [theme, setTheme] = useState('light');
  const [wakeAttempts, setWakeAttempts] = useState(0);
  const [connectionError, setConnectionError] = useState(null);
  
  // --- 🌍 NEW: Language Preference State ---
  const [preferredLanguage, setPreferredLanguage] = useState('hin-eng'); // Default: Hinglish
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const keepAliveInterval = useRef(null);
  const wakeCheckInterval = useRef(null);
  
  // Use environment variable with fallback
  const API_URL = import.meta.env.VITE_API_URL || 'https://ai-agent-backend-1-g21l.onrender.com';
  const WAKE_TOKEN = import.meta.env.VITE_WAKE_TOKEN || 'your-secret-token-here';

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, typingIndicator]);

  // Load theme & language from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    const savedLang = localStorage.getItem('preferredLanguage') || 'hin-eng';
    
    setTheme(savedTheme);
    setPreferredLanguage(savedLang);
    
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  // Save language preference to localStorage when changed
  useEffect(() => {
    localStorage.setItem('preferredLanguage', preferredLanguage);
  }, [preferredLanguage]);

  // Toggle theme
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  // Keep-alive function to prevent server sleep
  const sendKeepAlive = async () => {
    if (serverStatus !== 'ready') return;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      await fetch(`${API_URL}/api/keep-alive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      console.log('❤️ Keep-alive sent');
    } catch (error) {
      console.log('Keep-alive failed (server might be sleeping):', error.message);
      if (serverStatus === 'ready') {
        setServerStatus('checking');
        wakeUpServer();
      }
    }
  };

  // Start keep-alive interval when server is ready
  useEffect(() => {
    if (serverStatus === 'ready') {
      keepAliveInterval.current = setInterval(sendKeepAlive, 10 * 60 * 1000);
      wakeCheckInterval.current = setInterval(checkServerHealth, 5 * 60 * 1000);
    }

    return () => {
      if (keepAliveInterval.current) clearInterval(keepAliveInterval.current);
      if (wakeCheckInterval.current) clearInterval(wakeCheckInterval.current);
    };
  }, [serverStatus]);

  // Check server health
  const checkServerHealth = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${API_URL}/api/health`, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        if (serverStatus !== 'ready') {
          setServerStatus('ready');
          // Show welcome message based on selected language
          addWelcomeMessage();
        }
        return true;
      }
    } catch (error) {
      console.log('Health check failed:', error.message);
    }
    return false;
  };

  // Trigger wake-up on Render
  const triggerWakeUp = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const wakeResponse = await fetch(`${API_URL}/api/wake`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (wakeResponse.ok) {
        console.log('Wake signal sent successfully');
        return true;
      }
    } catch (error) {
      console.log('Wake endpoint failed:', error.message);
      
      try {
        const triggerResponse = await fetch(
          `${API_URL}/api/trigger-wake?token=${WAKE_TOKEN}`,
          { method: 'GET' }
        );
        
        if (triggerResponse.ok) {
          console.log('Trigger wake successful');
          return true;
        }
      } catch (e) {
        console.log('Trigger wake failed:', e.message);
      }
    }
    return false;
  };

  // Enhanced wake-up server with exponential backoff
  const wakeUpServer = async () => {
    setConnectionError(null);
    setWakeAttempts(prev => prev + 1);
    
    let retries = 0;
    const maxRetries = 5;
    const baseDelay = 3000;
    
    while (retries < maxRetries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const healthRes = await fetch(`${API_URL}/api/health`, { 
          method: 'GET',
          headers: { 'Cache-Control': 'no-cache' },
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        
        if (healthRes.ok) {
          const data = await healthRes.json();
          setServerStatus('ready');
          setWakeAttempts(0);
          addWelcomeMessage();
          return true;
        }
      } catch (error) {
        console.log(`Wake attempt ${retries + 1} failed:`, error.message);
        
        if (retries === 0) {
          setServerStatus('waking');
          await triggerWakeUp();
        }
        
        retries++;
        
        if (retries < maxRetries) {
          const waitTime = baseDelay * Math.pow(2, retries - 1);
          setConnectionError(`Wake attempt ${retries}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    setServerStatus('error');
    setConnectionError('Server wake failed after multiple attempts');
    return false;
  };

  // --- 🌍 NEW: Dynamic Welcome Message based on Language ---
  const addWelcomeMessage = () => {
    let welcomeText = '';
    
    switch(preferredLanguage) {
      case 'eng':
        welcomeText = "👋 Hello! I'm Rajkumar, your AI assistant. Which language would you prefer? (English/Hindi/Hinglish)";
        break;
      case 'hin':
        welcomeText = "👋 Namaste! Main Rajkumar hu, aapka AI assistant. Aap kis bhasha mein baat karna pasand karenge? (English/Hindi/Hinglish)";
        break;
      case 'hin-eng':
      default:
        welcomeText = "👋 Namaste! Main Rajkumar hu. 😊 Aap kis language mein comfortable ho? (English / Hindi / Hinglish)";
        break;
    }
    
    setMessages([{ 
      sender: 'ai', 
      text: welcomeText,
      timestamp: new Date().toISOString()
    }]);
  };

  // Initialize server connection
  useEffect(() => {
    wakeUpServer();
    
    return () => {
      if (keepAliveInterval.current) {
        clearInterval(keepAliveInterval.current);
      }
    };
  }, []);

  // Initialize session with language preference
  useEffect(() => {
    const initSession = async () => {
      if (serverStatus !== 'ready') return;
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${API_URL}/api/session/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preferredLanguage }), // Send language preference
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        const data = await response.json();
        setSessionId(data.sessionId);
      } catch (error) {
        console.error('Session init error:', error);
      }
    };
    
    initSession();
  }, [serverStatus, preferredLanguage]); // Re-init if language changes

  const sendMessage = async () => {
    if (!input.trim() || serverStatus !== 'ready' || loading) return;

    const userMessage = { 
      sender: 'user', 
      text: input.trim(),
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input.trim();
    setInput('');
    setLoading(true);
    setTypingIndicator(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: currentInput,
          sessionId,
          preferredLanguage // 🌍 Send language preference with every message
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      const data = await response.json();
      
      setTypingIndicator(false);
      
      if (response.ok) {
        setMessages(prev => [...prev, { 
          sender: 'ai', 
          text: data.reply,
          timestamp: new Date().toISOString(),
          responseTime: data.responseTime
        }]);
        
        if (data.sessionId) {
          setSessionId(data.sessionId);
        }
      } else {
        if (response.status === 503 || response.status === 504) {
          setServerStatus('waking');
          setMessages(prev => [...prev, { 
            sender: 'ai', 
            text: '😴 Server so raha hai. Wake up kar raha hu... 30 sec wait karo.',
            timestamp: new Date().toISOString()
          }]);
          wakeUpServer();
        } else {
          setMessages(prev => [...prev, { 
            sender: 'ai', 
            text: `❌ ${data.error || 'Kuch error hua'}`,
            timestamp: new Date().toISOString()
          }]);
        }
      }
    } catch (error) {
      setTypingIndicator(false);
      
      if (error.name === 'AbortError' || error.message.includes('Failed to fetch')) {
        setServerStatus('waking');
        setMessages(prev => [...prev, { 
          sender: 'ai', 
          text: '😴 Server so raha hai. Wake up kar raha hu... 30 sec wait karo.',
          timestamp: new Date().toISOString()
        }]);
        wakeUpServer();
      } else {
        console.error('Fetch error:', error);
        setMessages(prev => [...prev, { 
          sender: 'ai', 
          text: '❌ Connection error. Internet check karo.',
          timestamp: new Date().toISOString()
        }]);
      }
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const loadRecentLeads = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${API_URL}/api/leads/recent`, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data = await response.json();
      setRecentLeads(data.leads || []);
      setShowLeads(true);
    } catch (error) {
      console.error('Failed to load leads:', error);
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-IN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const manualWakeUp = () => {
    setServerStatus('waking');
    wakeUpServer();
  };

  // --- 🌍 Language Options Data ---
  const languageOptions = [
    { value: 'hin-eng', label: '🇮🇳 Hinglish (Mix)', emoji: '🗣️' },
    { value: 'eng', label: '🇬🇧 English', emoji: '🅰️' },
    { value: 'hin', label: '🇮🇳 Hindi (देवनागरी)', emoji: 'अ' },
  ];

  // Loading screens (unchanged logic, just keeping for completeness)
  if (serverStatus === 'checking') {
    return (
      <div className={`app ${theme}`}>
        <button onClick={toggleTheme} className="theme-toggle">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <div className="loading-screen">
          <div className="loader-wrapper">
            <div className="loader">
              <div className="loader-circle"></div>
              <div className="loader-circle"></div>
              <div className="loader-circle"></div>
            </div>
            <span className="loader-text">🤖</span>
          </div>
          <h2>AI Agent</h2>
          <p className="status-text">Server status check kar raha hu...</p>
          <div className="progress-bar">
            <div className="progress-fill"></div>
          </div>
          {connectionError && <p className="error-text small">{connectionError}</p>}
        </div>
      </div>
    );
  }

  if (serverStatus === 'waking') {
    return (
      <div className={`app ${theme}`}>
        <button onClick={toggleTheme} className="theme-toggle">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <div className="loading-screen">
          <div className="loader-wrapper pulse">
            <span className="sleep-emoji">😴</span>
          </div>
          <h2>AI Agent Soya Hua Hai</h2>
          <p className="status-text">Wake up ho raha hai... (30 sec max)</p>
          <div className="coffee-message">
            <span>☕</span>
            <p>Chai piyo, main aa raha hu!</p>
          </div>
          <div className="progress-bar">
            <div className="progress-fill waking" style={{ 
              width: `${(wakeAttempts / 5) * 100}%` 
            }}></div>
          </div>
          {connectionError && <p className="error-text small">{connectionError}</p>}
          <button onClick={manualWakeUp} className="retry-button-small">
            🔄 Retry Wake
          </button>
        </div>
      </div>
    );
  }

  if (serverStatus === 'error') {
    return (
      <div className={`app ${theme}`}>
        <button onClick={toggleTheme} className="theme-toggle">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <div className="error-screen">
          <div className="error-icon">
            <span>🔌</span>
            <div className="error-pulse"></div>
          </div>
          <h2>Connection Error</h2>
          <p>Server connect nahi ho pa raha</p>
          {connectionError && <p className="error-text">{connectionError}</p>}
          <button onClick={manualWakeUp} className="retry-button">
            <span>🔄</span> Retry Wake Up
          </button>
          <p className="small">Manual wake up try karo</p>
        </div>
      </div>
    );
  }

  // Normal chat UI
  return (
    <div className={`app ${theme}`}>
      <header className="app-header">
        <div className="header-left">
          <div className="logo-container">
            <span className="logo">🤖</span>
            <span className="status-badge"></span>
          </div>
          <h1>AI Agent</h1>
        </div>
        <div className="header-right">
          {/* --- 🌍 NEW: Language Selector Dropdown --- */}
          <div className="language-selector">
            <select 
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value)}
              className="lang-select"
              title="Select Language"
            >
              {languageOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.emoji} {opt.label}
                </option>
              ))}
            </select>
          </div>
          
          <button onClick={loadRecentLeads} className="icon-button" title="Recent Leads">
            <span>📋</span>
          </button>
          <button onClick={toggleTheme} className="icon-button">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      <div className="keep-alive-indicator" title="Server is awake">
        <span className="alive-dot"></span>
      </div>

      {showLeads && (
        <div className="modal-overlay" onClick={() => setShowLeads(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Recent Leads 📋</h3>
              <button className="modal-close" onClick={() => setShowLeads(false)}>×</button>
            </div>
            <div className="modal-body">
              {recentLeads.length > 0 ? (
                <div className="leads-grid">
                  {recentLeads.map((lead, idx) => (
                    <div key={idx} className="lead-card">
                      <div className="lead-card-header">
                        <strong>{lead.name}</strong>
                        <span className="lead-time">{formatTime(lead.timestamp)}</span>
                      </div>
                      <div className="lead-details">
                        <span className="lead-phone">📞 {lead.phone}</span>
                        {lead.email !== 'Not provided' && (
                          <span className="lead-email">✉️ {lead.email}</span>
                        )}
                        <span className="lead-interest">🏷️ {lead.interest}</span>
                      </div>
                      <p className="lead-message">{lead.message}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-leads">
                  <span>📭</span>
                  <p>No leads yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="chat-container">
        <div className="messages-container">
          {messages.map((msg, index) => (
            <div 
              key={index} 
              className={`message ${msg.sender}`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="message-bubble">
                <div className="message-header">
                  <span className="avatar">
                    {msg.sender === 'user' ? '👤' : '🤖'}
                  </span>
                  <span className="name">
                    {msg.sender === 'user' ? 'You' : 'AI Agent'}
                  </span>
                  <span className="time">{formatTime(msg.timestamp)}</span>
                </div>
                <div className="message-content">
                  {msg.text.split('\n').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
                {msg.responseTime && (
                  <span className="response-badge">{msg.responseTime}ms</span>
                )}
              </div>
            </div>
          ))}
          
          {typingIndicator && (
            <div className="message ai typing">
              <div className="message-bubble">
                <div className="message-header">
                  <span className="avatar">🤖</span>
                  <span className="name">AI Agent</span>
                </div>
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          <div className="input-container">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder={
                preferredLanguage === 'hin' ? "Apna message likhein..." :
                preferredLanguage === 'eng' ? "Type your message..." :
                "Apna message type karein..."
              }
              disabled={loading}
              className="chat-input"
            />
            <button 
              onClick={sendMessage} 
              disabled={loading || !input.trim()}
              className="send-button"
            >
              {loading ? (
                <div className="button-loader"></div>
              ) : (
                <span>➤</span>
              )}
            </button>
          </div>
          <div className="input-hint">
            <span>
              {preferredLanguage === 'hin' ? "Bhejne ke liye Enter dabayein ↵" :
               preferredLanguage === 'eng' ? "Press Enter ↵ to send" :
               "Send karne ke liye Enter ↵ dabayein"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;