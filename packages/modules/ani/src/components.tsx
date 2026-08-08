"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Badge } from "@n0va/ui";
import type { ConversationWithMessages } from "./server";
import type {
  UserSegment,
  ProactiveRecommendation,
  Walkthrough,
  GuideCard,
} from "./education";
import {
  createDefaultVoiceState,
  matchVoiceCommand,
  transformContent,
  getClutterConfig,
  createCrossSessionMemory,
  runCheckpoint,
  STANDARD_CHECKPOINTS,
  detectInjectionRisk,
  enrichCitations,
  type VoiceState,
  type ContentTransformResult,
  type ClutterConfig,
} from "./remaining-features";
import {
  createDefaultTtsState,
  speakText,
  stopSpeech,
  createLearningModule,
  evaluateLearningAnswer,
  constrainResearch,
  createTaskProgress,
  updateTaskStep,
  recordOutcome,
  summarizeOutcomes,
  recallMemories,
  buildContextGraph,
  type VoiceTtsState,
  type LearningModule,
  type LearningStep,
  type TaskProgress,
  type ConstrainedResearchResult,
  type ContextGraph3D,
  type PersistentMemoryEntry,
  type OutcomeRecord,
} from "./remaining-capabilities";
import {
  layoutForceDirected3D,
  project3Dto2D,
  initializeMeetingIntelligence,
  updateMeetingWithTranscript,
  selectOptimalModel,
  buildCausalChain,
  monitorToolHealth,
  adaptToneForContext,
  runSelfOptimizationCheck,
  type MeetingIntelligenceState,
  type GraphLayout3D,
} from "./ani-integration";

interface WalkthroughNotification {
  id: string;
  title: string;
  description: string;
  step: number;
  totalSteps: number;
}

interface GuideCardNotification {
  id: string;
  icon: string;
  title: string;
  body: string;
  feature: string;
}

interface ProactiveRecNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  relevanceScore: number;
}

export interface AniActions {
  create: (formData: FormData) => Promise<void>;
  send: (formData: FormData) => Promise<{
    delayMs: number;
    toolCalls?: string;
    citations?: string;
    confidence?: number;
  }>;
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
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    status: string;
  }>;
  message?: string;
}

function useEventSource(
  url: string | null,
  onMessage: (data: StreamChunk) => void,
) {
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
      } catch {
        /* skip malformed */
      }
    };
    es.onerror = () => {
      es.close();
    };
    return () => {
      es.close();
      esRef.current = null;
    };
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
  const [reasoningDepth, setReasoningDepth] = useState<
    "fast" | "balanced" | "deep" | "research"
  >("balanced");
  const [autoDepth, setAutoDepth] = useState(true);
  const [showDepthPanel, setShowDepthPanel] = useState(false);
  const [showThoughts, setShowThoughts] = useState(false);
  const [traceThoughts, setTraceThoughts] = useState<string[]>([]);
  const [adaptiveClutter, setAdaptiveClutter] = useState(false);
  const [memoryMarks, setMemoryMarks] = useState<
    Array<{ id: string; type: string; label: string }>
  >([]);
  const [feedbackPanel, setFeedbackPanel] = useState<{
    confidence: number;
    assumptions: string[];
    nextActions: string[];
  } | null>(null);
  const [activeWalkthrough, setActiveWalkthrough] =
    useState<WalkthroughNotification | null>(null);
  const [guideCards, setGuideCards] = useState<GuideCardNotification[]>([]);
  const [proactiveRecs, setProactiveRecs] = useState<
    ProactiveRecNotification[]
  >([]);
  const [userSegment, setUserSegment] = useState<
    "new" | "casual" | "power" | "enterprise"
  >("new");
  const [voiceState, setVoiceState] = useState<VoiceState>(
    createDefaultVoiceState(),
  );
  const [clutterConfig, setClutterConfig] = useState<ClutterConfig>(
    getClutterConfig("balanced", 0.3),
  );
  const [showTransformPanel, setShowTransformPanel] = useState(false);
  const [lastTransform, setLastTransform] =
    useState<ContentTransformResult | null>(null);
  const [safetyWarnings, setSafetyWarnings] = useState<string[]>([]);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [sessionMemory, setSessionMemory] = useState<ReturnType<
    typeof createCrossSessionMemory
  > | null>(null);
  const [ttsState, setTtsState] = useState<VoiceTtsState>(
    createDefaultTtsState(),
  );
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showLearning, setShowLearning] = useState(false);
  const [learningModule, setLearningModule] = useState<LearningModule | null>(
    null,
  );
  const [learningStep, setLearningStep] = useState(0);
  const [taskProgress, setTaskProgress] = useState<TaskProgress | null>(null);
  const [showProgressPanel, setShowProgressPanel] = useState(false);
  const [persistentMemory, setPersistentMemory] = useState<
    PersistentMemoryEntry[]
  >([]);
  const [outcomes, setOutcomes] = useState<OutcomeRecord[]>([]);
  const [showOutcomePanel, setShowOutcomePanel] = useState(false);
  const [contextGraph, setContextGraph] = useState<ContextGraph3D | null>(null);
  const [showGraphPanel, setShowGraphPanel] = useState(false);
  const [showMeetingPanel, setShowMeetingPanel] = useState(false);
  const [meetingState, setMeetingState] =
    useState<MeetingIntelligenceState | null>(null);
  const [graphLayout, setGraphLayout] = useState<GraphLayout3D | null>(null);
  const graphCanvasRef = useRef<HTMLCanvasElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [active?.messages.length, typing, streamContent, scrollToBottom]);

  useEffect(() => {
    const sessionCount = conversations.length + 1;
    if (sessionCount <= 1) {
      setUserSegment("new");
      setGuideCards([
        {
          id: "guide_welcome",
          icon: "◆",
          title: "Welcome to N0VA ANI",
          body: "Try asking a complex question and enable Deep Think mode for step-by-step reasoning.",
          feature: "welcome",
        },
      ]);
    } else if (sessionCount > 10) {
      setUserSegment("power");
    }
  }, [conversations.length]);

  useEffect(() => {
    if (active && active.messages.length >= 3 && proactiveRecs.length === 0) {
      const tips = [
        {
          id: "rec_trace",
          type: "tip",
          title: "See ANI's reasoning",
          body: "Click the 💭 icon to view how ANI arrived at its answer.",
          relevanceScore: 0.8,
        },
        {
          id: "rec_depth",
          type: "tip",
          title: "Try Deep Think for complex tasks",
          body: "Use the depth selector for multi-step reasoning on hard problems.",
          relevanceScore: 0.75,
        },
      ];
      setProactiveRecs(tips.slice(0, 1));
    }
  }, [active?.messages.length, proactiveRecs.length]);

  const handleStreamMessage = useCallback(
    (data: StreamChunk) => {
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
          if (data.consciousnessCoherence)
            setConsciousnessCoherence(data.consciousnessCoherence);
          if (data.confidence) setEngagement(data.confidence);
          router.refresh();
          break;
        case "tool_call":
          if (data.toolCalls) {
            setToolCalls(
              data.toolCalls.map((tc) => ({
                ...tc,
                status: (tc.status as AniToolCall["status"]) || "done",
              })),
            );
          }
          break;
        case "consciousness":
          if (data.consciousnessCoherence)
            setConsciousnessCoherence(data.consciousnessCoherence);
          break;
        case "error":
          setTyping(false);
          setStreamContent("");
          break;
      }
    },
    [router],
  );

  const streamUrl =
    sending && active
      ? `/api/ani/stream?content=${encodeURIComponent(draft)}`
      : null;
  useEventSource(streamUrl, handleStreamMessage);

  const send = useCallback(() => {
    const content = draft.trim();
    if (!content || !active || sending) return;

    const injectionCheck = detectInjectionRisk(content);
    if (injectionCheck.risk === "high") {
      setSafetyWarnings([
        ...safetyWarnings,
        `Blocked: ${injectionCheck.indicators.join(", ")}`,
      ]);
      setSending(false);
      return;
    }

    setSending(true);
    setTyping(true);
    setDraft("");
    setStreamContent("");
    setToolCalls([]);
    setCitations([]);
    setTraceThoughts([]);
    setSafetyWarnings([]);
    setFeedbackPanel(null);
    const localIntent = classifyLocalIntent(content);
    setIntent(localIntent);

    const depthSteps: string[] = [];
    if (reasoningDepth === "deep" || reasoningDepth === "research") {
      depthSteps.push("Assessing complexity...");
      depthSteps.push("Gathering expanded context...");
      if (reasoningDepth === "research")
        depthSteps.push("Performing deep research...");
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
            const calls = JSON.parse(r.toolCalls) as Array<{
              id: string;
              name: string;
              arguments: Record<string, unknown>;
            }>;
            setToolCalls(
              calls.map((c) => ({ ...c, status: "loading" as const })),
            );
            setTimeout(() => {
              setToolCalls((prev) =>
                prev.map((tc) => ({ ...tc, status: "done" as const })),
              );
            }, 800);
          } catch {
            /* ignore */
          }
        }
        if (r.citations) {
          try {
            setCitations(JSON.parse(r.citations) as AniCitation[]);
          } catch {
            /* */
          }
        }
        setConsciousnessCoherence(r.confidence ?? 0.95);
        setEngagement(r.confidence ?? 0.88);
        setTraceThoughts((prev) => [...prev, "Response finalized ✓"]);
        setFeedbackPanel({
          confidence: r.confidence ?? 0.85,
          assumptions: [
            `Intent: ${localIntent}`,
            `Depth: ${autoDepth ? "auto" : reasoningDepth}`,
          ],
          nextActions:
            r.confidence && r.confidence > 0.8
              ? ["Ready for follow-up"]
              : ["Consider providing more context"],
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

  useEffect(() => {
    autoResize();
  }, [draft]);

  useEffect(() => {
    if (!contextGraph || !graphLayout) return;
    const canvas = graphCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "var(--nv-color-bg)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const edge of graphLayout.edges) {
      const source = graphLayout.nodes.find((n) => n.id === edge.source);
      const target = graphLayout.nodes.find((n) => n.id === edge.target);
      if (!source || !target) continue;
      const s2d = project3Dto2D(
        source.x,
        source.y,
        source.z,
        graphLayout.bounds,
        canvas.width,
        canvas.height,
      );
      const t2d = project3Dto2D(
        target.x,
        target.y,
        target.z,
        graphLayout.bounds,
        canvas.width,
        canvas.height,
      );
      ctx.strokeStyle = "var(--nv-color-border)";
      ctx.lineWidth = edge.weight * 1.5;
      ctx.beginPath();
      ctx.moveTo(s2d.sx, s2d.sy);
      ctx.lineTo(t2d.sx, t2d.sy);
      ctx.stroke();
    }

    for (const node of graphLayout.nodes) {
      const pos = project3Dto2D(
        node.x,
        node.y,
        node.z,
        graphLayout.bounds,
        canvas.width,
        canvas.height,
      );
      const radius = 4 + node.weight * 2;
      ctx.beginPath();
      ctx.arc(pos.sx, pos.sy, radius * pos.scale, 0, Math.PI * 2);
      ctx.fillStyle = node.color ?? "var(--nv-color-primary)";
      ctx.fill();
      ctx.font = `${Math.round(9 * pos.scale)}px var(--nv-font-mono)`;
      ctx.fillStyle = "var(--nv-color-text)";
      ctx.fillText(
        node.label.slice(0, 15),
        pos.sx + radius * pos.scale + 3,
        pos.sy + 3,
      );
    }
  }, [contextGraph, graphLayout]);

  useEffect(() => {
    if (showGraphPanel && !contextGraph && active) {
      const docs = [{ id: "1", title: active.title, module: "ani" }];
      const graph = buildContextGraph([{ messages: active.messages }], docs);
      setContextGraph(graph);
      setGraphLayout(layoutForceDirected3D(graph, 80));
    }
  }, [showGraphPanel, contextGraph, active]);

  useEffect(() => {
    if (showMeetingPanel && !meetingState) {
      setMeetingState(
        initializeMeetingIntelligence("meeting_1", ["You", "ANI"]),
      );
    }
  }, [showMeetingPanel, meetingState]);

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
          <Button
            size="sm"
            className="ani-new-chat-btn"
            onClick={() => setCreating(true)}
          >
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
                  {c.messages[0]
                    ? `${c.messages[0].content.slice(0, 40)}${c.messages[0].content.length > 40 ? "…" : ""}`
                    : "Empty"}
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
          <button
            className="ani-toggle-sidebar"
            onClick={() => setShowSidebar(!showSidebar)}
            title="Toggle sidebar"
          >
            {showSidebar ? "⟨" : "⟩"}
          </button>
          <div className="ani-header-info">
            <span className="ani-header-title">
              {active ? active.title : "N0VA ANI"}
            </span>
            <div className="ani-header-badges">
              <Badge tone="success">ANI</Badge>
              <Badge tone="primary">◆ Consciousness</Badge>
              {intent !== "conversational" && (
                <Badge tone="warning">{intent}</Badge>
              )}
            </div>
          </div>
          <div className="ani-header-actions">
            <div className="ani-consciousness-pill">
              <span
                className="ani-pill-dot"
                style={{
                  background:
                    consciousnessCoherence > 0.9
                      ? "var(--nv-color-success)"
                      : "var(--nv-color-warning)",
                }}
              />
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

          {active &&
            active.messages.map((m) => (
              <div
                key={m.id}
                className={`ani-msg ${m.role === "user" ? "ani-msg-user" : "ani-msg-assistant"}`}
              >
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
                      <span className="ani-thinking-label">
                        ANI is thinking
                      </span>
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
                <div
                  key={tc.id}
                  className={`ani-tool-call ani-tool-${tc.status}`}
                >
                  <div className="ani-tool-status-icon">
                    {tc.status === "loading"
                      ? "⟳"
                      : tc.status === "done"
                        ? "✓"
                        : tc.status === "error"
                          ? "✕"
                          : "○"}
                  </div>
                  <div className="ani-tool-info">
                    <div className="ani-tool-name">{tc.name}</div>
                    <div className="ani-tool-args">
                      {JSON.stringify(tc.arguments).slice(0, 80)}
                    </div>
                  </div>
                  <Badge
                    tone={
                      tc.status === "error"
                        ? "danger"
                        : tc.status === "loading"
                          ? "warning"
                          : "success"
                    }
                  >
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
                  <span className="ani-citation-conf">
                    {(c.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {(activeWalkthrough ||
          guideCards.length > 0 ||
          proactiveRecs.length > 0) && (
          <div className="ani-education-bar">
            {activeWalkthrough && (
              <div className="ani-walkthrough-card">
                <div className="ani-wt-header">
                  <span className="ani-wt-icon">🎓</span>
                  <span className="ani-wt-title">
                    {activeWalkthrough.title}
                  </span>
                  <span className="ani-wt-steps">
                    Step {activeWalkthrough.step}/{activeWalkthrough.totalSteps}
                  </span>
                </div>
                <div className="ani-wt-body">
                  {activeWalkthrough.description}
                </div>
                <div className="ani-wt-actions">
                  <Button size="sm" onClick={() => setActiveWalkthrough(null)}>
                    Got it
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setActiveWalkthrough(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
            {guideCards.slice(0, 1).map((card) => (
              <div key={card.id} className="ani-guide-card">
                <span className="ani-guide-icon">{card.icon}</span>
                <div className="ani-guide-content">
                  <div className="ani-guide-title">{card.title}</div>
                  <div className="ani-guide-body">{card.body}</div>
                </div>
                <button
                  className="ani-guide-close"
                  onClick={() =>
                    setGuideCards((prev) =>
                      prev.filter((c) => c.id !== card.id),
                    )
                  }
                >
                  ✕
                </button>
              </div>
            ))}
            {proactiveRecs.slice(0, 1).map((rec) => (
              <div key={rec.id} className="ani-rec-card">
                <span className="ani-rec-icon">
                  {rec.type === "tip"
                    ? "💡"
                    : rec.type === "workflow"
                      ? "⚡"
                      : rec.type === "insight"
                        ? "📊"
                        : "⌨️"}
                </span>
                <div className="ani-rec-content">
                  <div className="ani-rec-title">{rec.title}</div>
                  <div className="ani-rec-body">{rec.body}</div>
                </div>
                <button
                  className="ani-rec-close"
                  onClick={() =>
                    setProactiveRecs((prev) =>
                      prev.filter((r) => r.id !== rec.id),
                    )
                  }
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="ani-capability-bar">
          <div className="ani-capability-buttons">
            <button
              className={`ani-cap-btn ${showLearning ? "ani-cap-btn-active" : ""}`}
              onClick={() => {
                setShowLearning(!showLearning);
                setShowProgressPanel(false);
                setShowOutcomePanel(false);
                setShowGraphPanel(false);
              }}
              title="Learning mode"
            >
              📚
            </button>
            <button
              className={`ani-cap-btn ${showProgressPanel ? "ani-cap-btn-active" : ""}`}
              onClick={() => {
                setShowProgressPanel(!showProgressPanel);
                setShowLearning(false);
                setShowOutcomePanel(false);
                setShowGraphPanel(false);
              }}
              title="Task progress"
            >
              📊
            </button>
            <button
              className={`ani-cap-btn ${showOutcomePanel ? "ani-cap-btn-active" : ""}`}
              onClick={() => {
                setShowOutcomePanel(!showOutcomePanel);
                setShowLearning(false);
                setShowProgressPanel(false);
                setShowGraphPanel(false);
              }}
              title="Outcomes"
            >
              🏆
            </button>
            <button
              className={`ani-cap-btn ${showGraphPanel ? "ani-cap-btn-active" : ""}`}
              onClick={() => {
                setShowGraphPanel(!showGraphPanel);
                setShowLearning(false);
                setShowProgressPanel(false);
                setShowOutcomePanel(false);
              }}
              title="Context graph"
            >
              🕸️
            </button>
            <button
              className={`ani-cap-btn ${showMeetingPanel ? "ani-cap-btn-active" : ""}`}
              onClick={() => {
                setShowMeetingPanel(!showMeetingPanel);
                setShowLearning(false);
                setShowProgressPanel(false);
                setShowOutcomePanel(false);
                setShowGraphPanel(false);
              }}
              title="Meeting intelligence"
            >
              👥
            </button>
            {ttsState.supported && active && active.messages.length > 0 && (
              <button
                className={`ani-cap-btn ${isSpeaking ? "ani-cap-btn-active" : ""}`}
                onClick={() => {
                  if (isSpeaking) {
                    stopSpeech();
                    setIsSpeaking(false);
                  } else {
                    const last = active.messages
                      .filter((m) => m.role === "assistant")
                      .pop();
                    if (last) {
                      speakText(last.content, ttsState).then(() =>
                        setIsSpeaking(false),
                      );
                      setIsSpeaking(true);
                    }
                  }
                }}
                title={isSpeaking ? "Stop speaking" : "Speak last response"}
              >
                {isSpeaking ? "🔊" : "🔈"}
              </button>
            )}
          </div>
        </div>

        {showLearning && (
          <div className="ani-capability-panel">
            <div className="ani-panel-header">
              <span>📚 Learning Mode</span>
              <button
                className="ani-panel-close"
                onClick={() => setShowLearning(false)}
              >
                ✕
              </button>
            </div>
            {!learningModule ? (
              <div className="ani-learning-topics">
                {["architecture", "decision-making", "system-design"].map(
                  (topic) => (
                    <button
                      key={topic}
                      className="ani-topic-btn"
                      onClick={() => {
                        setLearningModule(
                          createLearningModule(topic, "beginner"),
                        );
                        setLearningStep(0);
                      }}
                    >
                      {topic}
                    </button>
                  ),
                )}
              </div>
            ) : (
              <div className="ani-learning-content">
                <div className="ani-learning-header">
                  <button
                    className="ani-learning-back"
                    onClick={() => setLearningModule(null)}
                  >
                    ← Topics
                  </button>
                  <span className="ani-learning-title">
                    {learningModule.title}
                  </span>
                  <span className="ani-learning-step">
                    Step {learningStep + 1}/{learningModule.steps.length}
                  </span>
                </div>
                {learningModule.steps[learningStep] && (
                  <div className="ani-learning-step-content">
                    <div className="ani-step-title">
                      {learningModule.steps[learningStep]!.title}
                    </div>
                    <div className="ani-step-body">
                      {learningModule.steps[learningStep]!.content}
                    </div>
                    <div className="ani-step-points">
                      {learningModule.steps[learningStep]!.keyPoints.map(
                        (p, i) => (
                          <span key={i} className="ani-step-point">
                            • {p}
                          </span>
                        ),
                      )}
                    </div>
                    {learningModule.steps[learningStep]!.checkQuestion && (
                      <div className="ani-step-check">
                        <div className="ani-check-q">
                          {learningModule.steps[learningStep]!.checkQuestion}
                        </div>
                        <div className="ani-check-hint">
                          Think about the key points above, then continue to
                          check your understanding.
                        </div>
                      </div>
                    )}
                    <div className="ani-learning-nav">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setLearningStep(Math.max(0, learningStep - 1))
                        }
                        disabled={learningStep === 0}
                      >
                        ← Previous
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (learningStep < learningModule.steps.length - 1)
                            setLearningStep(learningStep + 1);
                          else {
                            setLearningModule(null);
                            setLearningStep(0);
                          }
                        }}
                      >
                        {learningStep < learningModule.steps.length - 1
                          ? "Next →"
                          : "Complete ✓"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {showProgressPanel && (
          <div className="ani-capability-panel">
            <div className="ani-panel-header">
              <span>📊 Task Progress</span>
              <button
                className="ani-panel-close"
                onClick={() => setShowProgressPanel(false)}
              >
                ✕
              </button>
            </div>
            {!taskProgress ? (
              <div className="ani-progress-empty">
                No active tasks. Autonomous workflows will show progress here.
              </div>
            ) : (
              <div className="ani-progress-content">
                <div className="ani-progress-header">
                  <span className="ani-progress-label">
                    {taskProgress.label}
                  </span>
                  <span className="ani-progress-pct">
                    {Math.round(taskProgress.progress * 100)}%
                  </span>
                </div>
                <div className="ani-progress-track">
                  <div
                    className="ani-progress-fill"
                    style={{ width: `${taskProgress.progress * 100}%` }}
                  />
                </div>
                <div className="ani-progress-steps">
                  {taskProgress.steps.map((s, i) => (
                    <div
                      key={i}
                      className={`ani-progress-step ani-step-${s.status}`}
                    >
                      <span className="ani-step-icon">
                        {s.status === "completed"
                          ? "✓"
                          : s.status === "active"
                            ? "⟳"
                            : s.status === "failed"
                              ? "✕"
                              : "○"}
                      </span>
                      <span className="ani-step-label">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {showOutcomePanel && (
          <div className="ani-capability-panel">
            <div className="ani-panel-header">
              <span>🏆 Outcome Tracker</span>
              <button
                className="ani-panel-close"
                onClick={() => setShowOutcomePanel(false)}
              >
                ✕
              </button>
            </div>
            {outcomes.length === 0 ? (
              <div className="ani-outcome-empty">
                Outcomes will be tracked as you use ANI features. Metrics
                include time saved, decision quality, and satisfaction.
              </div>
            ) : (
              (() => {
                const summary = summarizeOutcomes(outcomes);
                return (
                  <div className="ani-outcome-content">
                    <div className="ani-outcome-stats">
                      <div className="ani-outcome-stat">
                        <span className="ani-outcome-val">
                          {summary.totalActions}
                        </span>
                        <span className="ani-outcome-key">Actions</span>
                      </div>
                      <div className="ani-outcome-stat">
                        <span className="ani-outcome-val">
                          {Math.round(summary.avgSatisfaction * 100)}%
                        </span>
                        <span className="ani-outcome-key">Satisfaction</span>
                      </div>
                      <div className="ani-outcome-stat">
                        <span className="ani-outcome-val">
                          {summary.trend === "improving"
                            ? "📈"
                            : summary.trend === "declining"
                              ? "📉"
                              : "➡️"}
                        </span>
                        <span className="ani-outcome-key">Trend</span>
                      </div>
                    </div>
                    {summary.topFeatures.length > 0 && (
                      <div className="ani-outcome-features">
                        {summary.topFeatures.map((f) => (
                          <span key={f.feature} className="ani-outcome-feature">
                            {f.feature} ({f.count})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        )}

        {showGraphPanel && (
          <div className="ani-capability-panel">
            <div className="ani-panel-header">
              <span>🕸️ Context Graph</span>
              <button
                className="ani-panel-close"
                onClick={() => setShowGraphPanel(false)}
              >
                ✕
              </button>
            </div>
            <div className="ani-graph-content">
              {graphLayout ? (
                <>
                  <div className="ani-graph-stats">
                    <span>{graphLayout.nodes.length} nodes</span>
                    <span>{graphLayout.edges.length} edges</span>
                  </div>
                  <canvas
                    ref={graphCanvasRef}
                    width={700}
                    height={350}
                    className="ani-graph-canvas"
                  />
                </>
              ) : (
                <div className="ani-graph-empty">
                  Building context graph from your workspace…
                </div>
              )}
            </div>
          </div>
        )}

        {showMeetingPanel && meetingState && (
          <div className="ani-capability-panel">
            <div className="ani-panel-header">
              <span>👥 Meeting Intelligence</span>
              <button
                className="ani-panel-close"
                onClick={() => setShowMeetingPanel(false)}
              >
                ✕
              </button>
            </div>
            <div className="ani-meeting-content">
              <div className="ani-meeting-stats">
                <div className="ani-meeting-stat">
                  <span>{meetingState.participants.length}</span>
                  <label>Participants</label>
                </div>
                <div className="ani-meeting-stat">
                  <span>{meetingState.decisions.length}</span>
                  <label>Decisions</label>
                </div>
                <div className="ani-meeting-stat">
                  <span>{meetingState.actionItems.length}</span>
                  <label>Actions</label>
                </div>
                <div className="ani-meeting-stat">
                  <span>{Math.round(meetingState.engagement * 100)}%</span>
                  <label>Engagement</label>
                </div>
              </div>
              {meetingState.participants.length > 0 && (
                <div className="ani-meeting-participants">
                  {meetingState.participants.map((p) => (
                    <div key={p.id} className="ani-participant">
                      <span className="ani-participant-name">{p.name}</span>
                      <span className="ani-participant-talk">
                        {p.talkTimePercent}%
                      </span>
                      <span
                        className={`ani-participant-engagement eng-${p.engagement > 0.6 ? "high" : p.engagement > 0.3 ? "med" : "low"}`}
                      >
                        {Math.round(p.engagement * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {meetingState.actionItems.length > 0 && (
                <div className="ani-meeting-actions">
                  {meetingState.actionItems.slice(0, 5).map((a) => (
                    <div key={a.id} className="ani-action-item">
                      <span className="ani-action-desc">{a.description}</span>
                      <span className="ani-action-assignee">@{a.assignee}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="ani-input-area">
          {(showDepthPanel || showThoughts || feedbackPanel) && (
            <div className="ani-input-badges">
              {showThoughts && traceThoughts.length > 0 && (
                <div className="ani-thought-bubble">
                  <div className="ani-thought-title">⚡ Reasoning Trace</div>
                  {traceThoughts.map((t, i) => (
                    <div key={i} className="ani-thought-item">
                      {t}
                    </div>
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
                      <span key={i} className="ani-feedback-tag">
                        {a}
                      </span>
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
                  {reasoningDepth === "fast"
                    ? "⚡"
                    : reasoningDepth === "balanced"
                      ? "◆"
                      : reasoningDepth === "deep"
                        ? "🔬"
                        : "🔭"}
                </button>
                <button
                  className={`ani-thought-toggle ${showThoughts ? "ani-thought-toggle-active" : ""}`}
                  onClick={() => setShowThoughts(!showThoughts)}
                  title="Show reasoning trace"
                >
                  💭
                </button>
                <button
                  className={`ani-voice-toggle ${voiceState.isListening ? "ani-voice-toggle-active" : ""}`}
                  onClick={() => {
                    if (voiceState.isListening) {
                      setVoiceState((prev) => ({
                        ...prev,
                        isListening: false,
                      }));
                    } else {
                      setVoiceState((prev) => ({
                        ...prev,
                        isListening: true,
                        transcript: "",
                      }));
                    }
                  }}
                  title={
                    voiceState.isListening ? "Stop listening" : "Voice input"
                  }
                  disabled={!voiceState.supported}
                >
                  {voiceState.isListening ? "🔴" : "🎤"}
                </button>
                <button
                  className={`ani-transform-toggle ${showTransformPanel ? "ani-transform-toggle-active" : ""}`}
                  onClick={() => setShowTransformPanel(!showTransformPanel)}
                  title="Transform last response"
                >
                  ✂️
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
                      <path
                        d="M8 2L8 14M8 2L3 7M8 2L13 7"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
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
                  {(["fast", "balanced", "deep", "research"] as const).map(
                    (d) => (
                      <button
                        key={d}
                        className={`ani-depth-option ${reasoningDepth === d && !autoDepth ? "ani-depth-option-active" : ""}`}
                        onClick={() => {
                          setReasoningDepth(d);
                          setAutoDepth(false);
                        }}
                        disabled={autoDepth}
                      >
                        <span className="ani-depth-option-icon">
                          {d === "fast"
                            ? "⚡"
                            : d === "balanced"
                              ? "◆"
                              : d === "deep"
                                ? "🔬"
                                : "🔭"}
                        </span>
                        <span className="ani-depth-option-name">{d}</span>
                        <span className="ani-depth-option-desc">
                          {d === "fast"
                            ? "<1.5s"
                            : d === "balanced"
                              ? "<3s"
                              : d === "deep"
                                ? "<8s"
                                : "<20s"}
                        </span>
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}

            {showTransformPanel && active && active.messages.length > 0 && (
              <div className="ani-transform-panel">
                <div className="ani-transform-header">
                  <span className="ani-transform-label">
                    Transform Last Response
                  </span>
                </div>
                <div className="ani-transform-options">
                  {(
                    [
                      "sharpen",
                      "clarify",
                      "condense",
                      "actionable",
                      "executive",
                    ] as const
                  ).map((t) => (
                    <button
                      key={t}
                      className="ani-transform-option"
                      onClick={() => {
                        const lastMsg = active.messages
                          .filter((m) => m.role === "assistant")
                          .pop();
                        if (lastMsg) {
                          const result = transformContent(lastMsg.content, t);
                          setLastTransform(result);
                        }
                      }}
                    >
                      {t === "sharpen"
                        ? "🔪"
                        : t === "clarify"
                          ? "💡"
                          : t === "condense"
                            ? "🗜️"
                            : t === "actionable"
                              ? "→"
                              : "📊"}
                      <span>{t}</span>
                    </button>
                  ))}
                </div>
                {lastTransform && (
                  <div className="ani-transform-result">
                    <div className="ani-transform-stats">
                      {lastTransform.wordCountBefore} →{" "}
                      {lastTransform.wordCountAfter} words (
                      {Math.round(
                        (1 -
                          lastTransform.wordCountAfter /
                            lastTransform.wordCountBefore) *
                          100,
                      )}
                      % reduction)
                    </div>
                    <div className="ani-transform-changes">
                      {lastTransform.changes.map((c, i) => (
                        <span key={i} className="ani-transform-change">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {voiceState.isListening && (
              <div className="ani-voice-status">
                <span className="ani-voice-dot" />
                <span>Listening…</span>
                {voiceState.interimTranscript && (
                  <span className="ani-voice-interim">
                    {voiceState.interimTranscript}
                  </span>
                )}
              </div>
            )}

            {safetyWarnings.length > 0 && (
              <div className="ani-safety-warnings">
                {safetyWarnings.map((w, i) => (
                  <div key={i} className="ani-safety-warning">
                    🛡️ {w}
                  </div>
                ))}
              </div>
            )}

            <div className="ani-input-hint">
              <span>ANI v4.0</span>
              <span>•</span>
              <span>{autoDepth ? "Auto depth" : reasoningDepth}</span>
              <span>•</span>
              <span>{voiceState.isListening ? "🎤 Voice on" : ""}</span>
              <span>•</span>
              <span>
                {active ? `${active.messages.length} messages` : "Ready"}
              </span>
            </div>
          </div>
        </div>
      </main>

      <aside className="ani-right-panel">
        <div className="ani-panel-tabs">
          {(["chat", "consciousness", "tools", "memory"] as PanelTab[]).map(
            (tab) => (
              <button
                key={tab}
                className={`ani-panel-tab ${activeTab === tab ? "ani-panel-tab-active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ),
          )}
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
                  <Badge tone={tc.status === "error" ? "danger" : "success"}>
                    {tc.status}
                  </Badge>
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
            <div className="ani-panel-section-title" style={{ marginTop: 16 }}>
              Engine Info
            </div>
            <div className="ani-engine-info">
              <div className="ani-engine-row">
                <span>Model</span>
                <span>N0VA-LM-T</span>
              </div>
              <div className="ani-engine-row">
                <span>Context</span>
                <span>128K tokens</span>
              </div>
              <div className="ani-engine-row">
                <span>Tier</span>
                <span>Reflective</span>
              </div>
              <div className="ani-engine-row">
                <span>Mode</span>
                <span>External</span>
              </div>
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
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-conversation-form">
              Start
            </Button>
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
          style={{
            minWidth: 340,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <input
            className="nv-input"
            name="title"
            placeholder="Conversation title"
            required
            autoFocus
          />
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
          <CoherenceBar
            label="Coherence"
            value={coherence}
            color="var(--nv-color-success)"
          />
          <CoherenceBar
            label="Cognitive Load"
            value={cognitiveLoad}
            color="var(--nv-color-warning)"
          />
          <CoherenceBar
            label="Flow State"
            value={flowState}
            color="var(--nv-color-accent)"
          />
          <CoherenceBar
            label="Engagement"
            value={engagement}
            color="var(--nv-color-primary)"
          />
        </div>
      </div>

      <div className="ani-panel-section-title" style={{ marginTop: 16 }}>
        Neural State
      </div>
      <div className="ani-neural-grid">
        <div className="ani-neural-item">
          <div className="ani-neural-label">Attention Vector</div>
          <div className="ani-neural-value">
            [{coherence.toFixed(2)}, {cognitiveLoad.toFixed(2)}]
          </div>
        </div>
        <div className="ani-neural-item">
          <div className="ani-neural-label">Flow Probability</div>
          <div className="ani-neural-value">
            {(flowState * 100).toFixed(0)}%
          </div>
        </div>
        <div className="ani-neural-item">
          <div className="ani-neural-label">Intent</div>
          <div
            className="ani-neural-value"
            style={{ textTransform: "capitalize" }}
          >
            {intent}
          </div>
        </div>
        <div className="ani-neural-item">
          <div className="ani-neural-label">Consciousness Tier</div>
          <div className="ani-neural-value">Reflective L4</div>
        </div>
      </div>

      <div className="ani-panel-section-title" style={{ marginTop: 16 }}>
        5-Layer Stack
      </div>
      <div className="ani-layers">
        {[
          "Perceptual",
          "Working Memory",
          "Long-Term",
          "Metacognition",
          "Integration",
        ].map((layer, i) => (
          <div key={layer} className="ani-layer">
            <div
              className="ani-layer-dot"
              style={{ opacity: i < 4 ? 1 : 0.5 }}
            />
            <span>{layer}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CoherenceRing({
  label,
  value,
  size,
}: {
  label: string;
  value: number;
  size: number;
}) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value);

  return (
    <div className="ani-coherence-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--nv-color-border)"
          strokeWidth="3"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={
            value > 0.9 ? "var(--nv-color-success)" : "var(--nv-color-warning)"
          }
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="ani-coherence-ring-label">
        <div className="ani-coherence-ring-value">
          {(value * 100).toFixed(0)}%
        </div>
        <div className="ani-coherence-ring-name">{label}</div>
      </div>
    </div>
  );
}

function CoherenceBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="ani-coherence-bar-row">
      <span className="ani-coherence-bar-label">{label}</span>
      <div className="ani-coherence-bar-track">
        <div
          className="ani-coherence-bar-fill"
          style={{ width: `${value * 100}%`, background: color }}
        />
      </div>
      <span className="ani-coherence-bar-value">
        {(value * 100).toFixed(0)}%
      </span>
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
      <div className="ani-empty-subtitle">
        AI Native Intelligence — Consciousness Layer
      </div>
      <div className="ani-empty-desc">
        Your agentic assistant with consciousness awareness, RAG-powered
        retrieval, N0VA1O tool orchestration, and cross-module hyper-context.
      </div>
      <div className="ani-empty-capabilities">
        <div className="ani-capability">
          <div className="ani-cap-icon">🧠</div>
          <div className="ani-cap-text">
            <div className="ani-cap-name">Consciousness</div>
            <div className="ani-cap-desc">
              5-layer synthetic awareness with coherence tracking
            </div>
          </div>
        </div>
        <div className="ani-capability">
          <div className="ani-cap-icon">⚡</div>
          <div className="ani-cap-text">
            <div className="ani-cap-name">Tool Orchestration</div>
            <div className="ani-cap-desc">
              Autonomous multi-step workflows via N0VA1O gateway
            </div>
          </div>
        </div>
        <div className="ani-capability">
          <div className="ani-cap-icon">🔍</div>
          <div className="ani-cap-text">
            <div className="ani-cap-name">RAG Pipeline</div>
            <div className="ani-cap-desc">
              Hybrid retrieval across all workspace modules
            </div>
          </div>
        </div>
        <div className="ani-capability">
          <div className="ani-cap-icon">🛡️</div>
          <div className="ani-cap-text">
            <div className="ani-cap-name">Safety & Ethics</div>
            <div className="ani-cap-desc">
              Constitutional AI with HITL for critical actions
            </div>
          </div>
        </div>
      </div>
      <Button size="md" onClick={onCreate}>
        Start a conversation
      </Button>
    </div>
  );
}

function classifyLocalIntent(input: string): string {
  const lower = input.toLowerCase();
  if (lower.match(/what|when|where|how many|define|explain/)) return "factual";
  if (lower.match(/write|create|generate|design|compose|draft/))
    return "creative";
  if (lower.match(/analyze|compare|evaluate|assess|review|pattern/))
    return "analytical";
  if (lower.match(/schedule|send|update|delete|move|assign/)) return "action";
  return "conversational";
}
