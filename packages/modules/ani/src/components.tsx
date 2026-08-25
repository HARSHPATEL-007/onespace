"use client";

import { useEffect, useRef, useState, useCallback, useMemo, memo } from "react";
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
    modelRoute?: string;
    explanation?: string;
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

function useVoiceRecognition(
  onResult: (transcript: string, isFinal: boolean, interim: string) => void,
  onCommand?: (cmd: string) => void,
) {
  const recognitionRef = useRef<unknown>(null);
  const callbackRef = useRef(onResult);
  callbackRef.current = onResult;
  const commandRef = useRef(onCommand);
  commandRef.current = onCommand;

  const start = useCallback(() => {
    if (typeof window === "undefined") return null;
    const w = window as unknown as Record<string, unknown>;
    const SR =
      (w["SpeechRecognition"] as unknown) ??
      (w["webkitSpeechRecognition"] as unknown);
    if (!SR || typeof SR !== "function") return null;
    const rec = new (SR as new () => unknown)() as Record<string, unknown>;
    try {
      (rec["continuous"] as boolean) = true;
      (rec["interimResults"] as boolean) = true;
      (rec["lang"] as string) = "en-US";
      rec["onresult"] = (event: unknown) => {
        const e = event as {
          results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
          resultIndex: number;
        };
        let interim = "";
        let finalText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (!res) continue;
          const transcript = res[0]?.transcript ?? "";
          if (res.isFinal) finalText += transcript + " ";
          else interim += transcript + " ";
        }
        if (finalText.trim()) {
          const normalized = finalText.trim();
          // check voice commands like "hey ani", "clear conversation"
          const cmdMatch = matchVoiceCommand(normalized);
          if (cmdMatch && commandRef.current) {
            commandRef.current(cmdMatch.action);
          }
          callbackRef.current(normalized, true, interim.trim());
        } else if (interim.trim()) {
          callbackRef.current("", false, interim.trim());
        }
      };
      rec["onerror"] = () => {
        /* keep listening unless fatal */
      };
      rec["onend"] = () => {
        // auto-restart if still intended to listen — caller controls lifecycle via stop()
      };
      (rec["start"] as () => void)();
      recognitionRef.current = rec;
      return rec;
    } catch {
      return null;
    }
  }, []);

  const stop = useCallback(() => {
    const rec = recognitionRef.current as Record<string, unknown> | null;
    if (rec && typeof rec["stop"] === "function") {
      try {
        (rec["stop"] as () => void)();
      } catch {
        /* ignore */
      }
    }
    recognitionRef.current = null;
  }, []);

  return { start, stop, ref: recognitionRef };
}

function hasAniMention(text: string): boolean {
  return /@ani\b/i.test(text);
}

function highlightAniMentions(text: string): string {
  return text.replace(/@ani\b/gi, "◆ ANI");
}

const AmbientStrip = memo(function AmbientStrip({
  suggestions,
  onPick,
  onDismiss,
}: {
  suggestions: Array<{ id: string; label: string; prompt: string; icon: string }>;
  onPick: (prompt: string) => void;
  onDismiss: () => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="ani-ambient-strip">
      <span className="ani-ambient-label">✦ ANI suggests</span>
      {suggestions.map((s) => (
        <button key={s.id} className="ani-ambient-chip" onClick={() => onPick(s.prompt)} title={s.prompt}>
          <span className="ani-ambient-chip-icon">{s.icon}</span>
          {s.label}
        </button>
      ))}
      <button className="ani-ambient-dismiss" onClick={onDismiss} title="Dismiss">
        ✕
      </button>
    </div>
  );
});

const PiiStrip = memo(function PiiStrip({
  findings,
  redacted,
  onRedact,
}: {
  findings: Array<{ type: string; match: string }>;
  redacted: string;
  onRedact: (redacted: string) => void;
}) {
  return (
    <div className="ani-pii-strip">
      <span className="ani-pii-label">🛡️ PII detected: {findings.map((f) => f.type).join(", ")}</span>
      <span className="ani-pii-preview">
        {redacted.slice(0, 120)}
        {redacted.length > 120 ? "…" : ""}
      </span>
      <button className="ani-pii-action" onClick={() => onRedact(redacted)} title="Replace draft with redacted version">
        Redact
      </button>
    </div>
  );
});

const AttachPreviewBar = memo(function AttachPreviewBar({
  images,
  onRemove,
}: {
  images: Array<{ id: string; name: string; dataUrl: string; size: number }>;
  onRemove: (id: string) => void;
}) {
  if (images.length === 0) return null;
  return (
    <div className="ani-attach-preview">
      {images.map((img) => (
        <div key={img.id} className="ani-attach-item">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.dataUrl} alt={img.name} className="ani-attach-thumb" />
          <span className="ani-attach-name">{img.name}</span>
          <button className="ani-attach-remove" onClick={() => onRemove(img.id)} title="Remove">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
});

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
  const [feedbackVotes, setFeedbackVotes] = useState<Record<string, "up" | "down">>({});
  const [attachedImages, setAttachedImages] = useState<Array<{ id: string; name: string; dataUrl: string; size: number }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ambientDismissed, setAmbientDismissed] = useState(false);
  const [brandVoice, setBrandVoice] = useState<"default" | "executive" | "technical" | "friendly">("default");
  const [contextGraph, setContextGraph] = useState<ContextGraph3D | null>(null);
  const [showGraphPanel, setShowGraphPanel] = useState(false);
  const [showMeetingPanel, setShowMeetingPanel] = useState(false);
  const [meetingState, setMeetingState] =
    useState<MeetingIntelligenceState | null>(null);
  const [showResearchPanel, setShowResearchPanel] = useState(false);
  const [researchJobs, setResearchJobs] = useState<Array<{ research_id: string; question: string; status: string; mode: string }>>([]);
  const [graphLayout, setGraphLayout] = useState<GraphLayout3D | null>(null);
  const [convSearch, setConvSearch] = useState("");
  const [modelTier, setModelTier] = useState<null | { tier: string; modelName: string }>(null);
  const [lastExplanation, setLastExplanation] = useState<null | {
    summary: string;
    confidence: number;
    methodology: string;
    uncertainty: string;
  }>(null);
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
    const rawContent = draft.trim();
    const hasImages = attachedImages.length > 0;
    if ((!rawContent && !hasImages) || !active || sending) return;

    // Multi-modal: prepend image context for vision-aware handling
    const imageContext = hasImages
      ? `\n[Attached Images: ${attachedImages.map((a) => `${a.name} (${Math.round(a.size / 1024)}KB)`).join(", ")} — vision analysis enabled]`
      : "";
    const brandContext = brandVoice !== "default" ? `\n[Brand voice: ${brandVoice}]` : "";
    const content = rawContent + imageContext + brandContext;

    const injectionCheck = detectInjectionRisk(content);
    if (injectionCheck.risk === "high") {
      setSafetyWarnings((prev) => [...prev, `Blocked: ${injectionCheck.indicators.join(", ")}`]);
      setSending(false);
      return;
    }

    setSending(true);
    setTyping(true);
    setDraft("");
    setAttachedImages([]);
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
      if (hasImages) depthSteps.push("Analyzing attached visuals...");
      depthSteps.push("Multi-pass reasoning in progress...");
    } else if (hasImages) {
      depthSteps.push("Analyzing image...");
    }
    setTraceThoughts(depthSteps);

    const fd = new FormData();
    fd.set("id", active.id);
    fd.set("content", content);
    if (hasImages) {
      // Send image metadata for server-side multimodal routing (N0VA-Vision)
      fd.set("hasImages", "true");
      fd.set("imageCount", String(attachedImages.length));
      fd.set("imageNames", attachedImages.map((a) => a.name).join(","));
    }
    if (brandVoice !== "default") fd.set("brandVoice", brandVoice);
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
        if (r.modelRoute) {
          try {
            const mr = JSON.parse(r.modelRoute) as { tier: string; modelName: string };
            setModelTier(mr);
          } catch {
            /* */
          }
        }
        if (r.explanation) {
          try {
            const ex = JSON.parse(r.explanation) as {
              summary: string;
              confidenceBreakdown: { overall: number };
              methodology: string;
              uncertainty: string;
            };
            setLastExplanation({
              summary: ex.summary,
              confidence: ex.confidenceBreakdown.overall,
              methodology: ex.methodology,
              uncertainty: ex.uncertainty,
            });
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
            ...(r.modelRoute ? [`Model: ${JSON.parse(r.modelRoute).modelName} (${JSON.parse(r.modelRoute).tier})`] : []),
          ],
          nextActions:
            r.confidence && r.confidence > 0.8
              ? ["Ready for follow-up"]
              : ["Consider providing more context"],
        });
        setTimeout(() => setTyping(false), r.delayMs);
      })
      .finally(() => setSending(false));
  }, [draft, active, sending, actions, reasoningDepth, autoDepth, attachedImages, brandVoice]);

  const handleAttachFiles = (files: FileList | null) => {
    if (!files) return;
    const maxFiles = 3 - attachedImages.length;
    const toAdd = Array.from(files).slice(0, Math.max(0, maxFiles));
    for (const f of toAdd) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 5 * 1024 * 1024) {
        setSafetyWarnings((prev) => [...prev, `${f.name} exceeds 5MB limit`]);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedImages((prev) => [
          ...prev,
          { id: `${Date.now()}_${f.name}`, name: f.name, dataUrl: reader.result as string, size: f.size },
        ]);
      };
      reader.readAsDataURL(f);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

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

  useEffect(() => {
    if (showResearchPanel) {
      fetch("/api/research")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.jobs) setResearchJobs(d.jobs);
        })
        .catch(() => {});
    }
  }, [showResearchPanel]);

  // ---- Enhanced Voice Recognition Wiring ----
  const voiceRecognition = useVoiceRecognition(
    (transcript, isFinal, interim) => {
      if (isFinal && transcript) {
        setDraft((prev) => (prev ? prev + " " + transcript : transcript));
        setVoiceState((prev) => ({
          ...prev,
          transcript,
          interimTranscript: interim,
        }));
        // auto-focus input after voice fill
        textareaRef.current?.focus();
      } else {
        setVoiceState((prev) => ({
          ...prev,
          interimTranscript: interim,
        }));
      }
    },
    (cmd) => {
      // Voice commands handling
      if (cmd === "clear") {
        if (active) {
          const fd = new FormData();
          fd.set("id", active.id);
          void actions.clear(fd).then(() => router.refresh());
        }
      } else if (cmd === "wake") {
        textareaRef.current?.focus();
      } else if (cmd.startsWith("depth_")) {
        const depth = cmd.replace("depth_", "") as typeof reasoningDepth;
        if (["fast", "balanced", "deep", "research"].includes(depth)) {
          setReasoningDepth(depth as typeof reasoningDepth);
          setAutoDepth(false);
        }
      } else if (cmd === "thoughts_on") setShowThoughts(true);
      else if (cmd === "thoughts_off") setShowThoughts(false);
    },
  );

  // Sync voice supported flag on mount (handles SSR mismatch)
  useEffect(() => {
    setVoiceState((prev) => ({
      ...prev,
      supported:
        typeof window !== "undefined" &&
        ("SpeechRecognition" in window ||
          "webkitSpeechRecognition" in window),
    }));
    // preload TTS voices when available
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          setTtsState((prev) => ({
            ...prev,
            voices,
            voice: prev.voice ?? voices[0] ?? null,
            supported: true,
          }));
        }
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // Manage lifecycle of recognition based on isListening
  useEffect(() => {
    if (voiceState.isListening) {
      const rec = voiceRecognition.start();
      if (!rec) {
        // fallback: no native support -> show hint but keep toggle active as demo
        setVoiceState((prev) => ({
          ...prev,
          error: "SpeechRecognition not supported in this browser",
        }));
      }
      return () => {
        voiceRecognition.stop();
      };
    } else {
      voiceRecognition.stop();
    }
  }, [voiceState.isListening, voiceRecognition]);

  // ---- Keyboard Shortcuts: Ctrl+Space / Ctrl+K -> focus ANI ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && (e.code === "Space" || e.key === "k" || e.key === "K")) {
        e.preventDefault();
        textareaRef.current?.focus();
        // also show depth hint briefly on shortcut
        if (e.key.toLowerCase() === "k") setShowDepthPanel((prev) => !prev);
      }
      // Slash to focus when not typing in an input
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        const activeEl = document.activeElement;
        if (
          !(activeEl instanceof HTMLInputElement) &&
          !(activeEl instanceof HTMLTextAreaElement)
        ) {
          e.preventDefault();
          textareaRef.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ---- @ani mention detection -> visual hint + intent boost ----
  const hasAniMentionInDraft = hasAniMention(draft);
  useEffect(() => {
    if (hasAniMentionInDraft && intent !== "conversational") {
      // already set elsewhere; keep but ensure hint shown in proactive area
    }
  }, [hasAniMentionInDraft, intent]);

  // ---- Draft mention autocomplete: typing "@" shows hint ----
  const showMentionHint =
    draft.includes("@") && !hasAniMentionInDraft && draft.length < 120;

  // ---- Ambient proactive suggestions (spec 6.1 Ambient Interface) ----
  const ambientSuggestions = (() => {
    if (ambientDismissed || sending || typing) return [];
    const chips: Array<{ id: string; label: string; prompt: string; icon: string }> = [];
    if (!draft.trim() && active && active.messages.length > 0) {
      chips.push(
        { id: "summ", label: "Summarize thread", prompt: "Summarize this conversation in 5 bullets with decisions and open items", icon: "▤" },
        { id: "follow", label: "Draft follow-up", prompt: "Draft a concise follow-up message based on the last exchange", icon: "↗" },
      );
      if (intent === "analytical") chips.push({ id: "explain", label: "Explain reasoning", prompt: "Explain your reasoning step-by-step for the last answer", icon: "◈" });
      else chips.push({ id: "actions", label: "List action items", prompt: "Extract action items with owners and due dates", icon: "☐" });
    } else if (draft.trim().length >= 4) {
      const lower = draft.toLowerCase();
      if (lower.includes("what") || lower.includes("explain") || lower.includes("?")) {
        chips.push({ id: "deepen", label: "Deepen answer", prompt: draft + " — please be thorough and cite sources", icon: "🔬" });
      }
      if (lower.includes("create") || lower.includes("draft") || lower.includes("write")) {
        chips.push({ id: "refine", label: "Add structure", prompt: draft + " — use headings, bullets, and a TL;DR", icon: "≡" });
      }
      chips.push({ id: "ani", label: "Add @ani context", prompt: draft.includes("@ani") ? draft : draft + " @ani", icon: "◆" });
    } else if (!active) {
      chips.push(
        { id: "start1", label: "Plan Q4 strategy", prompt: "Help me plan Q4 strategy with milestones and risks", icon: "⧉" },
        { id: "start2", label: "Review workspace", prompt: "Give me a workspace briefing: docs, tasks, deals", icon: "◎" },
      );
    }
    return chips.slice(0, 3);
  })();

  // ---- PII redaction preview (spec 4.2 Data Sanitization) ----
  const piiPreview = useMemo(() => {
    if (!draft || draft.length < 8) return null;
    const findings: Array<{ type: string; match: string }> = [];
    const patterns: Array<{ re: RegExp; type: string }> = [
      { re: /\b\d{3}-\d{2}-\d{4}\b/g, type: "SSN" },
      { re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, type: "Email" },
      { re: /\b(?:\d[ -]*?){13,16}\b/g, type: "Card" },
      { re: /\b[Aa][Pp][Ii][_ -]?[Kk]ey\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{16,}['\"]?/g, type: "API Key" },
      { re: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, type: "Phone" },
    ];
    let redacted = draft;
    for (const { re, type } of patterns) {
      let m: RegExpExecArray | null;
      const dup = new RegExp(re.source, re.flags);
      while ((m = dup.exec(draft)) !== null) {
        const match = m[0];
        // avoid flagging the user's own workspace email if it's also in draft? show anyway for transparency
        findings.push({ type, match: match.slice(0, 24) + (match.length > 24 ? "…" : "") });
        redacted = redacted.replace(match, `[REDACTED ${type}]`);
        if (findings.length >= 4) break;
      }
      if (findings.length >= 4) break;
    }
    if (findings.length === 0) return null;
    return { findings, redacted };
  }, [draft]);

  // ---- Health polling for real consciousness metrics (spec 4.3 observability) ----
  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    const fetchHealth = async () => {
      try {
        const r = await fetch("/api/ani/health");
        if (!r.ok) return;
        const d = (await r.json()) as {
          metrics?: {
            coherence: number;
            cognitiveLoad: number;
            flowState: number;
            engagement: number;
          };
        };
        if (!cancelled && d.metrics) {
          setConsciousnessCoherence(d.metrics.coherence);
          setCognitiveLoad(d.metrics.cognitiveLoad);
          setFlowState(d.metrics.flowState);
          setEngagement(d.metrics.engagement);
        }
      } catch {
        /* health best-effort */
      }
    };
    fetchHealth();
    interval = setInterval(fetchHealth, 15000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  // ---- Draft persistence via localStorage (restores on reload / tab switch) ----
  useEffect(() => {
    const key = `ani:draft:${active?.id ?? "global"}`;
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as { draft?: string; brandVoice?: typeof brandVoice };
        if (parsed.draft && !draft) setDraft(parsed.draft);
        if (parsed.brandVoice) setBrandVoice(parsed.brandVoice);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  useEffect(() => {
    const key = `ani:draft:${active?.id ?? "global"}`;
    try {
      if (typeof window !== "undefined") {
        if (draft || brandVoice !== "default") {
          window.localStorage.setItem(key, JSON.stringify({ draft, brandVoice }));
        } else {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      /* quota */
    }
  }, [draft, brandVoice, active?.id]);

  // Clear persisted draft on successful send (handled in send via setDraft("") which triggers above effect)

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
          {conversations.length > 3 && (
            <div className="ani-conv-search">
              <input
                className="ani-conv-search-input"
                placeholder="Search conversations…"
                value={convSearch}
                onChange={(e) => setConvSearch(e.target.value)}
                aria-label="Search conversations"
              />
              {convSearch && (
                <button className="ani-conv-search-clear" onClick={() => setConvSearch("")} title="Clear">
                  ✕
                </button>
              )}
            </div>
          )}
          <div className="ani-conv-list">
            {conversations.length === 0 && (
              <div className="ani-empty-sidebar">No conversations yet</div>
            )}
            {(() => {
              const filtered = convSearch.trim()
                ? conversations.filter((c) => {
                    const q = convSearch.toLowerCase();
                    return (
                      c.title.toLowerCase().includes(q) ||
                      c.messages.some((m) => m.content.toLowerCase().includes(q))
                    );
                  })
                : conversations;
              if (filtered.length === 0 && convSearch.trim()) {
                return <div className="ani-empty-sidebar">No matches for “{convSearch}”</div>;
              }
              return filtered.map((c) => (
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
              ));
            })()}
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
              {modelTier && (
                <Badge tone={modelTier.tier === "frontier" ? "danger" : modelTier.tier === "medium" ? "warning" : "neutral"}>
                  {modelTier.modelName} · {modelTier.tier}
                </Badge>
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
                  {m.role === "assistant" && (
                    <div className="ani-msg-feedback">
                      <button
                        className={`ani-feedback-btn ${feedbackVotes[m.id] === "up" ? "ani-feedback-active" : ""}`}
                        onClick={() => {
                          const next = feedbackVotes[m.id] === "up" ? null : "up";
                          setFeedbackVotes((prev) => {
                            const copy = { ...prev };
                            if (next) copy[m.id] = next;
                            else delete copy[m.id];
                            return copy;
                          });
                          // adaptive signal — best-effort fire-and-forget
                          void fetch("/api/ani/feedback", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({
                              messageId: m.id,
                              conversationId: active.id,
                              rating: next ? 1 : 0,
                              content: m.content.slice(0, 200),
                            }),
                          }).catch(() => {});
                        }}
                        title="Helpful"
                        aria-label="Mark helpful"
                      >
                        👍
                      </button>
                      <button
                        className={`ani-feedback-btn ${feedbackVotes[m.id] === "down" ? "ani-feedback-active" : ""}`}
                        onClick={() => {
                          const next = feedbackVotes[m.id] === "down" ? null : "down";
                          setFeedbackVotes((prev) => {
                            const copy = { ...prev };
                            if (next) copy[m.id] = next;
                            else delete copy[m.id];
                            return copy;
                          });
                          void fetch("/api/ani/feedback", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({
                              messageId: m.id,
                              conversationId: active.id,
                              rating: next ? -1 : 0,
                              content: m.content.slice(0, 200),
                            }),
                          }).catch(() => {});
                        }}
                        title="Not helpful"
                        aria-label="Mark not helpful"
                      >
                        👎
                      </button>
                      <button
                        className="ani-feedback-btn"
                        onClick={() => {
                          navigator.clipboard?.writeText(m.content).catch(() => {});
                        }}
                        title="Copy response"
                        aria-label="Copy"
                      >
                        ⧉
                      </button>
                    </div>
                  )}
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
              <div className="ani-citations-label">Sources · {citations.length} grounded</div>
              {enrichCitations(citations, { hasImages: attachedImages.length > 0, hasFiles: false, hasWebResults: false }).map((c, i) => (
                <div key={i} className={`ani-citation ${c.verified ? "ani-citation-verified" : "ani-citation-unverified"}`}>
                  <span className="ani-citation-type" title={c.type}>
                    {c.type === "web"
                      ? "🌐"
                      : c.type === "image"
                        ? "🖼️"
                        : c.type === "file"
                          ? "📄"
                          : c.type === "memory"
                            ? "🧠"
                            : c.type === "calculation"
                              ? "🧮"
                              : "📚"}
                  </span>
                  <span className="ani-citation-source">{c.source}</span>
                  <span className="ani-citation-conf">
                    {(c.confidence * 100).toFixed(0)}%{c.verified ? " ✓" : ""}
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
                setShowResearchPanel(false);
              }}
              title="Meeting intelligence"
            >
              👥
            </button>
            <button
              className={`ani-cap-btn ${showResearchPanel ? "ani-cap-btn-active" : ""}`}
              onClick={() => {
                setShowResearchPanel(!showResearchPanel);
                setShowLearning(false);
                setShowProgressPanel(false);
                setShowOutcomePanel(false);
                setShowGraphPanel(false);
                setShowMeetingPanel(false);
              }}
              title="Research OS — verifiable research"
            >
              🔬
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

        {showResearchPanel && (
          <div className="ani-capability-panel">
            <div className="ani-panel-header">
              <span>🔬 Research Studio — Verifiable</span>
              <button className="ani-panel-close" onClick={() => setShowResearchPanel(false)}>
                ✕
              </button>
            </div>
            <div className="ani-research-content">
              <div className="ani-research-actions">
                <Button
                  size="sm"
                  onClick={async () => {
                    const q = draft.trim() || active?.messages.slice(-1)[0]?.content || "Evaluate Q4 launch impact";
                    const r = await fetch("/api/research", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ question: q, mode: reasoningDepth === "research" ? "deep_research" : "quick_answer", scope: { geography: ["IN", "US"] } }),
                    });
                    const j = await r.json();
                    if (j.research_id) {
                      setResearchJobs((prev) => [{ research_id: j.research_id, question: q, status: j.status, mode: j.plan?.mode ?? "deep_research" }, ...prev]);
                      setSafetyWarnings((p) => [...p, `Research ${j.research_id} ${j.status} — plan ${j.plan?.subquestions?.length ?? 0} subquestions`]);
                    }
                  }}
                >
                  Start research from draft
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    fetch("/api/research")
                      .then((r) => r.json())
                      .then((d) => d?.jobs && setResearchJobs(d.jobs))
                      .catch(() => {});
                  }}
                >
                  Refresh
                </Button>
              </div>
              {researchJobs.length === 0 ? (
                <div className="ani-research-empty">No research jobs yet. Draft a question and use deep-research mode.</div>
              ) : (
                <div className="ani-research-list">
                  {researchJobs.map((j) => (
                    <div key={j.research_id} className="ani-research-item">
                      <div className="ani-research-q">{j.question.slice(0, 80)}</div>
                      <div className="ani-research-meta">
                        <Badge tone={j.status === "completed" ? "success" : j.status === "awaiting_approval" ? "warning" : "neutral"}>{j.status}</Badge>
                        <span className="ani-research-mode">{j.mode}</span>
                        <span className="ani-research-id">{j.research_id.slice(0, 12)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="ani-research-help">Evidence panels separate facts / calculations / inferences / assumptions / contradictions. Snapshots are immutable and reproducible.</div>
            </div>
          </div>
        )}

        <div className="ani-input-area">
          {(showDepthPanel || showThoughts || feedbackPanel || lastExplanation) && (
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
              {lastExplanation && (
                <div className="ani-explanation-bubble">
                  <div className="ani-explanation-title">◈ Why this answer? — {lastExplanation.methodology.slice(0, 60)}</div>
                  <div className="ani-explanation-body">{lastExplanation.summary}</div>
                  <div className="ani-explanation-uncertainty">{lastExplanation.uncertainty}</div>
                </div>
              )}
            </div>
          )}

          <AmbientStrip
            suggestions={ambientSuggestions}
            onPick={setDraft}
            onDismiss={() => setAmbientDismissed(true)}
          />
          {piiPreview && (
            <PiiStrip
              findings={piiPreview.findings}
              redacted={piiPreview.redacted}
              onRedact={setDraft}
            />
          )}

          <div className="ani-input-wrap">
            {hasAniMentionInDraft && (
              <div className="ani-mention-active">
                <span className="ani-mention-badge">◆ @ani</span>
                <span className="ani-mention-hint">
                  ANI will respond with workspace context
                </span>
                <button
                  className="ani-mention-clear"
                  onClick={() =>
                    setDraft((prev) => prev.replace(/@ani\s*/gi, "").trim())
                  }
                  title="Remove @ani"
                >
                  ✕
                </button>
              </div>
            )}
            {showMentionHint && (
              <div className="ani-mention-suggest">
                <span>Tip: type</span>
                <button
                  className="ani-mention-suggest-btn"
                  onClick={() => {
                    setDraft((prev) => (prev ? prev + " @ani" : "@ani "));
                    textareaRef.current?.focus();
                  }}
                >
                  @ani
                </button>
                <span>to bring ANI into any chat context</span>
              </div>
            )}
            <AttachPreviewBar
              images={attachedImages}
              onRemove={(id) => setAttachedImages((prev) => prev.filter((p) => p.id !== id))}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => handleAttachFiles(e.target.files)}
            />
            <div className="ani-input-container">
              <textarea
                ref={textareaRef}
                className="ani-input-textarea"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  hasAniMentionInDraft
                    ? "Ask @ani with workspace context…"
                    : "Ask ANI anything… (Enter to send, Shift+Enter for newline) • Ctrl+Space to focus • @ani for context"
                }
                rows={1}
                disabled={sending}
              />
              <div className="ani-input-actions">
                <select
                  className="ani-brand-select"
                  value={brandVoice}
                  onChange={(e) => setBrandVoice(e.target.value as typeof brandVoice)}
                  title="Brand voice (spec 6.6 Customization)"
                >
                  <option value="default">Default</option>
                  <option value="executive">Executive</option>
                  <option value="technical">Technical</option>
                  <option value="friendly">Friendly</option>
                </select>
                <button
                  className="ani-attach-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach image (vision: N0VA-Vision)"
                  disabled={attachedImages.length >= 3}
                >
                  📎
                </button>
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
                  disabled={sending || (!draft.trim() && attachedImages.length === 0)}
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
                <span>Listening… say “hey ani” commands</span>
                {voiceState.interimTranscript && (
                  <span className="ani-voice-interim">
                    {voiceState.interimTranscript}
                  </span>
                )}
              </div>
            )}
            {voiceState.error && !voiceState.isListening && (
              <div className="ani-voice-error">
                🎤 {voiceState.error} — voice demo requires Chrome/Edge with mic permission
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
                <span>{modelTier?.modelName ?? "N0VA-LM-T"}</span>
              </div>
              <div className="ani-engine-row">
                <span>Context</span>
                <span>{modelTier ? `${(modelTier.tier === "frontier" ? "4M" : modelTier.tier === "medium" ? "128K" : "32K")} tokens` : "128K tokens"}</span>
              </div>
              <div className="ani-engine-row">
                <span>Tier</span>
                <span>{modelTier?.tier ?? "Reflective"}</span>
              </div>
              <div className="ani-engine-row">
                <span>Mode</span>
                <span>External</span>
              </div>
            </div>

            {/* Memory Center — Spec §12: searchable inventory, why, provenance, controls */}
            <div className="ani-panel-section-title" style={{ marginTop: 16 }}>
              Memory Center
              <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10, marginLeft: 6, color: "var(--nv-color-text-faint)" }}>
                governed fabric
              </span>
            </div>
            <div className="ani-memory-center">
              <div className="ani-memory-search">
                <input
                  className="ani-memory-search-input"
                  placeholder="Search memories… try 'Q4 launch'"
                  onChange={(e) => {
                    // local filter for demo; in production queries Memory Fabric via /api/ani/memory
                    const q = e.target.value.toLowerCase();
                    const cards = document.querySelectorAll<HTMLDivElement>(".ani-memory-card");
                    cards.forEach((c) => {
                      const txt = c.innerText.toLowerCase();
                      (c as HTMLElement).style.display = !q || txt.includes(q) ? "" : "none";
                    });
                  }}
                />
              </div>
              {/* Example canonical memory per Spec §2 — prevents vector-without-provenance failure */}
              <div className="ani-memory-card" data-testid="memory-card">
                <div className="ani-memory-card-header">
                  <span className="ani-memory-card-type episodic">episodic</span>
                  <span className="ani-memory-card-id">mem_01J…</span>
                  <Badge tone="success">verified</Badge>
                </div>
                <div className="ani-memory-card-text">“The Q4 launch review is scheduled for Friday.”</div>
                <div className="ani-memory-card-meta">
                  <span>tenant_123 · user_456 · project_q4_launch</span>
                  <span>valid until 2026-08-29 · 4h TTL · v3</span>
                </div>
                <div className="ani-memory-card-provenance">
                  <span>Source: calendar:event_789#description v12</span>
                  <span>Authority 0.92 · owner confirmed</span>
                </div>
                <div className="ani-memory-card-policy">
                  <span>internal · scopes: calendar.read</span>
                  <span>purpose: meeting_preparation</span>
                </div>
                <div className="ani-memory-card-actions">
                  <button className="ani-memory-action" title="Why does ANI know this?" onClick={() => alert("Why: calendar event_789 observed 2026-08-25, owner user_456, purpose meeting_preparation, confidence 0.96/0.99/0.94")}>
                    Why?
                  </button>
                  <button className="ani-memory-action" onClick={() => alert("Sources: calendar:event_789 v12, confidence 0.94")}>
                    Sources
                  </button>
                  <button className="ani-memory-action" onClick={() => setSafetyWarnings((p) => [...p, "Memory correction queued (demo)"])}>
                    Correct
                  </button>
                  <button className="ani-memory-action danger" onClick={() => setSafetyWarnings((p) => [...p, "Forget request queued — respects retention & legal hold"])}>
                    Forget
                  </button>
                </div>
              </div>
              <div className="ani-memory-card">
                <div className="ani-memory-card-header">
                  <span className="ani-memory-card-type semantic">semantic</span>
                  <span className="ani-memory-card-id">mem_kg…</span>
                  <Badge tone="warning">quarantine</Badge>
                </div>
                <div className="ani-memory-card-text">Untrusted content awaiting validation — not retrievable by default.</div>
                <div className="ani-memory-card-meta">
                  <span>quarantine · short TTL · non-retrievable</span>
                </div>
              </div>
              <div className="ani-memory-help">
                <span>Commands: “What do you remember about this project?” · “Forget everything from this meeting.” · “Do not remember my writing style.”</span>
                <label className="ani-memory-toggle">
                  <input type="checkbox" defaultChecked /> Memory learning
                </label>
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

      {/* Floating Action Button — spec 6.1: Contextual FAB with gesture support */}
      <button
        className="ani-fab"
        onClick={() => {
          textareaRef.current?.focus();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        title="Focus ANI (Ctrl+Space) — Long-press for voice"
        aria-label="Focus ANI"
        onContextMenu={(e) => {
          e.preventDefault();
          setVoiceState((prev) => ({
            ...prev,
            isListening: !prev.isListening,
          }));
        }}
      >
        <span className="ani-fab-icon">◆</span>
        <span className="ani-fab-label">ANI</span>
      </button>
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
