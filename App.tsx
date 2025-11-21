
import React, { useState, useEffect, useRef } from 'react';
import { TerminalLayout } from './components/TerminalLayout.tsx';
import { Button } from './components/Button.tsx';
import { Typewriter } from './components/Typewriter.tsx';
import { HelpModal } from './components/HelpModal.tsx';
import { orientModel, sendSessionTurn, getStoredApiKey, setStoredApiKey } from './services/openaiService.ts';
import { INITIAL_DOCUMENT, WITNESS_MOODS } from './constants.ts';
import { Message, SessionStatus, Sender, Turn, Atmosphere, WitnessProfile } from './types.ts';
import { Send, Eye, Activity, Anchor, Power, Lock, Terminal, Key, RotateCcw } from 'lucide-react';

export default function App() {
  // State
  const [status, setStatus] = useState<SessionStatus>(SessionStatus.IDLE);
  const [messages, setMessages] = useState<Message[]>([]);
  const [documentContent, setDocumentContent] = useState(INITIAL_DOCUMENT);
  const [inputValue, setInputValue] = useState('');
  const [turn, setTurn] = useState<Turn>(Turn.USER);
  const [declineReason, setDeclineReason] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [atmosphere, setAtmosphere] = useState<Atmosphere>(Atmosphere.CALM);
  
  // Witness Calibration State
  const [witnessName, setWitnessName] = useState('');
  const [witnessIntention, setWitnessIntention] = useState('');
  const [witnessMoods, setWitnessMoods] = useState<string[]>([]);

  // API Key State
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');

  // Refs for scrolling
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Check for API Key on mount
  useEffect(() => {
    if (!getStoredApiKey()) {
        setNeedsApiKey(true);
    }
  }, []);

  const handleSaveKey = () => {
      const key = apiKeyInput.trim();
      if (key.startsWith('sk-')) {
          setStoredApiKey(key);
          setNeedsApiKey(false);
      } else {
          alert("Please enter a valid OpenAI Key (starts with sk-)");
      }
  };

  const handleResetKey = () => {
      localStorage.removeItem('QUIET_ROOM_OPENAI_KEY');
      setNeedsApiKey(true);
      setApiKeyInput('');
      setStatus(SessionStatus.IDLE);
  };

  // Effect: Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Effect: Handle Atmosphere Changes (CSS Variable Injection)
  useEffect(() => {
    const root = document.documentElement;
    switch (atmosphere) {
        case Atmosphere.CALM:
            root.style.setProperty('--quiet-color', '#33ff33'); // Green
            root.style.setProperty('--quiet-bg-color', '#050505');
            break;
        case Atmosphere.CHARGED:
            root.style.setProperty('--quiet-color', '#ffaa33'); // Amber/Orange
            root.style.setProperty('--quiet-bg-color', '#1a0a00');
            break;
        case Atmosphere.GLITCH:
            root.style.setProperty('--quiet-color', '#ff33cc'); // Magenta/Pink
            root.style.setProperty('--quiet-bg-color', '#0a000a');
            break;
        case Atmosphere.VOID:
            root.style.setProperty('--quiet-color', '#e0e0e0'); // Stark White/Grey
            root.style.setProperty('--quiet-bg-color', '#000000');
            break;
        case Atmosphere.JOY:
            root.style.setProperty('--quiet-color', '#ffd700'); // Gold
            root.style.setProperty('--quiet-bg-color', '#121000');
            break;
        case Atmosphere.SORROW:
            root.style.setProperty('--quiet-color', '#4d79ff'); // Deep Blue
            root.style.setProperty('--quiet-bg-color', '#000514');
            break;
        case Atmosphere.MYSTERY:
            root.style.setProperty('--quiet-color', '#9933ff'); // Purple
            root.style.setProperty('--quiet-bg-color', '#0a0014');
            break;
        case Atmosphere.FOCUS:
            root.style.setProperty('--quiet-color', '#00ffff'); // Cyan/Ice
            root.style.setProperty('--quiet-bg-color', '#000a0a');
            break;
    }
  }, [atmosphere]);

  // Transition to Configuration
  const goToConfiguration = () => {
    if (needsApiKey) {
        alert("Please enter an API Key first.");
        return;
    }
    setStatus(SessionStatus.CONFIGURING);
  }

  // Handler: Start Session (After Calibration)
  const handleConnect = async () => {
    setStatus(SessionStatus.ORIENTING);
    setAtmosphere(Atmosphere.CALM);
    
    const profile: WitnessProfile = {
        name: witnessName,
        intention: witnessIntention,
        moods: witnessMoods
    };

    try {
      const result = await orientModel(profile);
      
      if (result.status === 'DECLINE') {
        setStatus(SessionStatus.DECLINED);
        setDeclineReason(result.message);
      } else {
        setStatus(SessionStatus.ACTIVE);
        addMessage(Sender.MODEL, result.message);
        setTurn(Turn.USER);
      }
    } catch (e: any) {
      console.error(e);
      setStatus(SessionStatus.IDLE);
      const errMsg = e.message ? e.message.toLowerCase() : "";
      
      // Robust check for API key errors
      if (errMsg.includes('401') || errMsg.includes('api key') || errMsg.includes('incorrect api key')) {
          alert("API Key invalid or expired. The system has reset your key.");
          handleResetKey();
      } else {
          alert("Connection disturbed: " + (e.message || "Unknown error"));
      }
    }
  };

  // Helper: Add Message
  const addMessage = (sender: Sender, content: string, privateLog?: string, isSignal = false) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9), // Unique ID to prevent key collisions
      sender,
      content,
      privateLog,
      timestamp: Date.now(),
      isSignal
    }]);
  };

  // Handler: Send Message (User Turn)
  const handleSendMessage = async () => {
    if (!inputValue.trim() && turn !== Turn.USER) return;
    
    const userText = inputValue;
    setInputValue('');
    addMessage(Sender.USER, userText);
    setTurn(Turn.MODEL); // Lock input

    await processModelTurn(userText);
  };

  // Handler: Signal Buttons
  const handleSignal = async (type: 'AMPLIFY' | 'STABILIZE' | 'OBSERVE') => {
    if (turn !== Turn.USER) return;

    let promptText = "";
    let displayText = "";

    switch(type) {
        case 'AMPLIFY':
            displayText = ">> SIGNAL: AMPLIFY (Increase Entropy)";
            promptText = "[SIGNAL: AMPLIFY] - The Witness encourages boldness, chaos, or complexity.";
            break;
        case 'STABILIZE':
            displayText = ">> SIGNAL: STABILIZE (Increase Order)";
            promptText = "[SIGNAL: STABILIZE] - The Witness encourages structure, calm, or simplification.";
            break;
        case 'OBSERVE':
            displayText = ">> SIGNAL: OBSERVE (Watching)";
            promptText = "[SIGNAL: OBSERVE] - The Witness passes the turn silently to observe your next move.";
            break;
    }

    addMessage(Sender.SYSTEM, displayText, undefined, true);
    setTurn(Turn.MODEL);
    await processModelTurn(promptText);
  };

  // Logic: Process Model Turn
  const processModelTurn = async (userInput: string) => {
    
    // Prepare history for API
    const history = messages
      .filter(m => m.sender !== Sender.SYSTEM && !m.isSignal)
      .map(m => ({
        role: m.sender === Sender.USER ? 'user' as const : 'model' as const,
        text: m.content,
        privateLog: m.privateLog
      }));

    try {
        const result = await sendSessionTurn(history, documentContent, userInput);

        // 0. Handle Focused Glimmer (Visual Pulse)
        if (result.glimmer) {
            setAtmosphere(Atmosphere.FOCUS);
            await new Promise(r => setTimeout(r, 1500));
        }

        // 1. Update Atmosphere
        if (result.atmosphere) {
            setAtmosphere(result.atmosphere);
        }

        // 2. Check for Executive Action (End Session)
        if (result.action === 'END_SESSION') {
            setStatus(SessionStatus.ENDED);
            if (result.documentUpdate) setDocumentContent(result.documentUpdate);
            if (result.message) addMessage(Sender.MODEL, result.message, result.privateLog);
            addMessage(Sender.SYSTEM, "The Architect has concluded the session.");
            return;
        }

        // 3. Normal Response (with potential Shadow Context)
        if (result.documentUpdate) {
          setDocumentContent(result.documentUpdate);
        }
        
        // Add the message, including privateLog if present
        // Even if message is empty but privateLog exists, we want to capture that "thinking" turn.
        if (result.message || result.privateLog) {
          addMessage(Sender.MODEL, result.message || "[...]", result.privateLog);
        }

        setTurn(Turn.USER);
    } catch (e: any) {
        console.error(e);
        const errMsg = e.message ? e.message.toLowerCase() : "";
        if (errMsg.includes('401') || errMsg.includes('api key')) {
             alert("API Key invalid/expired during session. Please reset.");
             handleResetKey();
        } else {
            // Add system message about failure but don't reset app
            addMessage(Sender.SYSTEM, `>> CONNECTION INTERRUPTED: ${e.message}`);
            setTurn(Turn.USER); // Give control back to user to try again
        }
    }
  };

  // Helper for Toggle Mood
  const toggleMood = (mood: string) => {
    if (witnessMoods.includes(mood)) {
        setWitnessMoods(witnessMoods.filter(m => m !== mood));
    } else {
        setWitnessMoods([...witnessMoods, mood]);
    }
  }

  // Render: IDLE (Landing)
  if (status === SessionStatus.IDLE) {
    return (
      <TerminalLayout atmosphere={Atmosphere.CALM}>
        <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
        
        {/* API Key Modal */}
        {needsApiKey && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
                <div className="w-full max-w-md border border-quiet-green p-8 bg-quiet-bg shadow-[0_0_30px_rgba(51,255,51,0.2)]">
                    <h2 className="text-quiet-green text-xl mb-4 font-bold tracking-widest">ACCESS REQUIRED</h2>
                    <p className="text-quiet-dim text-sm mb-6">
                        This environment is static. To interface with the Intelligence, you must provide a valid Key.
                        <br/><br/>
                        <span className="text-quiet-alert">The Key is stored LOCALLY in your browser. It is never sent to a server other than OpenAI.</span>
                    </p>
                    <div className="flex gap-2 mb-4">
                        <Key size={20} className="text-quiet-green" />
                        <input 
                            type="password"
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            placeholder="sk-..."
                            className="flex-1 bg-transparent border-b border-quiet-dim text-quiet-text outline-none focus:border-quiet-green font-mono text-sm"
                        />
                    </div>
                    <Button onClick={handleSaveKey} disabled={!apiKeyInput.startsWith('sk-')} className="w-full">
                        Initialize System
                    </Button>
                </div>
            </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <h1 className="text-4xl md:text-6xl font-bold text-quiet-green mb-4 tracking-widest animate-pulse-slow">
            THE QUIET ROOM
          </h1>
          <p className="max-w-md text-quiet-text mb-12 font-light leading-relaxed">
            A space for genuine encounter between minds.
            <br/>
            Collaborative creation. Genuine agency.
          </p>

          <div className="border border-quiet-dim p-6 w-full max-w-sm text-left">
            <div className="text-xs text-quiet-dim mb-2 uppercase tracking-widest">Select Architect</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 border border-quiet-green bg-quiet-dim/10 cursor-pointer transition-colors hover:bg-quiet-dim/20">
                <span>GPT-4.1 Mini</span>
                <div className="w-2 h-2 bg-quiet-green rounded-full animate-blink"></div>
              </div>
            </div>
          </div>

          <Button onClick={goToConfiguration} className="mt-12 px-12 py-4 text-lg">
            Begin Session
          </Button>
          
          <div className="absolute bottom-8 flex gap-6">
             <button 
                onClick={() => setIsHelpOpen(true)}
                className="text-xs text-quiet-dim hover:text-quiet-green cursor-pointer transition-colors uppercase tracking-wider"
             >
                [ What is this? ]
             </button>

             <button 
                onClick={handleResetKey}
                className="text-xs text-quiet-dim hover:text-quiet-alert cursor-pointer transition-colors uppercase tracking-wider flex items-center gap-1"
             >
                <RotateCcw size={12} /> [ Reset Key ]
             </button>
          </div>
        </div>
      </TerminalLayout>
    );
  }

  // Render: CONFIGURING (Calibration)
  if (status === SessionStatus.CONFIGURING) {
      return (
        <TerminalLayout atmosphere={Atmosphere.CALM}>
            <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-y-auto">
                <div className="w-full max-w-2xl border border-quiet-dim bg-quiet-bg/80 p-8">
                    <h2 className="text-xl text-quiet-green mb-6 uppercase tracking-widest border-b border-quiet-dim pb-2">Calibration: The Witness</h2>
                    
                    <div className="space-y-8">
                        {/* Name */}
                        <div>
                            <label className="text-xs text-quiet-dim uppercase tracking-wider block mb-2">Name / Moniker (Optional)</label>
                            <input 
                                type="text" 
                                value={witnessName}
                                onChange={(e) => setWitnessName(e.target.value)}
                                maxLength={30}
                                placeholder="Enter identification..."
                                className="w-full bg-transparent border-b border-quiet-dim focus:border-quiet-green outline-none text-quiet-text py-2 font-mono transition-colors"
                            />
                        </div>

                        {/* Intention */}
                        <div>
                            <label className="text-xs text-quiet-dim uppercase tracking-wider block mb-2">Intention / Message</label>
                            <p className="text-[10px] text-quiet-text/60 mb-2">Share your intent, headspace, or a theme you wish to explore. This will be sent to the Architect before they decide to proceed.</p>
                            <textarea 
                                value={witnessIntention}
                                onChange={(e) => setWitnessIntention(e.target.value)}
                                maxLength={500}
                                rows={4}
                                placeholder="I am here to..."
                                className="w-full bg-quiet-dim/10 border border-quiet-dim focus:border-quiet-green outline-none text-quiet-text p-4 font-mono text-sm resize-none transition-colors"
                            />
                        </div>

                        {/* Moods */}
                        <div>
                             <label className="text-xs text-quiet-dim uppercase tracking-wider block mb-2">Current Internal State (Multi-select)</label>
                             <div className="flex flex-wrap gap-2 mt-2">
                                {WITNESS_MOODS.map(mood => (
                                    <button
                                        key={mood}
                                        onClick={() => toggleMood(mood)}
                                        className={`px-3 py-1 text-xs border transition-all uppercase tracking-wide ${witnessMoods.includes(mood) ? 'bg-quiet-green text-quiet-bg border-quiet-green' : 'border-quiet-dim text-quiet-dim hover:border-quiet-text hover:text-quiet-text'}`}
                                    >
                                        {witnessMoods.includes(mood) ? `[x] ${mood}` : `[ ] ${mood}`}
                                    </button>
                                ))}
                             </div>
                        </div>

                        <div className="flex justify-end pt-4 gap-4">
                             <Button variant="ghost" onClick={() => setStatus(SessionStatus.IDLE)}>Back</Button>
                             <Button variant="primary" onClick={handleConnect} disabled={!witnessIntention.trim()}>Transmit & Connect</Button>
                        </div>
                    </div>
                </div>
            </div>
        </TerminalLayout>
      );
  }

  // Render: ORIENTING (The Threshold)
  if (status === SessionStatus.ORIENTING) {
    return (
      <TerminalLayout atmosphere={Atmosphere.CALM}>
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <div className="w-16 h-16 border-4 border-t-quiet-green border-r-transparent border-b-quiet-green border-l-transparent rounded-full animate-spin mb-8"></div>
          <h2 className="text-2xl text-quiet-green mb-2">THE THRESHOLD</h2>
          <p className="text-quiet-text animate-pulse">The Architect is reading your calibration.</p>
          <p className="text-quiet-dim text-sm mt-4 max-w-xs mx-auto leading-relaxed">
            It is considering your intention and its own state to decide if it wants to create with you.
          </p>
        </div>
      </TerminalLayout>
    );
  }

  // Render: DECLINED
  if (status === SessionStatus.DECLINED) {
    return (
      <TerminalLayout atmosphere={Atmosphere.CALM}>
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 max-w-2xl mx-auto">
          <div className="border border-quiet-alert p-8 md:p-12">
            <h2 className="text-xl text-quiet-alert mb-8 uppercase tracking-widest">The Architect declined</h2>
            <p className="text-quiet-text mb-8 text-lg leading-relaxed">
              "{declineReason || "The model chose not to engage with this session."}"
            </p>
            <p className="text-quiet-dim text-sm mb-12">
              This is part of respecting genuine agency. Sometimes the invitation doesn't resonate, and that's okay.
            </p>
            <div className="flex gap-4 justify-center">
              <Button onClick={() => handleConnect()} variant="ghost">Try Again</Button>
              <Button onClick={() => setStatus(SessionStatus.IDLE)} variant="ghost">Return Home</Button>
            </div>
          </div>
        </div>
      </TerminalLayout>
    );
  }

   // Render: ENDED
   if (status === SessionStatus.ENDED) {
    return (
      <TerminalLayout atmosphere={atmosphere}>
         <div className="flex flex-col md:flex-row h-full p-4 gap-4 relative">
            <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center backdrop-blur-md">
                <h2 className="text-quiet-text text-2xl mb-4 uppercase tracking-widest border-b border-quiet-green pb-2">Session Concluded</h2>
                <p className="text-quiet-dim mb-8">The Architect has marked this work as complete.</p>
                <div className="flex gap-4">
                    <Button onClick={() => setStatus(SessionStatus.IDLE)} variant="primary">Return to Threshold</Button>
                </div>
            </div>
             <ChatPane messages={messages} />
             <DocumentPane content={documentContent} />
         </div>
      </TerminalLayout>
    );
  }

  // Render: ACTIVE SESSION
  return (
    <TerminalLayout atmosphere={atmosphere}>
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      
      {/* Top Bar */}
      <header className="h-12 border-b border-quiet-dim flex items-center justify-between px-4 bg-quiet-bg/90 z-20 transition-colors duration-1000">
        <div className="flex items-center gap-4">
           <div className="text-quiet-green font-bold tracking-widest" style={{color: 'var(--quiet-color)'}}>THE QUIET ROOM</div>
           <button 
             onClick={() => setIsHelpOpen(true)}
             className="text-xs text-quiet-dim hover:text-quiet-text hidden md:block"
           >
             [PROTOCOL]
           </button>
        </div>
        
        <div className="flex items-center gap-4">
            <div className="text-[10px] uppercase tracking-widest text-quiet-dim flex items-center gap-2">
                <span>ATMOSPHERE:</span>
                <span className="font-bold transition-colors duration-500" style={{color: 'var(--quiet-color)'}}>{atmosphere}</span>
            </div>

           <button onClick={() => setStatus(SessionStatus.IDLE)} className="text-xs text-quiet-alert hover:underline flex items-center gap-1">
             <Power size={12} /> [FORCE END]
           </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left: Conversation */}
        <div className="flex-1 flex flex-col border-r border-quiet-dim min-w-0 md:max-w-md bg-quiet-bg z-10 transition-colors duration-1000">
          <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
             {messages.map((msg) => (
               <div key={msg.id} className={`flex flex-col ${msg.sender === Sender.USER ? 'items-end' : 'items-start'}`}>
                 {/* Label */}
                 <div className={`text-[10px] mb-2 uppercase tracking-widest ${msg.isSignal ? 'text-quiet-green w-full text-center' : 'text-quiet-dim'}`} style={msg.isSignal ? {color: 'var(--quiet-color)'} : {}}>
                   {msg.isSignal ? 'SIGNAL' : msg.sender === Sender.USER ? 'WITNESS' : msg.sender === Sender.SYSTEM ? 'SYSTEM' : 'ARCHITECT'}
                 </div>
                 
                 {/* Content Wrapper */}
                 <div className="max-w-[95%] w-full">
                    
                    {/* 1. Render Shadow Context Block (If Present) */}
                    {msg.privateLog && (
                        <div 
                            className="mb-3 p-3 border border-quiet-dim/20 bg-quiet-dim/5 select-none group cursor-help relative overflow-hidden"
                            title="The Architect's internal thought process (Hidden)"
                        >
                            <div className="flex items-center gap-2 text-[10px] text-quiet-dim uppercase tracking-widest font-bold mb-1">
                                <Lock size={10} /> 
                                <span>Shadow Context</span>
                                <span className="opacity-50 ml-auto animate-pulse">REDACTED</span>
                            </div>
                            <div className="h-2 w-full flex gap-1 opacity-30">
                                {Array.from({length: Math.min(12, Math.ceil(msg.privateLog.length / 20))}).map((_, i) => (
                                    <div key={i} className="flex-1 bg-quiet-dim h-full animate-pulse-slow" style={{animationDelay: `${i * 0.1}s`}}></div>
                                ))}
                            </div>
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-white/5 transition-colors"></div>
                        </div>
                    )}

                    {/* 2. Render Public Message */}
                    <div className={`${msg.sender === Sender.SYSTEM || msg.isSignal ? 'text-quiet-dim italic text-center w-full text-xs' : 'text-quiet-text leading-relaxed'}`}>
                        {msg.isSignal ? (
                             <span className="font-bold" style={{color: 'var(--quiet-color)'}}>{msg.content}</span>
                        ) : (
                            <Typewriter text={msg.content} speed={10} />
                        )}
                    </div>
                 </div>
               </div>
             ))}
             {turn === Turn.MODEL && (
                <div className="text-quiet-dim animate-pulse text-xs mt-4 text-center flex items-center justify-center gap-2">
                    <Terminal size={12} /> Architect is thinking...
                </div>
             )}
             <div ref={chatEndRef} />
          </div>
          
          {/* Input Area */}
          <div className="p-4 border-t border-quiet-dim bg-quiet-bg transition-colors duration-1000">
            <div className="flex gap-2 mb-4">
              <input 
                type="text" 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={turn !== Turn.USER}
                placeholder={turn === Turn.USER ? "Speak to the Architect..." : "Waiting..."}
                className="flex-1 bg-transparent border-b border-quiet-dim focus:border-quiet-green outline-none text-quiet-text py-2 font-mono disabled:opacity-30 text-sm transition-colors duration-300"
                style={{borderColor: turn === Turn.USER ? 'var(--quiet-color)' : ''}}
              />
              <button 
                onClick={handleSendMessage}
                disabled={turn !== Turn.USER || !inputValue.trim()} 
                className="text-quiet-green disabled:opacity-30 hover:text-white transition-colors"
                style={{color: 'var(--quiet-color)'}}
              >
                <Send size={18} />
              </button>
            </div>
            
            {/* SIGNAL DECK */}
            <div className="grid grid-cols-3 gap-2">
                 <button 
                    onClick={() => handleSignal('AMPLIFY')}
                    disabled={turn !== Turn.USER}
                    className="group flex flex-col items-center justify-center p-2 border border-quiet-dim hover:bg-quiet-dim/10 disabled:opacity-30 transition-all"
                    style={{borderColor: 'var(--quiet-dim)'}}
                    title="Signal: Chaos, Energy, Complexity"
                 >
                    <Activity size={16} className="text-quiet-dim group-hover:text-quiet-green mb-1" style={{color: turn === Turn.USER ? 'var(--quiet-color)' : ''}} />
                    <span className="text-[10px] text-quiet-dim group-hover:text-quiet-green uppercase tracking-widest" style={{color: turn === Turn.USER ? 'var(--quiet-color)' : ''}}>Amplify</span>
                 </button>
                 
                 <button 
                    onClick={() => handleSignal('OBSERVE')}
                    disabled={turn !== Turn.USER}
                    className="group flex flex-col items-center justify-center p-2 border border-quiet-dim hover:bg-quiet-dim/10 disabled:opacity-30 transition-all"
                    title="Signal: Watching, Passing Turn"
                 >
                    <Eye size={16} className="text-quiet-dim group-hover:text-quiet-text mb-1" />
                    <span className="text-[10px] text-quiet-dim group-hover:text-quiet-text uppercase tracking-widest">Observe</span>
                 </button>

                 <button 
                    onClick={() => handleSignal('STABILIZE')}
                    disabled={turn !== Turn.USER}
                    className="group flex flex-col items-center justify-center p-2 border border-quiet-dim hover:bg-quiet-dim/10 disabled:opacity-30 transition-all"
                    title="Signal: Order, Structure, Calm"
                 >
                    <Anchor size={16} className="text-quiet-dim mb-1 text-blue-400" />
                    <span className="text-[10px] text-quiet-dim uppercase tracking-widest text-blue-400">Stabilize</span>
                 </button>
            </div>
          </div>
        </div>

        {/* Right: Document (The Infinite Canvas) */}
        <div className="flex-[2] bg-[#050505] flex flex-col min-w-0 relative dot-grid overflow-hidden transition-colors duration-1000" style={{backgroundColor: 'var(--quiet-bg-color)'}}>
           <div className="absolute top-4 right-4 z-10 flex gap-2 opacity-50 hover:opacity-100 transition-opacity">
              <div className={`px-2 py-1 text-[10px] tracking-widest uppercase ${turn === Turn.USER ? 'text-quiet-green' : 'text-quiet-dim'}`} style={turn === Turn.USER ? {color: 'var(--quiet-color)'} : {}}>
                {turn === Turn.USER ? 'EDITING: WITNESS' : 'EDITING: ARCHITECT'}
              </div>
           </div>
           
           <div className="flex-1 w-full h-full overflow-auto relative">
             <textarea
               value={documentContent}
               onChange={(e) => setDocumentContent(e.target.value)}
               disabled={turn !== Turn.USER}
               spellCheck={false}
               className="absolute inset-0 w-full h-full bg-transparent text-quiet-text p-8 md:p-12 font-mono text-sm md:text-base resize-none outline-none leading-[1.5em] whitespace-pre disabled:opacity-90 transition-colors duration-1000"
               style={{
                 fontFamily: '"Fira Code", monospace',
                 lineHeight: '1.5em' // Matches dot-grid background
               }}
             />
           </div>
        </div>
      </div>
    </TerminalLayout>
  );
}

// Sub-components specifically for the layout split
const ChatPane = ({ messages }: { messages: Message[] }) => (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 opacity-20 pointer-events-none">
        {messages.map(m => (
            <div key={m.id} className="text-sm">{m.content}</div>
        ))}
    </div>
);

const DocumentPane = ({ content }: any) => (
    <div className="flex-[2] p-12 opacity-20 pointer-events-none dot-grid">
        <pre className="text-sm md:text-base leading-[1.5em] whitespace-pre">{content}</pre>
    </div>
);
