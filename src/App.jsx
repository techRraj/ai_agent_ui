/**
 * 🤖 AI Chatbot Frontend - Rajkumar's AI Agent
 * Features: Language Preference + Wake System + Dark Mode + Lead Management
 * Author: Rajkumar Chourasiya
 * Framework: React + Vite
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

function App() {
  // ===== State Management =====
  const [serverStatus, setServerStatus] = useState('checking'); // checking | waking | ready | error
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
  
  // 🌍 Language Preference State
  const [preferredLanguage, setPreferredLanguage] = useState('hin-eng');
  
  // ===== Refs =====
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const keepAliveInterval = useRef(null);
  const wakeCheckInterval = useRef(null);
  
  // ===== Environment Variables =====
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const WAKE_TOKEN = import.meta.env.VITE_WAKE_TOKEN || 'change-me';

  // ===== Utility Functions =====
  
  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Auto-scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, typingIndicator, scrollToBottom]);

  // Load theme & language from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    const savedLang = localStorage.getItem('preferredLanguage') || 'hin-eng';
    
    setTheme(savedTheme);
    setPreferredLanguage(savedLang);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  // Save language preference when changed
  useEffect(() => {
    localStorage.setItem('preferredLanguage', preferredLanguage);
  }, [preferredLanguage]);

  // Toggle dark/light theme
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  // ===== Server Wake System =====
  
  // Keep-alive ping to prevent Render sleep
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
      console.log('Keep-alive failed:', error.message);
      if (serverStatus === 'ready') {
        setServerStatus('checking');
        wakeUpServer();
      }
    }
  };

  // Start keep-alive when server is ready
  useEffect(() => {
    if (serverStatus === 'ready') {
      // Ping every 10 minutes (Render sleeps after 15 mins)
      keepAliveInterval.current = setInterval(sendKeepAlive, 10 * 60 * 1000);
      // Health check every 5 minutes
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
        console.log('✅ Wake signal sent');
        return true;
      }
    } catch (error) {
      console.log('Wake endpoint failed:', error.message);
      
      // Fallback: try secure trigger endpoint
      try {
        const triggerResponse = await fetch(
          `${API_URL}/api/trigger-wake?token=${WAKE_TOKEN}`,
          { method: 'GET' }
        );
        
        if (triggerResponse.ok) {
          console.log('✅ Trigger wake successful');
          return true;
        }
      } catch (e) {
        console.log('Trigger wake failed:', e.message);
      }
    }
    return false;
  };

  // Wake up server with exponential backoff
  const wakeUpServer = async () => {
    setConnectionError(null);
    setWakeAttempts(prev => prev + 1);
    
    let retries = 0;
    const maxRetries = 5;
    const baseDelay = 3000; // 3 seconds
    
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
          setServerStatus('ready');
          setWakeAttempts(0);
          addWelcomeMessage();
          return true;
        }
      } catch (error) {
        console.log(`Wake attempt ${retries + 1} failed:`, error.message);
        
        // First failure: trigger wake
        if (retries === 0) {
          setServerStatus('waking');
          await triggerWakeUp();
        }
        
        retries++;
        
        if (retries < maxRetries) {
          // Exponential backoff: 3s → 6s → 12s → 24s → 48s
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

  // 🌍 Dynamic welcome message based on language
  const addWelcomeMessage = () => {
    const welcomeMessages = {
      'eng': "👋 Hello! I'm Rajkumar, your AI assistant. How can I help you today?",
      'hin': "👋 नमस्ते! मैं राजकुमार हूँ, आपका AI असिस्टेंट। मैं आपकी कैसे मदद कर सकता हूँ?",
      'hin-eng': "👋 Namaste! Main Rajkumar hu, aapka AI assistant. 😊 Kaise help kar sakta hu?"
    };
    
    setMessages([{ 
      sender: 'ai', 
      text: welcomeMessages[preferredLanguage] || welcomeMessages['hin-eng'],
      timestamp: new Date().toISOString()
    }]);
  };

  // Initialize server connection on mount
  useEffect(() => {
    wakeUpServer();
    
    return () => {
      if (keepAliveInterval.current) {
        clearInterval(keepAliveInterval.current);
      }
    };
  }, []);

  // Initialize session when server is ready or language changes
  useEffect(() => {
    const initSession = async () => {
      if (serverStatus !== 'ready') return;
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${API_URL}/api/session/init`, {
          method: 'POST',  // ✅ IMPORTANT: POST method
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preferredLanguage }), // Send language preference
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Session init failed');
        }
        
        setSessionId(data.sessionId);
        console.log('✅ Session initialized:', data.sessionId);
        
      } catch (error) {
        console.error('❌ Session init error:', error.message);
        setConnectionError('Failed to start session');
      }
    };
    
    initSession();
  }, [serverStatus, preferredLanguage]);

  // ===== Chat Functions =====
  
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
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 sec timeout

      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',  // ✅ IMPORTANT: POST method
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: currentInput,
          sessionId,
          preferredLanguage // 🌍 Send language preference
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
        // Handle specific error cases
        if (response.status === 401) {
          setMessages(prev => [...prev, { 
            sender: 'ai', 
            text: '🔐 API key error. Please contact developer.',
            timestamp: new Date().toISOString()
          }]);
        } else if (response.status === 429) {
          setMessages(prev => [...prev, { 
            sender: 'ai', 
            text: '⏱️ Rate limit reached. Please wait a moment and try again.',
            timestamp: new Date().toISOString()
          }]);
        } else if (response.status === 503 || response.status === 504) {
          setServerStatus('waking');
          setMessages(prev => [...prev, { 
            sender: 'ai', 
            text: '😴 Server sleeping. Waking up... Please wait 30 seconds.',
            timestamp: new Date().toISOString()
          }]);
          wakeUpServer();
        } else {
          setMessages(prev => [...prev, { 
            sender: 'ai', 
            text: `❌ ${data.error || 'Something went wrong'}`,
            timestamp: new Date().toISOString()
          }]);
        }
      }
    } catch (error) {
      setTypingIndicator(false);
      
      if (error.name === 'AbortError' || error.message.includes('Failed to fetch')) {
        // Network error or server sleeping
        setServerStatus('waking');
        setMessages(prev => [...prev, { 
          sender: 'ai', 
          text: '😴 Server so raha hai. Wake up kar raha hu... 30 sec wait karein.',
          timestamp: new Date().toISOString()
        }]);
        wakeUpServer();
      } else {
        console.error('❌ Fetch error:', error);
        setMessages(prev => [...prev, { 
          sender: 'ai', 
          text: '❌ Connection error. Please check your internet.',
          timestamp: new Date().toISOString()
        }]);
      }
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  // Load recent leads (admin feature)
  const loadRecentLeads = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${API_URL}/api/leads/recent`, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const data = await response.json();
      
      if (response.ok) {
        setRecentLeads(data.leads || []);
        setShowLeads(true);
      } else {
        console.error('Failed to load leads:', data.error);
      }
    } catch (error) {
      console.error('❌ Load leads error:', error);
    }
  };

  // Format timestamp to readable time
  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-IN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Manual wake up button handler
  const manualWakeUp = () => {
    setServerStatus('waking');
    wakeUpServer();
  };

  // Handle Enter key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 🌍 Language options for dropdown
  const languageOptions = [
    { value: 'hin-eng', label: '🇮🇳 Hinglish', emoji: '🗣️' },
    { value: 'eng', label: '🇬🇧 English', emoji: '🅰️' },
    { value: 'hin', label: '🇮🇳 हिंदी', emoji: 'अ' },
  ];

  // ===== Dynamic Placeholder based on language =====
  const getInputPlaceholder = () => {
    const placeholders = {
      'eng': 'Type your message...',
      'hin': 'अपना संदेश लिखें...',
      'hin-eng': 'Apna message type karein...'
    };
    return placeholders[preferredLanguage] || placeholders['hin-eng'];
  };

  const getHintText = () => {
    const hints = {
      'eng': 'Press Enter ↵ to send',
      'hin': 'भेजने के लिए Enter ↵ दबाएं',
      'hin-eng': 'Send karne ke liye Enter ↵ dabayein'
    };
    return hints[preferredLanguage] || hints['hin-eng'];
  };

  // ===== Loading/Error Screens =====
  
  if (serverStatus === 'checking') {
    return (
      <div className={`app ${theme}`}>
        <button onClick={toggleTheme} className="theme-toggle" aria-label="Toggle theme">
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
          <p className="status-text">Server check kar raha hu...</p>
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
        <button onClick={toggleTheme} className="theme-toggle" aria-label="Toggle theme">
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
            <div 
              className="progress-fill waking" 
              style={{ width: `${(wakeAttempts / 5) * 100}%` }}
            ></div>
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
        <button onClick={toggleTheme} className="theme-toggle" aria-label="Toggle theme">
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
          <p className="small">Manual wake up try karein</p>
        </div>
      </div>
    );
  }

  // ===== Main Chat UI (Server Ready) =====
  return (
    <div className={`app ${theme}`}>
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo-container">
            <span className="logo" role="img" aria-label="AI Robot">🤖</span>
            <span className="status-badge" aria-label="Server online"></span>
          </div>
          <h1>AI Agent</h1>
        </div>
        <div className="header-right">
          {/* 🌍 Language Selector */}
          <div className="language-selector">
            <select 
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value)}
              className="lang-select"
              aria-label="Select language"
              title="Choose your preferred language"
            >
              {languageOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.emoji} {opt.label}
                </option>
              ))}
            </select>
          </div>
          
          <button 
            onClick={loadRecentLeads} 
            className="icon-button" 
            title="View Recent Leads"
            aria-label="View leads"
          >
            <span role="img" aria-label="Leads">📋</span>
          </button>
          <button 
            onClick={toggleTheme} 
            className="icon-button"
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      {/* Keep-alive indicator */}
      <div className="keep-alive-indicator" title="Server is awake" aria-hidden="true">
        <span className="alive-dot"></span>
      </div>

      {/* Leads Modal */}
      {showLeads && (
        <div className="modal-overlay" onClick={() => setShowLeads(false)} role="dialog" aria-modal="true">
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Recent Leads 📋</h3>
              <button 
                className="modal-close" 
                onClick={() => setShowLeads(false)}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {recentLeads.length > 0 ? (
                <div className="leads-grid" role="list">
                  {recentLeads.map((lead, idx) => (
                    <div key={idx} className="lead-card" role="listitem">
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
                  <span role="img" aria-label="No messages">📭</span>
                  <p>No leads yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div className="chat-container">
        <div className="messages-container" role="log" aria-live="polite">
          {messages.map((msg, index) => (
            <div 
              key={index} 
              className={`message ${msg.sender}`}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div className="message-bubble">
                <div className="message-header">
                  <span className="avatar" role="img" aria-label={msg.sender === 'user' ? 'You' : 'AI'}>
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
          
          {/* Typing indicator */}
          {typingIndicator && (
            <div className="message ai typing">
              <div className="message-bubble">
                <div className="message-header">
                  <span className="avatar" role="img" aria-label="AI">🤖</span>
                  <span className="name">AI Agent</span>
                </div>
                <div className="typing-indicator" aria-label="AI is typing">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="input-area">
          <div className="input-container">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={getInputPlaceholder()}
              disabled={loading}
              className="chat-input"
              aria-label="Type your message"
              autoComplete="off"
            />
            <button 
              onClick={sendMessage} 
              disabled={loading || !input.trim()}
              className="send-button"
              aria-label="Send message"
            >
              {loading ? (
                <div className="button-loader" aria-label="Loading"></div>
              ) : (
                <span role="img" aria-label="Send">➤</span>
              )}
            </button>
          </div>
          <div className="input-hint">
            <span>{getHintText()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;