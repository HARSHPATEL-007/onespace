"use client";

/**
 * N0VA MAIL — Enhanced UI Components
 *
 * Visual rules builder, N0VA1O agent panel, advanced search UI,
 * and security dashboard from the spec.
 */

import { useState, useCallback, useEffect, useRef } from "react";

type ClassValue = string | boolean | undefined | null | Record<string, boolean>;

function cn(...classes: ClassValue[]): string {
  const result: string[] = [];
  for (const cls of classes) {
    if (!cls) continue;
    if (typeof cls === "string") {
      result.push(cls);
    } else if (typeof cls === "object") {
      for (const [key, val] of Object.entries(cls)) {
        if (val) result.push(key);
      }
    }
  }
  return result.join(" ");
}

// ── Types ──────────────────────────────────────────────────

export interface RuleCondition {
  field: string;
  operator: string;
  value: string;
  not?: boolean;
}

export interface RuleGroup {
  id: string;
  operator: "AND" | "OR";
  conditions: RuleCondition[];
  groups?: RuleGroup[];
}

export interface AgentPersona {
  id: string;
  label: string;
  description: string;
  autonomyLevel: string;
  capabilities: string[];
  status: "active" | "paused" | "learning";
}

export interface SecurityEvent {
  id: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  source: string;
  details: string;
  detectedAt: Date;
  isResolved: boolean;
}

// ── Visual Rules Builder ───────────────────────────────────

const RULE_FIELDS = [
  { value: "from", label: "From" },
  { value: "to", label: "To" },
  { value: "subject", label: "Subject" },
  { value: "body", label: "Body" },
  { value: "has_attachments", label: "Has Attachments" },
  { value: "ai_sentiment", label: "AI Sentiment" },
  { value: "ai_priority", label: "AI Priority" },
];

const RULE_OPERATORS = [
  { value: "contains", label: "contains" },
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "startsWith", label: "starts with" },
  { value: "endsWith", label: "ends with" },
  { value: "regex", label: "matches regex" },
];

const RULE_ACTIONS = [
  { value: "move_to_folder", label: "Move to folder" },
  { value: "add_label", label: "Add label" },
  { value: "mark_read", label: "Mark as read" },
  { value: "star", label: "Star" },
  { value: "forward", label: "Forward to" },
  { value: "auto_reply", label: "Auto-reply with" },
  { value: "webhook", label: "Trigger webhook" },
  { value: "delete", label: "Delete" },
  { value: "ai_classify", label: "AI classify" },
];

export function VisualRulesBuilder({
  onSave,
  onTest,
}: {
  onSave: (rule: { name: string; group: RuleGroup; actions: string[] }) => Promise<void>;
  onTest?: (rule: { group: RuleGroup }) => Promise<{ matched: number }>;
}) {
  const [ruleName, setRuleName] = useState("");
  const [rootGroup, setRootGroup] = useState<RuleGroup>({
    id: "root",
    operator: "AND",
    conditions: [{ field: "from", operator: "contains", value: "" }],
  });
  const [actions, setActions] = useState<string[]>(["add_label"]);
  const [testResult, setTestResult] = useState<{ matched: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const addCondition = () => {
    setRootGroup((g) => ({
      ...g,
      conditions: [...g.conditions, { field: "from", operator: "contains", value: "" }],
    }));
  };

  const updateCondition = (index: number, updates: Partial<RuleCondition>) => {
    setRootGroup((g) => ({
      ...g,
      conditions: g.conditions.map((c, i) => (i === index ? { ...c, ...updates } : c)),
    }));
  };

  const removeCondition = (index: number) => {
    setRootGroup((g) => ({
      ...g,
      conditions: g.conditions.filter((_, i) => i !== index),
    }));
  };

  const toggleOperator = () => {
    setRootGroup((g) => ({ ...g, operator: g.operator === "AND" ? "OR" : "AND" }));
  };

  const handleSave = async () => {
    if (!ruleName.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: ruleName, group: rootGroup, actions });
      setRuleName("");
      setRootGroup({ id: "root", operator: "AND", conditions: [{ field: "from", operator: "contains", value: "" }] });
      setActions(["add_label"]);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!onTest) return;
    const result = await onTest({ group: rootGroup });
    setTestResult(result);
  };

  return (
    <div className="nv-panel nv-rules-builder">
      <div className="nv-panel-header">
        <h3>Visual Rule Builder</h3>
        <span className="nv-text-dim">Create complex multi-condition rules</span>
      </div>

      <div className="nv-form-group">
        <label>Rule Name</label>
        <input
          className="nv-input"
          value={ruleName}
          onChange={(e) => setRuleName(e.target.value)}
          placeholder="e.g., Auto-label Finance Emails"
        />
      </div>

      <div className="nv-rule-group">
        <div className="nv-rule-group-header">
          <span className="nv-badge nv-badge-sm">IF</span>
          <button className="nv-btn nv-btn-sm" onClick={toggleOperator}>
            {rootGroup.operator}
          </button>
          <span className="nv-text-dim">of the following conditions are met:</span>
        </div>

        {rootGroup.conditions.map((cond, i) => (
          <div key={i} className="nv-rule-condition">
            {i > 0 && <span className="nv-rule-connector">{rootGroup.operator}</span>}
            <select
              className="nv-select nv-select-sm"
              value={cond.field}
              onChange={(e) => updateCondition(i, { field: e.target.value })}
            >
              {RULE_FIELDS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <select
              className="nv-select nv-select-sm"
              value={cond.operator}
              onChange={(e) => updateCondition(i, { operator: e.target.value })}
            >
              {RULE_OPERATORS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <input
              className="nv-input nv-input-sm"
              value={cond.value}
              onChange={(e) => updateCondition(i, { value: e.target.value })}
              placeholder="Value..."
            />
            <button className="nv-btn nv-btn-sm nv-btn-icon" onClick={() => removeCondition(i)}>✕</button>
          </div>
        ))}

        <button className="nv-btn nv-btn-sm nv-btn-secondary" onClick={addCondition}>
          + Add Condition
        </button>
      </div>

      <div className="nv-rule-actions">
        <div className="nv-rule-group-header">
          <span className="nv-badge nv-badge-sm">THEN</span>
          <span className="nv-text-dim">perform these actions:</span>
        </div>
        <div className="nv-rule-action-list">
          {RULE_ACTIONS.map((action) => (
            <label key={action.value} className="nv-checkbox-label">
              <input
                type="checkbox"
                checked={actions.includes(action.value)}
                onChange={(e) => {
                  if (e.target.checked) setActions((a) => [...a, action.value]);
                  else setActions((a) => a.filter((x) => x !== action.value));
                }}
              />
              <span>{action.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="nv-panel-footer">
        {testResult && (
          <span className="nv-text-dim">Would match {testResult.matched} messages</span>
        )}
        <div className="nv-btn-group">
          {onTest && (
            <button className="nv-btn nv-btn-secondary" onClick={handleTest}>Test Rule</button>
          )}
          <button className="nv-btn nv-btn-primary" onClick={handleSave} disabled={saving || !ruleName.trim()}>
            {saving ? "Saving..." : "Save Rule"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── N0VA1O Agent Panel ─────────────────────────────────────

export function AgentPanel({
  personas,
  activePersona,
  onSelectPersona,
  onExecuteWorkflow,
}: {
  personas: AgentPersona[];
  activePersona: string;
  onSelectPersona: (id: string) => void;
  onExecuteWorkflow: (persona: string) => Promise<{ success: boolean; steps: number }>;
}) {
  const [executing, setExecuting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { success: boolean; steps: number }>>({});

  const handleExecute = async (personaId: string) => {
    setExecuting(personaId);
    try {
      const result = await onExecuteWorkflow(personaId);
      setResults((r) => ({ ...r, [personaId]: result }));
    } finally {
      setExecuting(null);
    }
  };

  return (
    <div className="nv-panel nv-agent-panel">
      <div className="nv-panel-header">
        <h3>N0VA1O Agents</h3>
        <span className="nv-text-dim">AI agents for autonomous mail management</span>
      </div>

      <div className="nv-agent-list">
        {personas.map((persona) => (
          <div
            key={persona.id}
            className={cn("nv-agent-card", activePersona === persona.id && "nv-agent-card-active")}
            onClick={() => onSelectPersona(persona.id)}
          >
            <div className="nv-agent-card-header">
              <span className="nv-agent-label">{persona.label}</span>
              <span className={cn("nv-badge nv-badge-sm", {
                "nv-badge-success": persona.status === "active",
                "nv-badge-warning": persona.status === "learning",
                "nv-badge-dim": persona.status === "paused",
              })}>
                {persona.status}
              </span>
            </div>
            <p className="nv-agent-desc">{persona.description}</p>
            <div className="nv-agent-meta">
              <span className="nv-text-dim">Autonomy: {persona.autonomyLevel}</span>
              <span className="nv-text-dim">{persona.capabilities.length} capabilities</span>
            </div>
            <div className="nv-agent-actions">
              <button
                className="nv-btn nv-btn-sm nv-btn-primary"
                onClick={(e) => { e.stopPropagation(); handleExecute(persona.id); }}
                disabled={executing === persona.id}
              >
                {executing === persona.id ? "Running..." : "Execute"}
              </button>
              {results[persona.id] != null && (
                <span className={cn("nv-text-sm", results[persona.id]!.success ? "nv-text-success" : "nv-text-error")}>
                  {results[persona.id]!.steps} steps completed
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Advanced Search Bar ────────────────────────────────────

export function AdvancedSearchBar({
  value,
  onChange,
  onSearch,
  suggestions,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: (query: string) => void;
  suggestions: Array<{ label: string; value: string; description: string }>;
}) {
  const [focused, setFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onSearch(value);
      setShowSuggestions(false);
    }
    if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const activeSuggestions = focused && showSuggestions
    ? suggestions.filter((s) => {
        const lastWord = value.split(/\s+/).pop() || "";
        return s.value.toLowerCase().includes(lastWord.toLowerCase()) || lastWord === "";
      })
    : [];

  return (
    <div className="nv-search-bar-wrapper">
      <div className={cn("nv-search-bar", focused && "nv-search-bar-focused")}>
        <span className="nv-search-icon">⌕</span>
        <input
          ref={inputRef}
          className="nv-search-input"
          value={value}
          onChange={(e) => { onChange(e.target.value); setShowSuggestions(true); }}
          onFocus={() => { setFocused(true); setShowSuggestions(true); }}
          onBlur={() => { setFocused(false); setTimeout(() => setShowSuggestions(false), 200); }}
          onKeyDown={handleKeyDown}
          placeholder='Search mail (try: from:john has:attachment is:unread)'
        />
        {value && (
          <button className="nv-search-clear" onClick={() => { onChange(""); onSearch(""); }}>✕</button>
        )}
        <button className="nv-search-btn" onClick={() => onSearch(value)}>Search</button>
      </div>

      {activeSuggestions.length > 0 && (
        <div className="nv-search-suggestions">
          {activeSuggestions.map((s) => (
            <button
              key={s.value}
              className="nv-search-suggestion"
              onClick={() => {
                const words = value.split(/\s/);
                words.pop();
                const newValue = [...words, s.value].join(" ") + " ";
                onChange(newValue);
                setShowSuggestions(false);
                inputRef.current?.focus();
              }}
            >
              <span className="nv-suggestion-label">{s.label}</span>
              <span className="nv-suggestion-value">{s.value}</span>
              <span className="nv-suggestion-desc">{s.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Security Dashboard ─────────────────────────────────────

export function SecurityDashboard({
  score,
  events,
  threatMatrix,
  onResolveEvent,
}: {
  score: number;
  events: SecurityEvent[];
  threatMatrix: Array<{ threat: string; count: number; trend: "up" | "down" | "stable" }>;
  onResolveEvent: (eventId: string) => void;
}) {
  const [selectedSeverity, setSelectedSeverity] = useState<string | null>(null);

  const filteredEvents = selectedSeverity
    ? events.filter((e) => e.severity === selectedSeverity)
    : events;

  const getScoreColor = (s: number) => {
    if (s >= 80) return "nv-text-success";
    if (s >= 50) return "nv-text-warning";
    return "nv-text-error";
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical": return "nv-badge-error";
      case "high": return "nv-badge-warning";
      case "medium": return "nv-badge-primary";
      default: return "nv-badge-dim";
    }
  };

  return (
    <div className="nv-panel nv-security-dashboard">
      <div className="nv-panel-header">
        <h3>Security Dashboard</h3>
        <span className={cn("nv-score", getScoreColor(score))}>Score: {score}/100</span>
      </div>

      <div className="nv-security-grid">
        <div className="nv-security-metric">
          <span className="nv-metric-label">Threats Blocked</span>
          <div className="nv-threat-matrix">
            {threatMatrix.map((t) => (
              <div key={t.threat} className="nv-threat-row">
                <span className="nv-threat-name">{t.threat}</span>
                <span className="nv-threat-count">{t.count}</span>
                <span className={cn("nv-threat-trend", {
                  "nv-trend-up": t.trend === "up",
                  "nv-trend-down": t.trend === "down",
                })}>
                  {t.trend === "up" ? "↑" : t.trend === "down" ? "↓" : "→"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="nv-security-metric">
          <div className="nv-metric-header">
            <span className="nv-metric-label">Recent Events</span>
            <div className="nv-filter-chips">
              {["critical", "high", "medium", "low"].map((sev) => (
                <button
                  key={sev}
                  className={cn("nv-chip", selectedSeverity === sev && "nv-chip-active")}
                  onClick={() => setSelectedSeverity(selectedSeverity === sev ? null : sev)}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>
          <div className="nv-event-list">
            {filteredEvents.slice(0, 10).map((event) => (
              <div key={event.id} className="nv-event-row">
                <span className={cn("nv-badge nv-badge-sm", getSeverityBadge(event.severity))}>
                  {event.severity}
                </span>
                <div className="nv-event-info">
                  <span className="nv-event-type">{event.type}</span>
                  <span className="nv-event-details">{event.details}</span>
                </div>
                {!event.isResolved && (
                  <button
                    className="nv-btn nv-btn-sm"
                    onClick={() => onResolveEvent(event.id)}
                  >
                    Resolve
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Voice Note Recorder ────────────────────────────────────

export function VoiceNoteRecorder({
  onRecordingComplete,
  onCancel,
}: {
  onRecordingComplete: (audioBlob: Blob, duration: number) => void;
  onCancel: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        onRecordingComplete(blob, duration);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start();
      setRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
        setAudioLevel(Math.random() * 100);
      }, 1000);
    } catch {
      onCancel();
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (!recording) {
    return (
      <div className="nv-voice-recorder">
        <button className="nv-btn nv-btn-primary" onClick={startRecording}>
          🎤 Record Voice Note
        </button>
        <button className="nv-btn nv-btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    );
  }

  return (
    <div className="nv-voice-recorder nv-recording">
      <div className="nv-recording-indicator">
        <span className="nv-record-dot" />
        <span className="nv-recording-time">{formatDuration(duration)}</span>
      </div>
      <div className="nv-audio-level">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className={cn("nv-audio-bar", i < Math.floor(audioLevel / 10) && "nv-audio-bar-active")}
          />
        ))}
      </div>
      <button className="nv-btn nv-btn-error" onClick={stopRecording}>
        ⏹ Stop & Save
      </button>
    </div>
  );
}
