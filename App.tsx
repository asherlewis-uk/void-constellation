import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  User, Cpu, Terminal, MessageSquare, Briefcase, Zap, 
  X, ChevronRight, Play, Loader2, Send, Database, Shield, FileText,
  Sparkles, Plus, Menu, LayoutGrid, Settings
} from 'lucide-react';

// ============================================================================
// CORE SYSTEM: API & CONFIGURATION
// ============================================================================
const apiKey = ""; // Provided by execution environment

async function callGemini(systemPrompt, userQuery, jsonSchema = null) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: userQuery }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] }
  };
  
  if (jsonSchema) {
    payload.generationConfig = {
      responseMimeType: "application/json",
      responseSchema: jsonSchema
    };
  }

  let delay = 1000;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("No text in response");
      return jsonSchema ? JSON.parse(text) : text;
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

// ============================================================================
// CORE SYSTEM: LOCAL DATABASE (IndexedDB)
// ============================================================================
class LocalDB {
  constructor() {
    this.dbName = 'VoidConstellationDB';
    this.version = 2;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('agents')) db.createObjectStore('agents', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('forms')) db.createObjectStore('forms', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('messages')) db.createObjectStore('messages', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('outputs')) db.createObjectStore('outputs', { keyPath: 'id' });
      };
      request.onsuccess = (e) => { this.db = e.target.result; resolve(); };
      request.onerror = () => reject(request.error);
    });
  }

  async put(storeName, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(data);
      tx.oncomplete = () => resolve(data);
      tx.onerror = () => reject(tx.error);
    });
  }

  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getByQuery(storeName, filterFn) {
    const all = await this.getAll(storeName);
    return all.filter(filterFn);
  }
  
  async clearAll() {
      return new Promise((resolve, reject) => {
          const tx = this.db.transaction(['agents', 'forms', 'messages', 'outputs'], 'readwrite');
          tx.objectStore('agents').clear();
          tx.objectStore('forms').clear();
          tx.objectStore('messages').clear();
          tx.objectStore('outputs').clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
      });
  }
}

const db = new LocalDB();

// ============================================================================
// CORE SYSTEM: DYNAMIC CONSTELLATION ENGINE (WITH PLANET RENDERING)
// ============================================================================
function ConstellationGraph({ graphData }) {
  const canvasRef = useRef(null);
  const physicsRef = useRef({ nodes: [], links: [] });
  const animationRef = useRef(null);

  useEffect(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const newNodes = graphData.nodes.map(n => {
      const existing = physicsRef.current.nodes.find(old => old.id === n.id);
      return existing ? { ...n, x: existing.x, y: existing.y, vx: existing.vx, vy: existing.vy } : {
        ...n,
        x: Math.random() * width,
        y: Math.random() * height * 0.5, // Spawn higher up to avoid the planet
        vx: 0,
        vy: 0
      };
    });

    physicsRef.current = { nodes: newNodes, links: graphData.links };
  }, [graphData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    // Planet parameters to mimic the reference image
    const getPlanetConfig = (w, h) => {
      // Massive planet anchored bottom left
      const isMobile = w < 768;
      return {
        x: isMobile ? -w * 0.2 : -w * 0.1,
        y: isMobile ? h * 0.8 : h * 1.1,
        radius: isMobile ? h * 0.6 : Math.min(w, h) * 0.8
      };
    };

    const renderLoop = () => {
      const { nodes, links } = physicsRef.current;
      const width = canvas.width;
      const height = canvas.height;
      const planet = getPlanetConfig(width, height);

      const REPULSION = 2000;
      const SPRING_LENGTH = 120;
      const SPRING_K = 0.02;
      const DAMPING = 0.85;
      const CENTER_GRAVITY = 0.0003;

      // 1. Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          let dx = nodes[i].x - nodes[j].x;
          let dy = nodes[i].y - nodes[j].y;
          let distSq = dx * dx + dy * dy;
          if (distSq === 0) distSq = 1;
          
          let dist = Math.sqrt(distSq);
          let force = REPULSION / distSq;
          
          let fx = (dx / dist) * force;
          let fy = (dy / dist) * force;
          
          nodes[i].vx += fx; nodes[i].vy += fy;
          nodes[j].vx -= fx; nodes[j].vy -= fy;
        }
      }

      // 2. Attraction (Links)
      links.forEach(link => {
        const source = nodes.find(n => n.id === link.source);
        const target = nodes.find(n => n.id === link.target);
        if (!source || !target) return;

        let dx = target.x - source.x;
        let dy = target.y - source.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        
        let force = (dist - SPRING_LENGTH) * SPRING_K;
        let fx = (dx / dist) * force;
        let fy = (dy / dist) * force;

        source.vx += fx; source.vy += fy;
        target.vx -= fx; target.vy -= fy;
      });

      // 3. Gravity & Planet Collision
      nodes.forEach(n => {
        // Pull towards top right to counterbalance the bottom-left planet
        n.vx += (width * 0.7 - n.x) * CENTER_GRAVITY;
        n.vy += (height * 0.3 - n.y) * CENTER_GRAVITY;
        
        // Planet Collision boundary
        let dxPlanet = n.x - planet.x;
        let dyPlanet = n.y - planet.y;
        let distPlanet = Math.sqrt(dxPlanet * dxPlanet + dyPlanet * dyPlanet);
        let buffer = 20; // Float slightly above the surface
        
        if (distPlanet < planet.radius + buffer) {
          // Push out
          let pushForce = (planet.radius + buffer - distPlanet) * 0.1;
          n.vx += (dxPlanet / distPlanet) * pushForce;
          n.vy += (dyPlanet / distPlanet) * pushForce;
        }

        n.vx *= DAMPING;
        n.vy *= DAMPING;
        n.x += n.vx;
        n.y += n.vy;
      });

      // RENDER
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      // Draw Planet (Reference Image Emulation)
      ctx.beginPath();
      ctx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#000000'; // Void black core
      ctx.fill();
      
      // Planet Halo / Edge light
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#FFFFFF';
      ctx.shadowBlur = 40;
      ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
      ctx.stroke();
      ctx.shadowBlur = 0; // Reset

      // Draw Edges
      ctx.lineWidth = 1;
      links.forEach(link => {
        const source = nodes.find(n => n.id === link.source);
        const target = nodes.find(n => n.id === link.target);
        if (!source || !target) return;

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        
        if (target.type === 'output') {
          ctx.strokeStyle = 'rgba(192, 192, 192, 0.3)';
          ctx.setLineDash([2, 4]);
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.setLineDash([]);
        }
        ctx.stroke();
      });
      ctx.setLineDash([]); 

      // Draw Nodes (Stars)
      nodes.forEach(n => {
        ctx.beginPath();
        if (n.type === 'agent') {
          ctx.arc(n.x, n.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#FFFFFF';
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (n.type === 'form') {
          ctx.arc(n.x, n.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = '#C0C0C0';
          ctx.fill();
        } else if (n.type === 'output') {
          ctx.arc(n.x, n.y, 1, 0, Math.PI * 2);
          ctx.strokeStyle = '#666666';
          ctx.stroke();
        }
      });

      animationRef.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" />;
}

// ============================================================================
// UI COMPONENTS: MOBILE-FIRST MONOCHROME BRUTALISM
// ============================================================================
const MonoPanel = ({ children, className = '' }) => (
  <div className={`bg-black/80 backdrop-blur-md border border-[#333333] rounded-none ${className}`}>
    {children}
  </div>
);

const MonoButton = ({ children, onClick, disabled = false, className = '', variant = 'primary' }) => {
  const base = "px-4 py-4 md:py-3 font-mono text-xs uppercase tracking-widest transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed border flex items-center justify-center gap-2 active:scale-95";
  const variants = {
    primary: "bg-white text-black border-white hover:bg-[#E0E0E0]",
    outline: "bg-black/50 backdrop-blur-sm text-white border-[#333333] hover:border-white",
    ghost: "bg-transparent text-[#666666] border-transparent hover:text-white hover:bg-white/5",
  };

  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
};

const MonoInput = ({ value, onChange, placeholder, isTextarea = false, className = '', onSubmit }) => {
  const baseClass = `w-full bg-black/50 backdrop-blur-sm border border-[#333333] focus:border-white text-white font-mono p-4 rounded-none outline-none transition-colors placeholder-[#444444] ${className}`;
  return isTextarea ? (
    <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={`${baseClass} min-h-[120px] resize-y`} />
  ) : (
    <input 
      type="text" 
      value={value} 
      onChange={e => onChange(e.target.value)} 
      placeholder={placeholder} 
      className={baseClass} 
      onKeyDown={e => {
        if (e.key === 'Enter' && onSubmit) {
          e.preventDefault();
          onSubmit();
        }
      }}
    />
  );
};

// ============================================================================
// MAIN APPLICATION SHELL
// ============================================================================
export default function App() {
  const [appState, setAppState] = useState('booting'); 
  const [agents, setAgents] = useState([]);
  const [activeAgent, setActiveAgent] = useState(null);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const refreshGraph = useCallback(async () => {
    const allAgents = await db.getAll('agents');
    const allForms = await db.getAll('forms');
    const allOutputs = await db.getAll('outputs');

    const nodes = [];
    const links = [];

    allAgents.forEach(a => nodes.push({ id: a.id, type: 'agent' }));
    allForms.forEach(f => {
      nodes.push({ id: f.id, type: 'form' });
      links.push({ source: f.agentId, target: f.id });
    });
    allOutputs.forEach(o => {
      nodes.push({ id: o.id, type: 'output' });
      links.push({ source: o.formId, target: o.id });
    });

    setGraphData({ nodes, links });
  }, []);

  useEffect(() => {
    db.init().then(async () => {
      await refreshGraph();
      const loadedAgents = await db.getAll('agents');
      if (loadedAgents.length > 0) {
        setAgents(loadedAgents);
        setAppState('active');
        setActiveAgent(loadedAgents[0]); // Auto-select first agent
      } else {
        setAppState('onboarding');
      }
    }).catch(err => console.error("DB Init failed", err));
  }, [refreshGraph]);

  const handleFactoryReset = async () => {
      if(!confirm("Purge all local data? This is irreversible.")) return;
      await db.clearAll();
      setAgents([]);
      setActiveAgent(null);
      await refreshGraph();
      setAppState('onboarding');
      setSidebarOpen(false);
  };

  if (appState === 'booting') {
    return (
      <div className="h-dvh w-screen bg-black flex items-center justify-center text-white font-mono">
        <Loader2 size={24} className="animate-spin text-[#333333] mr-3" />
        <p className="tracking-widest text-xs text-[#666666]">INITIALIZING SYSTEM</p>
      </div>
    );
  }

  return (
    <div className="h-dvh w-screen bg-black text-white font-sans overflow-hidden flex relative selection:bg-white selection:text-black">
      
      {/* Background layer (Planet + Constellation) */}
      <ConstellationGraph graphData={graphData} />

      {/* FULL SCREEN ONBOARDING OVERLAY */}
      {appState === 'onboarding' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 sm:p-12 overflow-y-auto">
          <OnboardingFlow 
            onComplete={async (newAgents) => {
              setAgents(newAgents);
              await refreshGraph();
              setActiveAgent(newAgents[0]);
              setAppState('active');
            }} 
          />
        </div>
      )}

      {/* ACTIVE WORKSPACE (Sintra Layout) */}
      {appState === 'active' && (
        <>
          {/* MOBILE SIDEBAR OVERLAY */}
          {sidebarOpen && (
            <div 
              className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* SIDEBAR (Left Navigation) */}
          <nav className={`
            fixed md:relative z-50 h-dvh w-72 bg-black/90 md:bg-black/50 backdrop-blur-xl border-r border-[#333333] flex flex-col transition-transform duration-300 ease-in-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          `}>
            <div className="p-6 border-b border-[#333333] flex items-center justify-between">
              <h1 className="font-mono font-bold tracking-[0.2em] text-xs text-white">
                VOID<span className="text-[#666666]">CONSTELLATION</span>
              </h1>
              <button className="md:hidden text-[#666666] hover:text-white" onClick={() => setSidebarOpen(false)}>
                <X size={20} strokeWidth={1}/>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <div className="font-mono text-[10px] tracking-[0.2em] text-[#666666] uppercase mb-4 px-2 mt-2">Active Roster</div>
              {agents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => {
                    setActiveAgent(agent);
                    setSidebarOpen(false); // Auto-close on mobile
                  }}
                  className={`w-full text-left p-3 flex items-center gap-3 border transition-colors ${
                    activeAgent?.id === agent.id 
                      ? 'bg-white text-black border-white' 
                      : 'bg-transparent text-[#C0C0C0] border-transparent hover:border-[#333333]'
                  }`}
                >
                  <div className={`w-8 h-8 flex items-center justify-center border ${activeAgent?.id === agent.id ? 'border-black' : 'border-[#333333]'}`}>
                    <User size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs uppercase tracking-widest truncate">{agent.name}</div>
                    <div className={`font-mono text-[9px] uppercase tracking-widest truncate ${activeAgent?.id === agent.id ? 'text-[#333333]' : 'text-[#666666]'}`}>
                      {agent.role}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="p-4 border-t border-[#333333] space-y-2">
               <MonoButton variant="ghost" className="w-full justify-start text-[10px]" onClick={handleFactoryReset}>
                  <Shield size={12} /> PURGE DATA
               </MonoButton>
            </div>
          </nav>

          {/* MAIN CONTENT AREA */}
          <main className="flex-1 flex flex-col relative min-w-0 h-dvh bg-black/20 backdrop-blur-sm z-10">
            {/* Mobile Header */}
            <header className="md:hidden flex items-center justify-between p-4 border-b border-[#333333] bg-black/80 backdrop-blur-md">
              <button onClick={() => setSidebarOpen(true)} className="text-white p-2 border border-[#333333] bg-black">
                <Menu size={16} />
              </button>
              <div className="font-mono text-xs uppercase tracking-widest truncate max-w-[200px]">
                {activeAgent?.name || 'Select Agent'}
              </div>
              <div className="w-8" /> {/* Spacer */}
            </header>

            {/* Agent Workspace */}
            {activeAgent ? (
              <AgentWorkspace 
                agent={activeAgent} 
                refreshGraph={refreshGraph} 
              />
            ) : (
              <div className="flex-1 flex items-center justify-center font-mono text-xs tracking-widest text-[#666666] uppercase">
                Select an entity from the roster
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
}

// ============================================================================
// FEATURE: ONBOARDING ENGINE
// ============================================================================
function OnboardingFlow({ onComplete }) {
  const [occupation, setOccupation] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingText, setLoadingText] = useState('');

  const generateAgents = async () => {
    if (!occupation) return;
    setIsGenerating(true);
    setLoadingText('ANALYZING');

    const systemPrompt = `You are a Master Architect AI building a localized workforce. The user is a ${occupation}. 
    Analyze their likely daily tasks, pain points, and workflows. 
    Design exactly 3 highly specialized AI Agent personas to act as their elite support team.
    For each agent, also define 2 practical "Utility Forms" (templates) they can execute immediately.`;

    const jsonSchema = {
      type: "OBJECT",
      properties: {
        agents: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              id: { type: "STRING", description: "Unique snake_case id e.g., lead_copywriter" },
              name: { type: "STRING", description: "A minimalist professional name e.g., 'Analyst-A' or 'Director'" },
              role: { type: "STRING", description: "Functional role e.g., 'Lead Copywriter'" },
              systemPrompt: { type: "STRING", description: "Detailed 2-paragraph persona and instruction set for the LLM." },
              forms: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    id: { type: "STRING" },
                    title: { type: "STRING" },
                    description: { type: "STRING" },
                    promptTemplate: { type: "STRING", description: "Template using {{fieldName}} for inputs. E.g., 'Write a blog about {{topic}} targeting {{audience}}.'" },
                    fields: {
                      type: "ARRAY",
                      items: {
                        type: "OBJECT",
                        properties: {
                          name: { type: "STRING", description: "e.g. 'topic'" },
                          label: { type: "STRING", description: "e.g. 'Blog Topic'" },
                          type: { type: "STRING", description: "Must be 'text' or 'textarea'" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    };

    try {
      setLoadingText('SYNTHESIZING CORE');
      const result = await callGemini(systemPrompt, `Generate 3 specialized agents for a ${occupation}.`, jsonSchema);
      
      setLoadingText('COMMITTING STATE');
      const finalAgents = [];
      
      const generatedAgents = Array.isArray(result?.agents) ? result.agents : [];
      
      for (const rawAgent of generatedAgents) {
        const agentId = `${rawAgent.id || 'agent'}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const agent = {
          id: agentId,
          name: rawAgent.name || 'Unknown Entity',
          role: rawAgent.role || 'Support',
          systemPrompt: rawAgent.systemPrompt || '',
          createdAt: Date.now()
        };
        await db.put('agents', agent);
        finalAgents.push(agent);

        const generatedForms = Array.isArray(rawAgent.forms) ? rawAgent.forms : [];
        for (const rawForm of generatedForms) {
          await db.put('forms', {
            id: `${rawForm.id || 'form'}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            agentId: agent.id,
            title: rawForm.title || 'Untitled Protocol',
            description: rawForm.description || '',
            promptTemplate: rawForm.promptTemplate || '',
            fields: Array.isArray(rawForm.fields) ? rawForm.fields : []
          });
        }
      }

      onComplete(finalAgents);
    } catch (err) {
      console.error(err);
      alert("Failed to synthesize. Check console or API Key.");
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full max-w-lg relative animate-in fade-in zoom-in-95 duration-700">
      <MonoPanel className="p-8 md:p-12 relative shadow-2xl">
        <h2 className="text-xl md:text-2xl font-mono tracking-[0.2em] mb-8 border-b border-[#333333] pb-4 uppercase">System Initialization</h2>
        
        <div className="space-y-8">
          <div>
            <label className="block text-[10px] text-[#C0C0C0] uppercase tracking-widest font-mono mb-3">Primary User Designation (Occupation)</label>
            <MonoInput 
              value={occupation} 
              onChange={setOccupation} 
              placeholder="e.g., Senior Engineer, Author, Executive" 
              className="text-sm md:text-base py-5"
              disabled={isGenerating}
              onSubmit={generateAgents}
            />
          </div>
          
          <MonoButton 
            onClick={generateAgents} 
            disabled={!occupation || isGenerating}
            className="w-full h-16 text-sm"
          >
            {isGenerating ? (
              <span className="flex items-center gap-3">
                <Loader2 className="animate-spin" size={16} /> {loadingText}
              </span>
            ) : (
              <span className="flex items-center gap-3">
                GENERATE CONSTELLATION <ChevronRight size={16} />
              </span>
            )}
          </MonoButton>
        </div>
      </MonoPanel>
    </div>
  );
}

// ============================================================================
// FEATURE: AGENT WORKSPACE (Tabs, Chat, Forms)
// ============================================================================
function AgentWorkspace({ agent, refreshGraph }) {
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'protocols'
  const [forms, setForms] = useState([]);

  const loadForms = useCallback(() => {
    db.getByQuery('forms', f => f.agentId === agent.id).then(setForms);
  }, [agent.id]);

  useEffect(() => {
    loadForms();
    setActiveTab('chat'); // reset tab on agent switch
  }, [agent.id, loadForms]);

  return (
    <div className="flex flex-col h-full w-full bg-transparent">
      
      {/* Workspace Header (Tabs) */}
      <div className="hidden md:flex shrink-0 h-16 border-b border-[#333333] bg-black/80 backdrop-blur-md px-6 items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 border border-white flex items-center justify-center bg-white text-black font-bold font-mono text-sm">
             {agent.name.charAt(0)}
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-widest uppercase">{agent.name}</h2>
            <p className="text-[#666666] font-mono text-[9px] tracking-widest uppercase">{agent.role}</p>
          </div>
        </div>

        <div className="flex border border-[#333333] font-mono text-[10px] uppercase tracking-widest">
          <button 
            onClick={() => setActiveTab('chat')}
            className={`px-6 py-2 transition-colors ${activeTab === 'chat' ? 'bg-white text-black' : 'text-[#666666] hover:text-white'}`}
          >
            Neural Chat
          </button>
          <button 
            onClick={() => setActiveTab('protocols')}
            className={`px-6 py-2 transition-colors border-l border-[#333333] ${activeTab === 'protocols' ? 'bg-white text-black' : 'text-[#666666] hover:text-white'}`}
          >
            Protocols
          </button>
        </div>
      </div>

      {/* Mobile Tab Switcher */}
      <div className="md:hidden flex border-b border-[#333333] bg-black/80 font-mono text-[10px] uppercase tracking-widest">
        <button 
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-4 transition-colors ${activeTab === 'chat' ? 'bg-white text-black' : 'text-[#666666]'}`}
        >
          Chat
        </button>
        <button 
          onClick={() => setActiveTab('protocols')}
          className={`flex-1 py-4 transition-colors border-l border-[#333333] ${activeTab === 'protocols' ? 'bg-white text-black' : 'text-[#666666]'}`}
        >
          Protocols
        </button>
      </div>

      {/* Workspace Content Body */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'chat' ? (
          <ChatInterface agent={agent} />
        ) : (
          <FormsInterface agent={agent} forms={forms} refreshGraph={refreshGraph} reloadForms={loadForms} />
        )}
      </div>

    </div>
  );
}

// ----------------------------------------------------------------------------
// SUB-FEATURE: Chat Interface
// ----------------------------------------------------------------------------
function ChatInterface({ agent }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    db.getByQuery('messages', m => m.agentId === agent.id).then(msgs => {
      setMessages(msgs.sort((a, b) => a.timestamp - b.timestamp));
    });
  }, [agent.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    
    const userMsg = {
      id: `msg_${Date.now()}`,
      agentId: agent.id,
      role: 'user',
      content: input,
      timestamp: Date.now()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    await db.put('messages', userMsg);

    const historyText = messages.slice(-10).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
    const query = `History:\n${historyText}\n\nUSER: ${input}`;

    try {
      const responseText = await callGemini(agent.systemPrompt, query);
      const aiMsg = {
        id: `msg_${Date.now()}`,
        agentId: agent.id,
        role: 'assistant',
        content: responseText,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, aiMsg]);
      await db.put('messages', aiMsg);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: `msg_${Date.now()}`,
        agentId: agent.id,
        role: 'assistant',
        content: "[SYSTEM ERROR: Connection timeout]",
        timestamp: Date.now()
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-transparent">
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 pb-20 scrollbar-hide" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-[#333333] font-mono text-[10px] tracking-[0.3em]">
            <Terminal size={32} className="mb-4" strokeWidth={1} />
            <p>AWAITING INPUT</p>
          </div>
        )}
        
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] md:max-w-[70%] ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
              <div className="font-mono text-[9px] tracking-widest text-[#666666] mb-1 uppercase">
                {msg.role === 'user' ? 'User' : agent.name}
              </div>
              <div className={`leading-relaxed text-sm md:text-base font-serif bg-black/60 p-4 border ${msg.role === 'user' ? 'border-[#333333] text-[#C0C0C0]' : 'border-white text-white'}`}>
                {msg.content}
              </div>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-black/60 border border-white p-4 font-mono text-[10px] tracking-widest text-[#666666] animate-pulse">
              [PROCESSING]
            </div>
          </div>
        )}
      </div>

      {/* Sticky Input Area */}
      <div className="p-4 border-t border-[#333333] bg-black/90 backdrop-blur-xl shrink-0 safe-area-bottom">
        <div className="flex items-center gap-2 max-w-4xl mx-auto">
          <MonoInput 
            value={input}
            onChange={setInput}
            placeholder="Input command..."
            className="flex-1 border-[#333333] focus:border-white bg-black/50"
            onSubmit={handleSend}
          />
          <MonoButton onClick={handleSend} disabled={!input.trim() || isTyping} className="h-[58px] px-6">
            <Send size={16} strokeWidth={1} />
          </MonoButton>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// SUB-FEATURE: Forms / Protocols Interface (Mobile Refactored)
// ----------------------------------------------------------------------------
function FormsInterface({ agent, forms, refreshGraph, reloadForms }) {
  const [activeForm, setActiveForm] = useState(null);
  const [formData, setFormData] = useState({});
  const [output, setOutput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);

  const [isCreatingForm, setIsCreatingForm] = useState(false);
  const [newFormPrompt, setNewFormPrompt] = useState('');

  const handleExecute = async () => {
    setIsExecuting(true);
    setOutput('');

    let compiledPrompt = activeForm.promptTemplate;
    for (const [key, val] of Object.entries(formData)) {
      compiledPrompt = compiledPrompt.replace(new RegExp(`{{${key}}}`, 'g'), val);
    }

    const query = `Execute the following task:\n\n${compiledPrompt}`;

    try {
      const response = await callGemini(agent.systemPrompt, query);
      setOutput(response);
      
      await db.put('outputs', {
        id: `out_${Date.now()}`,
        formId: activeForm.id,
        agentId: agent.id,
        content: response,
        timestamp: Date.now()
      });
      await refreshGraph();
    } catch (err) {
      console.error(err);
      setOutput("[ERROR: Execution failed]");
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCreateProtocol = async () => {
    if (!newFormPrompt) return;
    setIsCreatingForm(true);
    const systemPrompt = `You are an AI Architect. Create a reusable form protocol for the agent: ${agent.name} (${agent.role}). Agent context: ${agent.systemPrompt}.`;
    const query = `Create a form for this task: ${newFormPrompt}`;
    const schema = {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        description: { type: "STRING" },
        promptTemplate: { type: "STRING", description: "Template using {{fieldName}} for inputs. E.g., 'Write a blog about {{topic}} targeting {{audience}}.'" },
        fields: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              label: { type: "STRING" },
              type: { type: "STRING", description: "'text' or 'textarea'" }
            }
          }
        }
      }
    };

    try {
      const result = await callGemini(systemPrompt, query, schema);
      await db.put('forms', { id: `form_${Date.now()}`, agentId: agent.id, ...result });
      setNewFormPrompt('');
      if (reloadForms) reloadForms();
    } catch (e) {
      console.error(e);
      alert("Failed to synthesize protocol.");
    } finally {
      setIsCreatingForm(false);
    }
  };

  // Mobile View Toggle: Show List vs Show Active Form
  if (activeForm) {
    return (
      <div className="flex flex-col h-full bg-black/80 backdrop-blur-md absolute inset-0 z-20">
        <div className="flex items-center border-b border-[#333333] p-4 shrink-0 bg-black">
          <button onClick={() => { setActiveForm(null); setOutput(''); }} className="mr-4 text-[#666666] hover:text-white">
            <ChevronRight className="rotate-180" size={24} />
          </button>
          <div className="font-mono text-xs uppercase tracking-widest truncate">{activeForm.title}</div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
          {!output ? (
            <div className="space-y-6 max-w-2xl mx-auto w-full">
              <p className="text-[#666666] font-serif text-sm">{activeForm.description}</p>
              {activeForm.fields.map(field => (
                <div key={field.name}>
                  <label className="block font-mono text-[10px] text-[#C0C0C0] uppercase tracking-widest mb-2">
                    {field.label || field.name}
                  </label>
                  <MonoInput
                    isTextarea={field.type === 'textarea'}
                    value={formData[field.name] || ''}
                    onChange={(val) => setFormData(prev => ({ ...prev, [field.name]: val }))}
                  />
                </div>
              ))}
              <MonoButton onClick={handleExecute} disabled={isExecuting} className="w-full mt-4">
                {isExecuting ? 'EXECUTING...' : 'COMPILE & RUN'}
              </MonoButton>
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto w-full">
              <div className="flex justify-between items-center border-b border-[#333333] pb-2">
                <span className="font-mono text-[10px] text-[#666666] uppercase tracking-widest">Output Buffer</span>
                <button onClick={() => navigator.clipboard.writeText(output)} className="font-mono text-[10px] text-white hover:text-[#C0C0C0] uppercase tracking-widest">
                  [ Copy ]
                </button>
              </div>
              <div className="font-serif text-[#C0C0C0] leading-relaxed whitespace-pre-wrap text-sm md:text-base selection:bg-white selection:text-black">
                {output}
              </div>
              <MonoButton onClick={() => setOutput('')} variant="outline" className="w-full mt-8">
                NEW EXECUTION
              </MonoButton>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-2xl mx-auto space-y-4">
          
          {/* Create Protocol Inline Bar */}
          <div className="p-4 border border-[#333333] bg-black/60 backdrop-blur-md mb-8">
            <div className="font-mono text-[10px] text-[#C0C0C0] uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
              <Sparkles size={12}/> Synthesize New Protocol
            </div>
            <div className="flex gap-2 flex-col sm:flex-row">
              <MonoInput
                value={newFormPrompt}
                onChange={setNewFormPrompt}
                placeholder="E.g., cold email generator..."
                className="flex-1 py-3 text-xs"
                onSubmit={handleCreateProtocol}
              />
              <MonoButton
                onClick={handleCreateProtocol}
                disabled={isCreatingForm || !newFormPrompt.trim()}
                className="py-3 px-6 shrink-0"
              >
                {isCreatingForm ? <Loader2 size={14} className="animate-spin" /> : <span className="flex items-center gap-2"><Plus size={14}/> CREATE</span>}
              </MonoButton>
            </div>
          </div>

          <h3 className="font-mono text-[10px] tracking-[0.2em] text-[#666666] uppercase mb-4 border-b border-[#333333] pb-2">Available Protocols</h3>
          
          {forms.map(form => (
            <button
              key={form.id}
              onClick={() => {
                setActiveForm(form);
                setFormData({});
                setOutput('');
              }}
              className="w-full text-left p-5 border border-[#333333] bg-black/60 hover:bg-black transition-colors group flex flex-col justify-center min-h-[100px]"
            >
              <div className="font-mono text-sm uppercase tracking-widest mb-2 flex items-center justify-between group-hover:text-white text-[#C0C0C0] transition-colors">
                {form.title}
                <Play size={14} className="text-[#333333] group-hover:text-white transition-colors" />
              </div>
              <div className="text-xs font-serif line-clamp-2 text-[#666666]">
                {form.description}
              </div>
            </button>
          ))}
          {forms.length === 0 && (
             <div className="text-center p-10 font-mono text-[10px] text-[#333333] tracking-[0.2em] uppercase border border-[#333333] border-dashed">
               No protocols found
             </div>
          )}
        </div>
      </div>
    </div>
  );
}


