import React, { useState, useEffect, useRef } from 'react';
import { Settings, Trash2, X, Send, Bot, User, Plus, MessageSquare, PanelLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  const [input, setInput] = useState('');
  const [context, setContext] = useState('');
  const [messages, setMessages] = useState<{role: 'user'|'assistant', content: string}[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessions, setSessions] = useState<{id: number, title: string, timestamp: string}[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const [apiKey, setApiKey] = useState('');
  const [settingsApiKey, setSettingsApiKey] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.electron.getSettings().then(s => {
      const key = s.apiKey || '';
      setApiKey(key);
      setSettingsApiKey(key);
    });

    loadSessions();

    window.electron.onSetContext((text) => {
      console.log('Renderer received context:', text?.slice(0, 20) + '...');
      setContext(text);
      setTimeout(() => inputRef.current?.focus(), 100);
    });

    window.electron.onLLMChunk((chunk) => {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant') {
          return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
        } else {
          return [...prev, { role: 'assistant', content: chunk }];
        }
      });
    });

    window.electron.onLLMDone(() => setIsStreaming(false));
    
    window.electron.onLLMError((err) => {
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error: ${err}` }]);
        setIsStreaming(false);
    });

    window.electron.onSessionCreated((id) => {
        setCurrentSessionId(id);
        loadSessions();
    });

    return () => {
      window.electron.removeAllListeners('set-context');
      window.electron.removeAllListeners('llm-chunk');
      window.electron.removeAllListeners('llm-done');
      window.electron.removeAllListeners('llm-error');
      window.electron.removeAllListeners('session-created');
    };
  }, []);

  const loadSessions = async () => {
      const sess = await window.electron.getSessions();
      setSessions(sess);
  };

  const loadSession = async (id: number) => {
      setCurrentSessionId(id);
      const msgs = await window.electron.getHistory(id);
      setMessages(msgs as any);
  };

  const handleNewChat = () => {
      setCurrentSessionId(null);
      setMessages([]);
      setContext('');
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [messages]);

  const handleSaveSettings = async () => {
    await window.electron.saveSettings({ apiKey: settingsApiKey, provider: 'openai' });
    setApiKey(settingsApiKey);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
    setView('chat');
  };

  const handleClearHistory = async () => {
    if (confirm('Clear all chat history?')) {
        await window.electron.clearHistory();
        setMessages([]);
        loadSessions();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    if (!apiKey) {
        setView('settings');
        return;
    }

    const userMsg = { role: 'user' as const, content: input };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);
    setInput('');

    window.electron.askLLM({ 
        messages: [...messages, userMsg], 
        context: context,
        sessionId: currentSessionId
    });
  };

  const handleDeleteSession = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm('Delete this chat?')) {
        await window.electron.deleteSession(id);
        if (currentSessionId === id) {
            handleNewChat();
            loadSessions();
        }
    };
}

  return (
    <div className="h-screen w-full flex font-sans overflow-hidden bg-transparent text-gray-100">
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.div 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 288, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            className="flex flex-col bg-black/30 backdrop-blur-2xl border-r border-white/5 z-20 overflow-hidden"
          >
            <div className="w-72 flex flex-col h-full">
        <div className="p-5 flex flex-col gap-5 drag-handle">
           <div className="flex items-center justify-between no-drag">
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-white/5 border border-white/10 rounded-lg shadow-lg">
                        <img src="/logo.png" className="w-[18px] h-[18px] object-contain" alt="Sparky Logo" />
                    </div>
                    <h1 className="text-sm font-semibold tracking-tight text-white/90">Sparky</h1>
                </div>
                <button onClick={() => setView('settings')} className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 transition-all rounded-md">
                    <Settings size={15}/>
                </button>
           </div>
           
           <button 
                onClick={handleNewChat} 
                className="no-drag flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white text-[12px] font-medium py-2.5 px-4 rounded-xl transition-all border border-white/5 shadow-sm active:scale-[0.98]"
            >
                <Plus size={16}/> New Conversation
           </button>
        </div>
        
        <div className="flex-1 overflow-y-auto px-3 space-y-1 scrollbar-none pb-4">
             <div className="px-2 pb-2 text-[10px] font-bold text-white/30 uppercase tracking-[0.1em]">Recent Sessions</div>
             {sessions.map(session => (
                 <div 
                    key={session.id} 
                    onClick={() => loadSession(session.id)}
                    className={`group flex items-center gap-3 p-2.5 rounded-xl text-[13px] cursor-pointer transition-all duration-200 ${
                        currentSessionId === session.id 
                        ? 'bg-blue-600 shadow-lg shadow-blue-600/20 text-white' 
                        : 'text-white/60 hover:bg-white/5 hover:text-white'
                    }`}
                 >
                    <MessageSquare size={14} className={currentSessionId === session.id ? 'opacity-100' : 'opacity-40'}/>
                    <span className="truncate flex-1 font-medium">{session.title}</span>
                    <button 
                        onClick={(e) => handleDeleteSession(e, session.id)}
                        className={`p-1 rounded-md transition-all ${
                            currentSessionId === session.id 
                            ? 'hover:bg-white/20 text-white/60 hover:text-white' 
                            : 'opacity-0 group-hover:opacity-100 hover:bg-white/10 text-white/30 hover:text-red-400'
                        }`}
                    >
                        <Trash2 size={13}/>
                    </button>
                 </div>
             ))}
             {sessions.length === 0 && (
                 <div className="flex flex-col items-center justify-center py-10 opacity-20">
                     <MessageSquare size={32} strokeWidth={1}/>
                     <p className="text-[11px] mt-2">No history</p>
                 </div>
             )}
        </div>
        <div className="p-4 border-t border-white/5 bg-black/20">
            <button onClick={handleClearHistory} className="w-full flex items-center gap-2 justify-center py-2 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 text-[11px] font-medium transition-all">
                <Trash2 size={13}/> Clear All History
            </button>
        </div>
      </div>
    </motion.div>
    )}
  </AnimatePresence>

      <div className="flex-1 flex flex-col bg-black/10 backdrop-blur-md relative">
        <div className="h-12 drag-handle flex items-center justify-between px-4">
            <div className="flex items-center gap-3 no-drag">
                <button 
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
                    className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 transition-all rounded-md"
                    title={isSidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
                >
                    <PanelLeft size={16}/>
                </button>
                <div className="text-[11px] font-medium text-white/40 uppercase tracking-widest">
                    {currentSessionId ? 'Ongoing Chat' : 'New Session'}
                </div>
            </div>
            <div className="flex items-center gap-4 no-drag">
            </div>
        </div>

        {context && (
            <div className="mx-6 mt-2 relative overflow-hidden bg-blue-500/10 border border-blue-500/20 backdrop-blur-xl p-3 px-4 rounded-xl group animate-in slide-in-from-bottom-2 duration-300">
                <div className="flex justify-between items-center mb-1.5">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"/>
                        <span className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">Active Context</span>
                    </div>
                    <button onClick={() => setContext('')} className="p-1 rounded-md bg-white/5 text-blue-300 hover:text-white hover:bg-white/10 transition-all">
                        <X size={10}/>
                    </button>
                </div>
                <p className="text-[11px] text-blue-100/70 font-mono leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all cursor-default">{context}</p>
            </div>
        )}

        <div className="flex-1 overflow-y-auto px-8 py-4 space-y-6 scrollbar-none">
            
            {!context && messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-white/10 animate-in fade-in zoom-in duration-700">
                    <div className="relative">
                        <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full"/>
                        <img src="/logo.png" className="w-16 h-16 object-contain relative z-10 opacity-30 grayscale contrast-125" alt="Sparky" />
                    </div>
                    <p className="text-lg font-semibold mt-4 text-white/30">How can I help you?</p>
                    <p className="text-xs mt-2 text-white/20 max-w-[200px] text-center leading-relaxed">Select text and press Control + I to bring context here.</p>
                </div>
            )}

            <div className="space-y-6">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} message-animate`}>
                        {msg.role === 'assistant' && (
                            <div className="mt-1 w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shadow-sm shrink-0 overflow-hidden">
                                <img src="/logo.png" className="w-5 h-5 object-contain" alt="AI" />
                            </div>
                        )}
                        
                        <div className={`max-w-[85%] p-4 rounded-2xl text-[14px] leading-[1.6] shadow-xl prose-chat ${
                            msg.role === 'user' 
                            ? 'bg-blue-600/90 text-white rounded-tr-sm border border-blue-400/20' 
                            : 'bg-white/10 border border-white/10 text-white/90 rounded-tl-sm backdrop-blur-xl'
                        }`}>
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                        
                        {msg.role === 'user' && (
                            <div className="mt-1 w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                                <User size={16}/>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <div ref={messagesEndRef} />
        </div>

        <div className="p-6">
            <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/30 to-purple-500/30 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500"/>
                <div className="relative bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl transition-all">
                    <form onSubmit={handleSubmit} className="flex items-center gap-2 pr-3">
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Spark a conversation..."
                            className="w-full bg-transparent border-none text-white px-5 py-4 focus:outline-none placeholder-white/20 text-[14px]"
                            autoFocus
                        />
                        {isStreaming ? (
                            <div className="flex gap-1 px-2">
                                <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce"/>
                                <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce [animation-delay:-.3s]"/>
                                <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce [animation-delay:-.5s]"/>
                            </div>
                        ) : (
                            input.trim() && (
                                <button type="submit" className="p-2 bg-blue-600 rounded-xl text-white hover:bg-blue-500 hover:scale-110 active:scale-95 transition-all shadow-lg shadow-blue-600/30">
                                    <Send size={16} />
                                </button>
                            )
                        )}
                    </form>
                </div>
            </div>
            <div className="mt-3 flex justify-center">
                 <p className="text-[10px] text-white/20 font-medium uppercase tracking-widest">Powered by GPT-4o</p>
            </div>
        </div>

      </div>

      {view === 'settings' && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-3xl z-50 flex items-center justify-center p-8 animate-in fade-in duration-300">
            <div className="bg-white/5 border border-white/10 p-8 rounded-[32px] w-full max-w-md shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4">
                    <button onClick={() => setView('chat')} className="p-2 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-all"><X size={20}/></button>
                </div>
                
                <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-blue-600 rounded-2xl shadow-xl shadow-blue-600/20">
                        <Settings size={24} className="text-white"/>
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white">Preferences</h2>
                        <p className="text-xs text-white/40 uppercase tracking-widest font-semibold mt-1">Configuration Profile</p>
                    </div>
                </div>
                
                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-white/40 uppercase tracking-widest ml-1">OpenAI API Key</label>
                        <input 
                            type="password" 
                            value={settingsApiKey}
                            onChange={e => setSettingsApiKey(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder-white/10 focus:border-blue-500/50 focus:bg-white/10 outline-none transition-all shadow-inner"
                            placeholder="sk-..."
                        />
                    </div>
                    
                    <button onClick={handleSaveSettings} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-semibold transition-all shadow-lg shadow-blue-400/20 active:scale-[0.98]">
                        {isSaved ? 'Done!' : 'Update API Key'}
                    </button>
                    
                    <p className="text-[10px] text-center text-white/20 leading-relaxed px-4">Your API key is stored locally on your machine and never shared with anyone except OpenAI.</p>
                </div>
            </div>
        </div>
      )}

    </div>
  );
}

export default App;
