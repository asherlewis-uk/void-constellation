SYSTEM BLUEPRINT: PROJECT "VOID-CONSTELLATION"
MODE: CHIMERA (Synthesis)
STATUS: CONTEXTUALLY SOUND & DEPLOYED
1. Project Manifesto
Project Void-Constellation is an ultra-high-fidelity, mobile-native Agent Orchestration Platform. It fuses the structural efficiency of Sintra.ai (collapsible sidebar, focused workspace) with a bespoke, monochrome brutalist aesthetic. The defining architectural feature is the Celestial Graph Engine—a custom zero-dependency HTML5 canvas simulation rendering a massive eclipsed planet and a live physics-based graph of the user's operational history. All data is sovereign, stored strictly within IndexedDB, and LLM calls are executed resiliently via the Gemini API.
2. Executive Tech Stack
 * Framework: React 18 via Vite (Compiled to Single-File SPA).
 * Local Database: Custom LocalDB Wrapper for IndexedDB. Provides asynchronous, relation-mapped storage with absolute data privacy.
 * Styling & UI: TailwindCSS + Lucide Icons. Strict monochrome palette (OLED Black #000000, Stark White #FFFFFF, Silver #C0C0C0, and #333333 borders).
 * Physics & Rendering Engine: Bespoke HTML5 Canvas + requestAnimationFrame. Replaced react-force-graph-2d for zero-dependency, ultra-performant mobile rendering. Includes custom collision detection to wrap the data graph around the static planet rendering.
 * AI Orchestration: Gemini 2.5 Flash API with strict JSON Schema constraints and newly added Resilience Checks (fallback arrays) to prevent iterable rendering crashes.
3. Logical Component Architecture
(Note: Assembled as a monolithic Single-File Application per environment constraints, structured internally as follows)
/Void-Constellation-Core
├── DB Layer (IndexedDB Wrapper)
│   ├── Agents (id, name, role, systemPrompt)
│   ├── Forms (id, agentId, title, fields, promptTemplate)
│   ├── Messages (id, agentId, role, content, timestamp)
│   └── Outputs (id, formId, agentId, content)
├── Celestial Rendering Engine
│   └── ConstellationGraph (Canvas context, d3-force emulation, Planet rendering)
├── Layout Shell (Mobile-Native Sintra.ai emulation)
│   ├── Off-Canvas Sidebar (Roster & Database Controls)
│   └── Main Workspace (100dvh focused view)
└── Workflows
    ├── OnboardingFlow (Context -> LLM Schema -> Initial DB Seed)
    ├── AgentWorkspace (Tabbed interface for Chat vs Protocols)
    ├── NeuralChat (Standard conversational interface)
    └── FormsInterface (Protocol Execution + Generative Form Creation)

4. Graph Mapping Strategy (The Constellation)
The background canvas is a live reflection of the IndexedDB state.
 * The Planet: Static anchor (bottom-left on desktop, bottom-center on mobile). Emits a gravitational repulsion field to prevent nodes from clipping inside it.
 * Nodes (Stars):
   * Agent: Large White Node (High mass).
   * Form: Medium Silver Node.
   * Output: Small Hollow Node.
 * Edges (Constellations):
   * Agent -> Form: Solid White Line.
   * Form -> Output: Dashed Silver Line.
 * Physics: Nodes are pulled towards the top-right center of gravity while repelling each other and dodging the planetary body.
5. Critical Logic Flows & Contextual Soundness
A. Mobile-Native UI Orchestration
The UI is built using dynamic viewport units (dvh) to prevent mobile browser chrome from breaking the layout. The sidebar acts as a sliding drawer on mobile (z-index: 50) and a static left-column on desktop. Selecting an Agent locks the workspace into focus, eliminating all non-essential navigational elements.
B. Generative Protocol Synthesis (AI-on-AI)
Users are not limited to the forms generated during onboarding.
 * Input: User provides a short prompt (e.g., "Cold Email Generator").
 * Execution: The handleCreateProtocol function calls the LLM, passing the Agent's System Prompt as context.
 * Synthesis: The LLM returns a structured JSON object containing a new title, description, prompt template, and dynamic input fields.
 * Commit: The new form is saved to IndexedDB, instantly rendering a new form node in the background canvas, and becoming immediately usable in the UI.
C. LLM Resilience Protocol
To handle the non-deterministic nature of LLM JSON outputs, the system employs strict type-checking fallbacks during the Onboarding flow.
 * Array.isArray(result?.agents) ? result.agents : []
   This prevents fatal TypeError: is not iterable crashes if the LLM hallucinates object properties outside the defined schema.
