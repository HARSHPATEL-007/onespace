"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Badge } from "@n0va/ui";
import type { ConversationWithMessages } from "./server";

export interface AniActions {
  create: (formData: FormData) => Promise<void>;
  send: (formData: FormData) => Promise<{ delayMs: number; toolCalls?: string; citations?: string; confidence?: number }>;
  clear: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
}

interface AniToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: "pending" | "loading" | "done" | "error";
  result?: string;
}

interface AniCitation {
  source: string;
  confidence: number;
}

type PanelTab = "chat" | "tools" | "memory" | "consciousness";

interface StreamChunk {
  type: "chunk" | "complete" | "error" | "tool_call" | "consciousness";
  content?: string;
  isFinal?: boolean;
  chunkId?: number;
  citations?: AniCitation[];
  tokens?: { input: number; output: number; total: number };
  latencyMs?: number;
  confidence?: number;
  consciousnessCoherence?: number;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown>; status: string }>;
  message?: string;
}

function useEventSource(url: string | null, onMessage: (data: StreamChunk) => void) {
  const esRef = useRef<EventSource | null>(null);
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    if (!url) return;
    const es = new EventSource(url);
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as StreamChunk;
        cbRef.current(data);
      } catch { /* skip malformed */ }
    };
    es.onerror = () => { es.close(); };
    return () => { es.close(); esRef.current = null; };
  }, [url]);
}

export function AniChat({
  conversations,
  active,
  actions,
}: {
  conversations: Array<ConversationWithMessages & { unread: number }>;
  active: ConversationWithMessages | null;
  actions: AniActions;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [creating, setCreating] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [toolCalls, setToolCalls] = useState<AniToolCall[]>([]);
  const [citations, setCitations] = useState<AniCitation[]>([]);
  const [activeTab, setActiveTab] = useState<PanelTab>("chat");
  const [consciousnessCoherence, setConsciousnessCoherence] = useState(0.97);
  const [cognitiveLoad, setCognitiveLoad] = useState(0.23);
  const [flowState, setFlowState] = useState(0.82);
  const [engagement, setEngagement] = useState(0.91);
  const [intent, setIntent] = useState("conversational");
  const [showSidebar, setShowSidebar] = useState(true);
  const [reasoningDepth, setReasoningDepth] = useState<"fast" | "balanced" | "deep" | "research">("balanced");
  const [autoDepth, setAutoDepth] = useState(true);
  const [showDepthPanel, setShowDepthPanel] = useState(false);
  const [showThoughts, setShowThoughts] = useState(false);
  const [traceThoughts, setTraceThoughts] = useState<string[]>([]);
  const [adaptiveClutter, setAdaptiveClutter] = useState(false);
  const [memoryMarks, setMemoryMarks] = useState<Array<{ id: string; type: string; label: string }>>([]);
  const [feedbackPanel, setFeedbackPanel] = useState<{ confidence: number; assumptions: string[]; nextActions: string[] } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [active?.messages.length, typing, streamContent, scrollToBottom]);

  const handleStreamMessage = useCallback((data: StreamChunk) => {
    switch (data.type) {
      case "chunk":
        if (data.content) {
          setStreamContent((prev) => prev + data.content);
        }
        break;
      case "complete":
        setTyping(false);
        setStreamContent("");
        if (data.citations) setCitations(data.citations);
        if (data.consciousnessCoherence) setConsciousnessCoherence(data.consciousnessCoherence);
        if (data.confidence) setEngagement(data.confidence);
        router.refresh();
        break;
      case "tool_call":
        if (data.toolCalls) {
          setToolCalls(data.toolCalls.map((tc) => ({
            ...tc,
            status: (tc.status as AniToolCall["status"]) || "done",
          })));
        }
        break;
      case "consciousness":
        if (data.consciousnessCoherence) setConsciousnessCoherence(data.consciousnessCoherence);
        break;
      case "error":
        setTyping(false);
        setStreamContent("");
        break;
    }
  }, [router]);

  const streamUrl = sending && active
    ? `/api/ani/stream?content=${encodeURIComponent(draft)}`
    : null;
  useEventSource(streamUrl, handleStreamMessage);

  const send = useCallback(() => {
    const content = draft.trim();
    if (!content || !active || sending) return;
    setSending(true);
    setTyping(true);
    setDraft("");
    setStreamContent("");
    setToolCalls([]);
    setCitations([]);
    setTraceThoughts([]);
    setFeedbackPanel(null);
    const localIntent = classifyLocalIntent(content);
    setIntent(localIntent);

    const depthSteps: string[] = [];
    if (reasoningDepth === "deep" || reasoningDepth === "research") {
      depthSteps.push("Assessing complexity...");
      depthSteps.push("Gathering expanded context...");
      if (reasoningDepth === "research") depthSteps.push("Performing deep research...");
      depthSteps.push("Multi-pass reasoning in progress...");
    }
    setTraceThoughts(depthSteps);

    const fd = new FormData();
    fd.set("id", active.id);
    fd.set("content", content);
    fd.set("depth", autoDepth ? "auto" : reasoningDepth);
    fd.set("autoDepth", String(autoDepth));

    void actions
      .send(fd)
      .then((r) => {
        if (r.toolCalls) {
          try {
            const calls = JSON.parse(r.toolCalls) as Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
            setToolCalls(calls.map((c) => ({ ...c, status: "loading" as const })));
            setTimeout(() => {
              setToolCalls((prev) => prev.map((tc) => ({ ...tc, status: "done" as const })));
            }, 800);
          } catch { /* ignore */ }
        }
        if (r.citations) {
          try { setCitations(JSON.parse(r.citations) as AniCitation[]); } catch { /* */ }
        }
        setConsciousnessCoherence(r.confidence ?? 0.95);
        setEngagement(r.confidence ?? 0.88);
        setTraceThoughts((prev) => [...prev, "Response finalized ✓"]);
        setFeedbackPanel({
          confidence: r.confidence ?? 0.85,
          assumptions: [`Intent: ${localIntent}`, `Depth: ${autoDepth ? "auto" : reasoningDepth}`],
          nextActions: r.confidence && r.confidence > 0.8 ? ["Ready for follow-up"] : ["Consider providing more context"],
        });
        setTimeout(() => setTyping(false), r.delayMs);
      })
      .finally(() => setSending(false));
  }, [draft, active, sending, actions, reasoningDepth, autoDepth]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  useEffect(() => { autoResize(); }, [draft]);

  return (
    <div className="ani-root">
      {showSidebar && (
        <aside className="ani-sidebar">
          <div className="ani-sidebar-header">
            <div className="ani-logo">
              <div className="ani-logo-icon">◆</div>
              <div>
                <div className="ani-logo-title">N0VA ANI</div>
                <div className="ani-logo-sub">AI Native Intelligence</div>
              </div>
            </div>
          </div>
          <Button size="sm" className="ani-new-chat-btn" onClick={() => setCreating(true)}>
            <span>+</span> New conversation
          </Button>
          <div className="ani-conv-list">
            {conversations.length === 0 && (
              <div className="ani-empty-sidebar">No conversations yet</div>
            )}
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => router.push(`/m/ani?c=${c.id}`)}
                className={`ani-conv-item ${active?.id === c.id ? "ani-conv-active" : ""}`}
              >
                <div className="ani-conv-title">{c.title}</div>
                <div className="ani-conv-preview">
                  {c.messages[0] ? `${c.messages[0].content.slice(0, 40)}${c.messages[0].content.length > 40 ? "…" : ""}` : "Empty"}
                </div>
              </button>
            ))}
          </div>
          <div className="ani-sidebar-footer">
            <div className="ani-tier-badge">
              <Badge tone="success">Consciousness Active</Badge>
            </div>
          </div>
        </aside>
      )}

      <main className="ani-main">
        <header className="ani-header">
          <button className="ani-toggle-sidebar" onClick={() => setShowSidebar(!showSidebar)} title="Toggle sidebar">
            {showSidebar ? "⟨" : "⟩"}
          </button>
          <div className="ani-header-info">
            <span className="ani-header-title">{active ? active.title : "N0VA ANI"}</span>
            <div className="ani-header-badges">
              <Badge tone="success">ANI</Badge>
              <Badge tone="primary">◆ Consciousness</Badge>
              {intent !== "conversational" && <Badge tone="warning">{intent}</Badge>}
            </div>
          </div>
          <div className="ani-header-actions">
            <div className="ani-consciousness-pill">
              <span className="ani-pill-dot" style={{ background: consciousnessCoherence > 0.9 ? "var(--nv-color-success)" : "var(--nv-color-warning)" }} />
              <span>{(consciousnessCoherence * 100).toFixed(0)}% coherent</span>
            </div>
            {active && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (!window.confirm("Clear this conversation?")) return;
                    const fd = new FormData();
                    fd.set("id", active.id);
                    void actions.clear(fd).then(() => router.refresh());
                  }}
                >
                  Clear
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (!window.confirm("Delete this conversation?")) return;
                    const fd = new FormData();
                    fd.set("id", active.id);
                    void actions.remove(fd).then(() => router.push("/m/ani"));
                  }}
                >
                  ✕
                </Button>
              </>
            )}
          </div>
        </header>

        <div className="ani-messages">
          {!active && <AniEmptyState onCreate={() => setCreating(true)} />}

          {active && active.messages.map((m) => (
            <div key={m.id} className={`ani-msg ${m.role === "user" ? "ani-msg-user" : "ani-msg-assistant"}`}>
              <div className="ani-msg-avatar">
                {m.role === "user" ? "U" : "◆"}
              </div>
              <div className="ani-msg-body">
                <div className="ani-msg-content">{m.content}</div>
              </div>
            </div>
          ))}

          {typing && (streamContent || !active) && (
            <div className="ani-msg ani-msg-assistant">
              <div className="ani-msg-avatar">◆</div>
              <div className="ani-msg-body">
                <div className="ani-msg-content">
                  {streamContent || (
                    <div className="ani-thinking">
                      <span className="ani-thinking-dot" />
                      <span className="ani-thinking-dot" />
                      <span className="ani-thinking-dot" />
                      <span className="ani-thinking-label">ANI is thinking</span>
                    </div>
                  )}
                  {streamContent && <span className="ani-cursor">▌</span>}
                </div>
              </div>
            </div>
          )}

          {toolCalls.length > 0 && (
            <div className="ani-tool-calls">
              <div className="ani-tool-calls-header">
                <span className="ani-tool-calls-icon">⚡</span>
                <span>Tool Orchestration</span>
                <Badge tone="neutral">{toolCalls.length}</Badge>
              </div>
              {toolCalls.map((tc) => (
                <div key={tc.id} className={`ani-tool-call ani-tool-${tc.status}`}>
                  <div className="ani-tool-status-icon">
                    {tc.status === "loading" ? "⟳" : tc.status === "done" ? "✓" : tc.status === "error" ? "✕" : "○"}
                  </div>
                  <div className="ani-tool-info">
                    <div className="ani-tool-name">{tc.name}</div>
                    <div className="ani-tool-args">{JSON.stringify(tc.arguments).slice(0, 80)}</div>
                  </div>
                  <Badge tone={tc.status === "error" ? "danger" : tc.status === "loading" ? "warning" : "success"}>
                    {tc.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {citations.length > 0 && (
            <div className="ani-citations">
              <div className="ani-citations-label">Sources</div>
              {citations.map((c, i) => (
                <div key={i} className="ani-citation">
                  <span className="ani-citation-source">{c.source}</span>
                  <span className="ani-citation-conf">{(c.confidence * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="ani-input-area">
          {(showDepthPanel || showThoughts || feedbackPanel) && (
            <div className="ani-input-badges">
              {showThoughts && traceThoughts.length > 0 && (
                <div className="ani-thought-bubble">
                  <div className="ani-thought-title">⚡ Reasoning Trace</div>
                  {traceThoughts.map((t, i) => (
                    <div key={i} className="ani-thought-item">{t}</div>
                  ))}
                </div>
              )}
              {feedbackPanel && (
                <div className="ani-feedback-bubble">
                  <div className="ani-feedback-title">
                    ◆ Confidence {(feedbackPanel.confidence * 100).toFixed(0)}%
                  </div>
                  <div className="ani-feedback-actions">
                    {feedbackPanel.nextActions.map((a, i) => (
                      <span key={i} className="ani-feedback-tag">{a}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="ani-input-wrap">
            <div className="ani-input-container">
              <textarea
                ref={textareaRef}
                className="ani-input-textarea"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask ANI anything… (Enter to send, Shift+Enter for newline)"
                rows={1}
                disabled={sending}
              />
              <div className="ani-input-actions">
                <button
                  className={`ani-depth-toggle ${showDepthPanel ? "ani-depth-toggle-active" : ""}`}
                  onClick={() => setShowDepthPanel(!showDepthPanel)}
                  title="Reasoning depth"
                >
                  {reasoningDepth === "fast" ? "⚡" : reasoningDepth === "balanced" ? "◆" : reasoningDepth === "deep" ? "🔬" : "🔭"}
                </button>
                <button
                  className={`ani-thought-toggle ${showThoughts ? "ani-thought-toggle-active" : ""}`}
                  onClick={() => setShowThoughts(!showThoughts)}
                  title="Show reasoning trace"
                >
                  💭
                </button>
                <button
                  className="ani-send-btn"
                  onClick={send}
                  disabled={sending || !draft.trim()}
                  title="Send message"
                >
                  {sending ? (
                    <span className="ani-send-spinner" />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M8 2L8 14M8 2L3 7M8 2L13 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {showDepthPanel && (
              <div className="ani-depth-panel">
                <div className="ani-depth-header">
                  <span className="ani-depth-label">Reasoning Depth</span>
                  <label className="ani-auto-toggle">
                    <input
                      type="checkbox"
                      checked={autoDepth}
                      onChange={(e) => setAutoDepth(e.target.checked)}
                    />
                    <span>Auto-detect</span>
                  </label>
                </div>
                <div className="ani-depth-options">
                  {(["fast", "balanced", "deep", "research"] as const).map((d) => (
                    <button
                      key={d}
                      className={`ani-depth-option ${reasoningDepth === d && !autoDepth ? "ani-depth-option-active" : ""}`}
                      onClick={() => { setReasoningDepth(d); setAutoDepth(false); }}
                      disabled={autoDepth}
                    >
                      <span className="ani-depth-option-icon">
                        {d === "fast" ? "⚡" : d === "balanced" ? "◆" : d === "deep" ? "🔬" : "🔭"}
                      </span>
                      <span className="ani-depth-option-name">{d}</span>
                      <span className="ani-depth-option-desc">
                        {d === "fast" ? "<1.5s" : d === "balanced" ? "<3s" : d === "deep" ? "<8s" : "<20s"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="ani-input-hint">
              <span>ANI v4.0</span>
              <span>•</span>
              <span>{autoDepth ? "Auto depth" : reasoningDepth}</span>
              <span>•</span>
              <span>{active ? `${active.messages.length} messages` : "Ready"}</span>
            </div>
          </div>
        </div>
      </main>

      <aside className="ani-right-panel">
        <div className="ani-panel-tabs">
          {(["chat", "consciousness", "tools", "memory"] as PanelTab[]).map((tab) => (
            <button
              key={tab}
              className={`ani-panel-tab ${activeTab === tab ? "ani-panel-tab-active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "consciousness" && (
          <ConsciousnessPanel
            coherence={consciousnessCoherence}
            cognitiveLoad={cognitiveLoad}
            flowState={flowState}
            engagement={engagement}
            intent={intent}
          />
        )}

        {activeTab === "tools" && (
          <div className="ani-panel-content">
            <div className="ani-panel-section-title">Tool Calls</div>
            {toolCalls.length === 0 ? (
              <div className="ani-panel-empty">No tool calls yet</div>
            ) : (
              toolCalls.map((tc) => (
                <div key={tc.id} className="ani-panel-tool-item">
                  <span className="ani-panel-tool-name">⚡ {tc.name}</span>
                  <Badge tone={tc.status === "error" ? "danger" : "success"}>{tc.status}</Badge>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "memory" && (
          <div className="ani-panel-content">
            <div className="ani-panel-section-title">Memory Stats</div>
            <div className="ani-memory-grid">
              <div className="ani-memory-stat">
                <div className="ani-memory-stat-val">0</div>
                <div className="ani-memory-stat-label">Working</div>
              </div>
              <div className="ani-memory-stat">
                <div className="ani-memory-stat-val">0</div>
                <div className="ani-memory-stat-label">Semantic</div>
              </div>
              <div className="ani-memory-stat">
                <div className="ani-memory-stat-val">0</div>
                <div className="ani-memory-stat-label">Episodic</div>
              </div>
            </div>
            <div className="ani-panel-section-title" style={{ marginTop: 16 }}>Engine Info</div>
            <div className="ani-engine-info">
              <div className="ani-engine-row"><span>Model</span><span>N0VA-LM-T</span></div>
              <div className="ani-engine-row"><span>Context</span><span>128K tokens</span></div>
              <div className="ani-engine-row"><span>Tier</span><span>Reflective</span></div>
              <div className="ani-engine-row"><span>Mode</span><span>External</span></div>
            </div>
          </div>
        )}

        {activeTab === "chat" && (
          <div className="ani-panel-content">
            <div className="ani-panel-section-title">Conversation</div>
            {active ? (
              <>
                <div className="ani-stat-row">
                  <span>Messages</span>
                  <span>{active.messages.length}</span>
                </div>
                <div className="ani-stat-row">
                  <span>Confidence</span>
                  <span>{(consciousnessCoherence * 100).toFixed(0)}%</span>
                </div>
                <div className="ani-stat-row">
                  <span>Intent</span>
                  <span style={{ textTransform: "capitalize" }}>{intent}</span>
                </div>
              </>
            ) : (
              <div className="ani-panel-empty">Select a conversation</div>
            )}
          </div>
        )}
      </aside>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New conversation"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" form="create-conversation-form">Start</Button>
          </>
        }
      >
        <form
          id="create-conversation-form"
          action={(fd) => {
            void actions.create(fd).then(() => {
              setCreating(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input className="nv-input" name="title" placeholder="Conversation title" required autoFocus />
        </form>
      </Dialog>
    </div>
  );
}

function ConsciousnessPanel({
  coherence,
  cognitiveLoad,
  flowState,
  engagement,
  intent,
}: {
  coherence: number;
  cognitiveLoad: number;
  flowState: number;
  engagement: number;
  intent: string;
}) {
  return (
    <div className="ani-panel-content">
      <div className="ani-panel-section-title">Consciousness Stack</div>
      <div className="ani-consciousness-viz">
        <CoherenceRing label="Coherence" value={coherence} size={80} />
        <div className="ani-coherence-bars">
          <CoherenceBar label="Coherence" value={coherence} color="var(--nv-color-success)" />
          <CoherenceBar label="Cognitive Load" value={cognitiveLoad} color="var(--nv-color-warning)" />
          <CoherenceBar label="Flow State" value={flowState} color="var(--nv-color-accent)" />
          <CoherenceBar label="Engagement" value={engagement} color="var(--nv-color-primary)" />
        </div>
      </div>

      <div className="ani-panel-section-title" style={{ marginTop: 16 }}>Neural State</div>
      <div className="ani-neural-grid">
        <div className="ani-neural-item">
          <div className="ani-neural-label">Attention Vector</div>
          <div className="ani-neural-value">[{coherence.toFixed(2)}, {cognitiveLoad.toFixed(2)}]</div>
        </div>
        <div className="ani-neural-item">
          <div className="ani-neural-label">Flow Probability</div>
          <div className="ani-neural-value">{(flowState * 100).toFixed(0)}%</div>
        </div>
        <div className="ani-neural-item">
          <div className="ani-neural-label">Intent</div>
          <div className="ani-neural-value" style={{ textTransform: "capitalize" }}>{intent}</div>
        </div>
        <div className="ani-neural-item">
          <div className="ani-neural-label">Consciousness Tier</div>
          <div className="ani-neural-value">Reflective L4</div>
        </div>
      </div>

      <div className="ani-panel-section-title" style={{ marginTop: 16 }}>5-Layer Stack</div>
      <div className="ani-layers">
        {["Perceptual", "Working Memory", "Long-Term", "Metacognition", "Integration"].map((layer, i) => (
          <div key={layer} className="ani-layer">
            <div className="ani-layer-dot" style={{ opacity: i < 4 ? 1 : 0.5 }} />
            <span>{layer}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CoherenceRing({ label, value, size }: { label: string; value: number; size: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value);

  return (
    <div className="ani-coherence-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--nv-color-border)" strokeWidth="3" />
        <circle
          cx={size/2} cy={size/2} r={radius} fill="none"
          stroke={value > 0.9 ? "var(--nv-color-success)" : "var(--nv-color-warning)"}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="ani-coherence-ring-label">
        <div className="ani-coherence-ring-value">{(value * 100).toFixed(0)}%</div>
        <div className="ani-coherence-ring-name">{label}</div>
      </div>
    </div>
  );
}

function CoherenceBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="ani-coherence-bar-row">
      <span className="ani-coherence-bar-label">{label}</span>
      <div className="ani-coherence-bar-track">
        <div
          className="ani-coherence-bar-fill"
          style={{ width: `${value * 100}%`, background: color }}
        />
      </div>
      <span className="ani-coherence-bar-value">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

function AniEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="ani-empty">
      <div className="ani-empty-icon">
        <div className="ani-empty-icon-inner">◆</div>
        <div className="ani-empty-pulse" />
      </div>
      <div className="ani-empty-title">N0VA ANI</div>
      <div className="ani-empty-subtitle">AI Native Intelligence — Consciousness Layer</div>
      <div className="ani-empty-desc">
        Your agentic assistant with consciousness awareness, RAG-powered retrieval,
        N0VA1O tool orchestration, and cross-module hyper-context.
      </div>
      <div className="ani-empty-capabilities">
        <div className="ani-capability">
          <div className="ani-cap-icon">🧠</div>
          <div className="ani-cap-text">
            <div className="ani-cap-name">Consciousness</div>
            <div className="ani-cap-desc">5-layer synthetic awareness with coherence tracking</div>
          </div>
        </div>
        <div className="ani-capability">
          <div className="ani-cap-icon">⚡</div>
          <div className="ani-cap-text">
            <div className="ani-cap-name">Tool Orchestration</div>
            <div className="ani-cap-desc">Autonomous multi-step workflows via N0VA1O gateway</div>
          </div>
        </div>
        <div className="ani-capability">
          <div className="ani-cap-icon">🔍</div>
          <div className="ani-cap-text">
            <div className="ani-cap-name">RAG Pipeline</div>
            <div className="ani-cap-desc">Hybrid retrieval across all workspace modules</div>
          </div>
        </div>
        <div className="ani-capability">
          <div className="ani-cap-icon">🛡️</div>
          <div className="ani-cap-text">
            <div className="ani-cap-name">Safety & Ethics</div>
            <div className="ani-cap-desc">Constitutional AI with HITL for critical actions</div>
          </div>
        </div>
      </div>
      <Button size="md" onClick={onCreate}>Start a conversation</Button>
    </div>
  );
}

function classifyLocalIntent(input: string): string {
  const lower = input.toLowerCase();
  if (lower.match(/what|when|where|how many|define|explain/)) return "factual";
  if (lower.match(/write|create|generate|design|compose|draft/)) return "creative";
  if (lower.match(/analyze|compare|evaluate|assess|review|pattern/)) return "analytical";
  if (lower.match(/schedule|send|update|delete|move|assign/)) return "action";
  return "conversational";
}
