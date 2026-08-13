"use client";

import { useState } from "react";
import { EVENT_TYPES } from "@n0va/modules-events";

const s = {
  card: { background: "var(--nv-surface, #16151d)", border: "1px solid var(--nv-border, #2a2936)", borderRadius: "var(--nv-radius-md, 12px)", padding: 16, marginBottom: 12 },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const },
  input: { background: "var(--nv-surface2, #1e1d27)", border: "1px solid var(--nv-border, #2a2936)", color: "var(--nv-text, #e8e6ef)", borderRadius: 8, padding: "8px 10px", fontSize: 13, minWidth: 150 },
  select: { background: "var(--nv-surface2, #1e1d27)", border: "1px solid var(--nv-border, #2a2936)", color: "var(--nv-text, #e8e6ef)", borderRadius: 8, padding: "8px 10px", fontSize: 13 },
  button: { background: "var(--nv-accent, #7c5cfc)", border: 0, color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" },
  smallButton: { background: "var(--nv-surface2, #1e1d27)", border: "1px solid var(--nv-border, #2a2936)", color: "var(--nv-text, #e8e6ef)", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer" },
  label: { fontSize: 12, color: "var(--nv-muted, #9a97a8)" },
  chip: { display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600 },
};

export function EmitEventForm() {
  const [eventType, setEventType] = useState<string>(EVENT_TYPES.TASK_CREATED);
  const [payload, setPayload] = useState<string>('{"title":"Test task","taskId":"t_test","assigneeId":"demo","workspaceId":"ws_1"}');
  const [status, setStatus] = useState<string>("");

  async function submit() {
    setStatus("sending…");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payload);
    } catch {
      setStatus("invalid JSON");
      return;
    }
    const res = await fetch("/api/events/emit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, payload: parsed }),
    });
    const json = (await res.json()) as { ok?: boolean; eventId?: string; error?: string };
    setStatus(res.ok ? `emitted ${json.eventId ?? ""}` : `error: ${json.error ?? res.status}`);
    window.location.reload();
  }

  return (
    <div style={s.card}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Emit synthetic event</div>
      <div style={s.row}>
        <select style={s.select} value={eventType} onChange={(e) => setEventType(e.target.value)}>
          {Object.values(EVENT_TYPES).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input style={{ ...s.input, flex: 1 }} value={payload} onChange={(e) => setPayload(e.target.value)} placeholder='{"key":"value"}' />
        <button style={s.button} onClick={submit}>
          Emit
        </button>
      </div>
      {status && <div style={{ ...s.label, marginTop: 8 }}>{status}</div>}
    </div>
  );
}

export function RetryDlqButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  async function retry() {
    setBusy(true);
    await fetch("/api/events/dlq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    window.location.reload();
  }
  return (
    <button style={s.smallButton} disabled={busy} onClick={retry}>
      Retry
    </button>
  );
}

interface LineageNode {
  eventId: string;
  eventType: string;
  timestamp: string;
  producer: string;
  correlationId?: string;
  causationId?: string;
  payload?: Record<string, unknown>;
  hops: Array<{ consumer: string; status: string; latencyMs: number; at: string }>;
  children: LineageNode[];
}

function LineageNodeRow({ node, depth }: { node: LineageNode; depth: number }) {
  const payloadKeys = node.payload ? Object.keys(node.payload) : [];
  return (
    <div style={{ marginLeft: depth * 18, borderLeft: "1px solid var(--nv-border, #2a2936)", paddingLeft: 10, marginTop: 6 }}>
      <div style={{ fontSize: 13 }}>
        <span style={{ ...s.chip, background: "#7c5cfc22", color: "#b9a6ff", marginRight: 6 }}>
          {node.eventType}
        </span>
        <span style={{ ...s.label }}>{node.eventId}</span>
        <span style={{ ...s.label, marginLeft: 8 }}>{node.timestamp.slice(11, 19)}</span>
        {node.hops.map((h, i) => (
          <span key={i} style={{ ...s.chip, background: "#3ddc8422", color: "#3ddc84", marginLeft: 6 }}>
            {h.consumer}:{h.status}
          </span>
        ))}
        {payloadKeys.length > 0 && (
          <span style={{ ...s.label, marginLeft: 6 }}>payload: {payloadKeys.join(", ")}</span>
        )}
      </div>
      {node.children.map((c) => (
        <LineageNodeRow key={c.eventId} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}

export function LineageButton({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [tree, setTree] = useState<LineageNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!tree) {
      const res = await fetch(`/api/events/lineage?eventId=${encodeURIComponent(eventId)}`);
      const json = (await res.json()) as { tree?: LineageNode; error?: string };
      if (res.ok && json.tree) setTree(json.tree);
      else setError(json.error ?? "failed to load lineage");
    }
  }

  return (
    <>
      <button style={s.smallButton} onClick={toggle}>
        {open ? "Hide" : "Lineage"}
      </button>
      {open && (
        <div style={{ marginTop: 8, padding: 10, background: "var(--nv-surface2, #1e1d27)", borderRadius: 8 }}>
          {error ? (
            <div style={s.label}>{error}</div>
          ) : tree ? (
            <LineageNodeRow node={tree} depth={0} />
          ) : (
            <div style={s.label}>loading…</div>
          )}
        </div>
      )}
    </>
  );
}