"use client";
import { useState, useEffect, useCallback } from "react";

interface ThreadNode {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  depth: number;
  labels: string[];
  hasDecision: boolean;
  hasAction: boolean;
  isResolved: boolean;
  childCount: number;
}

interface ThreadTreeProps {
  threadId: string;
  workspaceId: string;
  onNodeClick?: (nodeId: string) => void;
}

const NODE_BADGES: Record<string, { icon: string; color: string; label: string }> = {
  decision: { icon: "⚖️", color: "#7c5cfc", label: "Decision" },
  action: { icon: "✅", color: "#10b981", label: "Action" },
  question: { icon: "❓", color: "#f59e0b", label: "Question" },
  resolved: { icon: "✓", color: "#25D366", label: "Resolved" },
};

export function ThreadTree({ threadId, onNodeClick }: ThreadTreeProps) {
  const [nodes, setNodes] = useState<ThreadNode[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [focusedNode, setFocusedNode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadTree = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/threads/${threadId}`);
      if (res.ok) {
        const data = await res.json();
        const flatNodes: ThreadNode[] = [];
        const processReplies = (replies: any[], depth: number) => {
          for (const r of replies) {
            flatNodes.push({
              id: r.id, authorName: r.authorName, body: r.body, createdAt: r.createdAt,
              depth, labels: r.labels || [],
              hasDecision: false, hasAction: r.parentId !== null, isResolved: false, childCount: r._count?.replies || 0,
            });
            if (r.replies?.length) processReplies(r.replies, depth + 1);
          }
        };
        if (data.parent) {
          flatNodes.push({ id: data.parent.id, authorName: data.parent.authorName, body: data.parent.body, createdAt: data.parent.createdAt, depth: 0, labels: [], hasDecision: false, hasAction: false, isResolved: false, childCount: data.replies?.length || 0 });
        }
        if (data.replies) processReplies(data.replies, 1);
        setNodes(flatNodes);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [threadId]);

  useEffect(() => { loadTree(); }, [loadTree]);

  const toggleCollapse = (nodeId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
      return next;
    });
  };

  const getBadges = (node: ThreadNode) => {
    const badges: { icon: string; color: string; label: string }[] = [];
    if (node.hasDecision) { const b = NODE_BADGES.decision; if (b) badges.push(b); }
    if (node.hasAction) { const b = NODE_BADGES.action; if (b) badges.push(b); }
    if (node.isResolved) { const b = NODE_BADGES.resolved; if (b) badges.push(b); }
    return badges;
  };

  if (loading) return <div style={{ padding: "var(--nv-space-3)", fontSize: 12, color: "var(--nv-color-text-faint)" }}>Loading thread tree...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {nodes.map((node, idx) => {
        const isCollapsed = collapsed.has(node.id);
        const badges = getBadges(node);
        const isFocused = focusedNode === node.id;

        return (
          <div
            key={node.id}
            onClick={() => { setFocusedNode(node.id); onNodeClick?.(node.id); }}
            style={{
              display: "flex", gap: 8, padding: "6px 8px", borderRadius: "var(--nv-radius-md)",
              paddingLeft: 8 + node.depth * 20,
              background: isFocused ? "var(--nv-color-primary-alpha)" : "transparent",
              cursor: "pointer", borderLeft: node.depth > 0 ? `2px solid var(--nv-color-border)` : "none",
            }}
          >
            {node.childCount > 0 && (
              <button onClick={(e) => { e.stopPropagation(); toggleCollapse(node.id); }} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 10, color: "var(--nv-color-text-faint)", width: 16 }}>
                {isCollapsed ? "▶" : "▼"}
              </button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{node.authorName}</span>
                <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>{new Date(node.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                {badges.map(b => (
                  <span key={b.label} title={b.label} style={{ fontSize: 10, padding: "1px 4px", borderRadius: 999, background: `${b.color}20`, color: b.color, fontWeight: 600 }}>
                    {b.icon} {b.label}
                  </span>
                ))}
              </div>
              {!isCollapsed && (
                <div style={{ fontSize: "var(--nv-font-sm)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {node.body}
                </div>
              )}
              {isCollapsed && node.childCount > 0 && (
                <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 2 }}>{node.childCount} replies hidden</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ThreadBreadcrumbs({ threadId, onNavigate }: { threadId: string; onNavigate?: (threadId: string) => void }) {
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; title: string }>>([]);

  useEffect(() => {
    fetch(`/api/threads/${threadId}/breadcrumbs`).then(r => r.json()).then(d => setBreadcrumbs(d.breadcrumbs ?? [])).catch(() => {});
  }, [threadId]);

  if (breadcrumbs.length <= 1) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--nv-color-text-faint)", padding: "4px 8px" }}>
      {breadcrumbs.map((bc, i) => (
        <span key={bc.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {i > 0 && <span>›</span>}
          <button onClick={() => onNavigate?.(bc.id)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--nv-color-primary)", fontSize: 12, padding: 0 }}>
            {bc.title.length > 30 ? bc.title.slice(0, 27) + "..." : bc.title}
          </button>
        </span>
      ))}
    </div>
  );
}

export function DecisionList({ threadId }: { threadId: string }) {
  const [decisions, setDecisions] = useState<Array<{ id: string; decisionText: string; status: string; authorName: string; confidence: number }>>([]);

  useEffect(() => {
    fetch(`/api/threads/${threadId}/decisions`).then(r => r.json()).then(d => setDecisions(d.decisions ?? [])).catch(() => {});
  }, [threadId]);

  if (decisions.length === 0) return null;

  return (
    <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: "var(--nv-space-3)", background: "var(--nv-color-surface)" }}>
      <div style={{ fontWeight: 700, fontSize: "var(--nv-font-sm)", marginBottom: "var(--nv-space-2)" }}>⚖️ Decisions</div>
      {decisions.map(d => (
        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: "var(--nv-font-sm)" }}>
          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: d.status === "CONFIRMED" ? "color-mix(in srgb, var(--nv-color-success) 14%, transparent)" : "var(--nv-color-surface-2)", color: d.status === "CONFIRMED" ? "var(--nv-color-success)" : "var(--nv-color-text-faint)", fontWeight: 600 }}>
            {d.status}
          </span>
          <span style={{ flex: 1 }}>{d.decisionText}</span>
          {d.confidence > 0 && <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>{Math.round(d.confidence * 100)}%</span>}
        </div>
      ))}
    </div>
  );
}

export function ActionItemList({ threadId }: { threadId: string }) {
  const [actions, setActions] = useState<Array<{ id: string; title: string; ownerName: string; dueDate: string; priority: string; status: string }>>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/threads/${threadId}/actions`).then(r => r.json()).then(d => setActions(d.actions ?? [])).catch(() => {});
  }, [threadId]);

  useEffect(() => { load(); }, [load]);

  const extractAll = async () => {
    setLoading(true);
    await fetch(`/api/threads/${threadId}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    load();
    setLoading(false);
  };

  return (
    <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: "var(--nv-space-3)", background: "var(--nv-color-surface)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--nv-space-2)" }}>
        <span style={{ fontWeight: 700, fontSize: "var(--nv-font-sm)" }}>✅ Action Items</span>
        <button onClick={extractAll} disabled={loading} style={{ fontSize: 11, padding: "3px 8px", borderRadius: "var(--nv-radius-sm)", border: "1px solid var(--nv-color-border)", background: "transparent", cursor: "pointer" }}>
          {loading ? "..." : "Extract"}
        </button>
      </div>
      {actions.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No action items extracted.</div>}
      {actions.map(a => (
        <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: "var(--nv-font-sm)" }}>
          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: a.priority === "CRITICAL" ? "var(--nv-color-danger-alpha)" : a.priority === "HIGH" ? "color-mix(in srgb, var(--nv-color-warning) 14%, transparent)" : "var(--nv-color-surface-2)", color: a.priority === "CRITICAL" ? "var(--nv-color-danger)" : "var(--nv-color-text-faint)", fontWeight: 600 }}>
            {a.priority}
          </span>
          <span style={{ flex: 1 }}>{a.title}</span>
          {a.ownerName && <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>@{a.ownerName}</span>}
        </div>
      ))}
    </div>
  );
}
