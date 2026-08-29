"use client";
import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import {
  checkPermission, updatePresence, listPresence, acquireLock, listLocks, submitOperation, listOperations,
  createBranch, listBranches, mergePreview, applyMerge, listApprovals, createCommentThread, listCommentThreads,
  listMarkerSets, getDashboard, createOfflineSnapshot, queueOfflineOperation, reconcileOffline, validateOperation,
} from "./collaboration-engine";
import type { CollaboratorRole } from "./collaboration-types";

export function CollaborationPanel({ projectId }: { projectId: string }) {
  const [role, setRole] = useState<CollaboratorRole>("editor");
  const [presenceInfo, setPresenceInfo] = useState(() => listPresence().length ? `Active ${listPresence().length}` : "No presence yet");
  const [locks, setLocks] = useState(() => listLocks());
  const [branches, setBranches] = useState(() => listBranches());
  const [ops, setOps] = useState(() => listOperations());
  const dashboard = useMemo(() => getDashboard(), [locks.length, branches.length, ops.length, presenceInfo]);

  const handlePresence = () => {
    updatePresence({
      user_id: `user_${role}_001`, display_name: role === "editor" ? "Arjun" : role === "client" ? "Elena" : "Maya",
      role, avatar: (role[0] ?? "E").toUpperCase(), branch_id: "branch_roughcut", timeline_position_ms: 84200,
      selected_clip: "clip_004", active_tool: "trim", editing_status: role === "editor" ? "editing" : role === "client" ? "watching" : "reviewing",
      last_activity: new Date().toISOString(), voice_chat: false, screen_sharing: false, cursor: { track: "video_1", x: 0.42, y: 0.5 },
    });
    setPresenceInfo(`Presence updated for ${role} — ${new Date().toLocaleTimeString()}`);
  };

  const handleLock = () => {
    try {
      const l = acquireLock({
        owner_id: `user_${role}_001`, branch_id: "branch_roughcut",
        scope: { tracks: ["video_1", "audio_dialogue"], start_ms: 45000, end_ms: 78000 },
        lock_type: "exclusive_edit", reason: "Dialogue restructuring", lease_seconds: 900,
        allow_comments: true, allow_review: true, allow_override_roles: ["director", "producer"],
      });
      setLocks(listLocks()); setPresenceInfo(`Lock ${l.lock_id.slice(0,8)} acquired 45.0–78.0s`);
    } catch (e) { setPresenceInfo(`Lock failed: ${String(e).slice(0,80)}`); }
  };

  const handleOp = () => {
    const perm = checkPermission({ role, permission: "timeline.region.edit", scope: { project_id: projectId, branch_id: "branch_roughcut", tracks: ["video_1"], time_ranges: [{ start_ms: 45000, end_ms: 52000 }] }, stage: "client_approval" });
    if (!perm.allowed) { setPresenceInfo(`Operation blocked: ${perm.reason}`); return; }
    const op = submitOperation({
      actor_id: `user_${role}_001`, branch_id: "branch_roughcut", type: "trim_clip",
      target: { clip_id: "clip_004" }, payload: { source_out_ms: 22400 }, base_revision: "rev_0189",
    });
    setOps(listOperations()); setPresenceInfo(`Operation ${op.op_id.slice(0,8)} trim_clip applied rev ${op.lamport_clock}`);
  };

  const handleBranch = () => {
    const b = createBranch({ name: "Client alternate opening", from_revision: "rev_0192", scope: { time_ranges: [{ start_ms: 0, end_ms: 30000 }] }, owner_id: `user_${role}_001` });
    setBranches(listBranches()); setPresenceInfo(`Branch ${b.branch_id.slice(0,8)} ${b.name} from ${b.parent_revision}`);
  };

  const preview = useMemo(() => mergePreview("branch_client_alt_03", "main"), []);
  const handleMerge = () => {
    const r = applyMerge("branch_client_alt_03", "main", { conflict_001: "keep_source", conflict_002: "manual_revision_01" });
    setPresenceInfo(`Merge → ${r.merged_revision} invalidated ${r.invalidated.join(",") || "none"}`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header — principle */}
      <div style={{ background: "linear-gradient(135deg,#0f0f12 0%,#1a243a 100%)", color: "#fff", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", opacity: 0.7, fontWeight: 800 }}>COLLABORATIVE EDITING FABRIC — MANY MAY WORK, NO AMBIGUITY</div>
        <div style={{ fontSize: 14, fontWeight: 900, marginTop: 4 }}>References & decisions sync via CRDT/OT; media stays immutable content-addressed</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, fontSize: 11, opacity: 0.85 }}>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Immutable media layer → Collaborative edit layer → Sync layer → Governance</span>
        </div>
      </div>

      {/* Role model */}
      <Card padded>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800 }}>Role Model (RBAC + project/branch/region/stage)</span>
          <select value={role} onChange={e => setRole(e.target.value as CollaboratorRole)} className="nv-input" style={{ fontSize: 11 }}>
            {(["editor","reviewer","producer","client","legal","viewer","director","administrator"] as CollaboratorRole[]).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <Badge tone="primary">{role}</Badge>
          <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Editor: timeline.region.edit on video_1 0–90s requires_lock — stage-aware</span>
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", fontSize: 11 }}>
          {[
            ["editor","Modify timeline, clips, effects","Cannot approve legal/client unless granted"],
            ["reviewer","Comments, markers","No edit"],
            ["producer","Schedule, locks, versions","Needs edit permission"],
            ["client","Comment/approve","No source-media by default"],
          ].map(([r, cap, rest]) => <span key={r as string} style={{ background: role === r ? "rgba(14,165,233,0.12)" : "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", padding: "4px 8px", borderRadius: 999 }}><b>{r as string}</b> {cap as string} — <i>{rest as string}</i></span>)}
        </div>
        <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Permission example: timeline.region.edit for role:editor scope project_001 branch_roughcut tracks[video_1, audio_dialogue] time 0–90s condition review_stage internal_edit requires_lock true</div>
      </Card>

      {/* Presence */}
      <Card padded>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontWeight: 800 }}>Presence — lightweight, precise, privacy-conscious</span>
          <Button size="sm" onClick={handlePresence}>Update presence as {role}</Button>
          <Badge tone="neutral">{presenceInfo}</Badge>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {[
            { name: "Arjun", role: "Editor", status: "editing", branch: "Rough Cut v12", track: "Dialogue", pos: "00:01:24:12", dot: "●", color: "#22c55e" },
            { name: "Maya", role: "Legal", status: "reviewing", branch: "Product Claims", pos: "00:00:48:06", dot: "●", color: "#f59e0b" },
            { name: "Elena", role: "Client", status: "watching", branch: "Client Approval", pos: "—", dot: "○", color: "#94a3b8" },
          ].map(u => (
            <div key={u.name} style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: "6px 8px", fontSize: 11, minWidth: 180 }}>
              <div style={{ fontWeight: 700 }}><span style={{ color: u.color }}>{u.dot}</span> {u.name} — {u.role} — {u.status}</div>
              <div style={{ color: "var(--nv-color-text-muted)" }}>Branch: {u.branch} • Pos: {u.pos}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Cursor decoupled from authority • throttled updates • last-seen fallback • per-project visibility • viewer privacy • high-fidelity for active, low-frequency for observers</div>
      </Card>

      {/* Locks */}
      <Card padded>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontWeight: 800 }}>Region-Level Locks (not just track-level)</span>
          <Button size="sm" onClick={handleLock}>Acquire 45.0–78.0s exclusive_edit</Button>
          <Badge tone="neutral">{locks.length} locks</Badge>
        </div>
        <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginTop: 4 }}>Tracks, time ranges, nested sequences, scenes, clip groups, effect stacks, audio stems, graphics, legal/product regions — types: exclusive_edit, soft_claim, review_lock, legal_lock, approval_lock, export_lock, read_only, consent_lock</div>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {locks.slice(0, 3).map(l => (
            <div key={l.lock_id} style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 11 }}>
              <div style={{ display: "flex", gap: 6 }}><Badge tone="warning">{l.lock_type}</Badge><span style={{ fontFamily: "var(--nv-font-mono)" }}>{l.scope.start_ms}–{l.scope.end_ms} {l.scope.tracks.join(",")}</span><span style={{ marginLeft: "auto" }}>{l.owner_id} • {l.reason}</span></div>
              <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>expires {new Date(l.expires_at).toLocaleTimeString()} • allow_comments {String(l.allow_comments)} • override {l.allow_override_roles.join(",")}</div>
            </div>
          ))}
          {locks.length === 0 && <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>No locks — region 00:00:45–00:01:18 available</div>}
        </div>
        <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Lease-based renewal, heartbeat, disconnect recovery, auto-expiry — network failure never permanently locks</div>
      </Card>

      {/* Operations & Branches */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Synchronization — CRDT/OT metadata + immutable hashes <Button size="sm" variant="ghost" onClick={handleOp}>Submit trim_clip op</Button></div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginTop: 4 }}>CRDT for timeline metadata, clip in/out, track order, keyframes, markers, comments, locks. Media: sha3-512 hashes, not binary sync.</div>
          <div style={{ background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222", marginTop: 8 }}>
            <div>insert_clip(asset_hash=sha3-512:abc..., source_in=12000, source_out=21000, timeline_in=45000, track=video_1)</div>
            <div>op: {`{op_id: op_01J..., actor: user_editor_001, branch: branch_roughcut, lamport: 1842, vector_clock: {editor:1842, director:1810}, type: trim_clip, target: clip_004, payload: {source_out_ms:22400}, base_revision: rev_0189}`}</div>
          </div>
          <div style={{ marginTop: 8, maxHeight: 90, overflow: "auto", background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 6 }}>
            {ops.slice(-5).map(o => <div key={o.op_id} style={{ fontSize: 11, fontFamily: "var(--nv-font-mono)", borderBottom: "1px solid var(--nv-color-border)", padding: "4px 0" }}>{o.op_id.slice(0,8)} {o.type} {o.actor_id.slice(0,8)} lamport {o.lamport_clock} rev {o.base_revision}</div>)}
            {ops.length === 0 && <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>No operations yet</div>}
          </div>
          <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Idempotent, causally ordered, replayable, auditable, reversible, branch-aware — never silently discard later edit</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Branch-Based Editing <Button size="sm" variant="ghost" onClick={handleBranch}>Create branch from 0–30s</Button></div>
          <div style={{ background: "#0f0f12", color: "#e2e8f0", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222", marginTop: 8, lineHeight: 1.6 }}>
            <div>main</div><div>├── rough-cut-v12</div><div>│   ├── editor-arjun-dialogue</div><div>│   └── producer-short-form</div><div>├── director-alt-opening</div><div>└── legal-disclaimer-revision</div>
          </div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4, maxHeight: 100, overflow: "auto" }}>
            {branches.slice(0, 5).map(b => <div key={b.branch_id} style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 6, padding: "6px 8px", fontSize: 11 }}><b>{b.name}</b> {b.branch_id.slice(0,8)} parent {b.parent_revision} scope {b.scope?.time_ranges?.[0] ? `${b.scope.time_ranges[0].start_ms}-${b.scope.time_ranges[0].end_ms}` : "full"} stage {b.review_stage}</div>)}
          </div>
        </Card>
      </div>

      {/* Merge preview + offline */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Conflict Preview — before merge <Button size="sm" variant="ghost" onClick={handleMerge}>Apply merge (keep_source)</Button></div>
          <div style={{ background: "var(--nv-color-surface-2)", padding: 8, borderRadius: 8, fontSize: 11, border: "1px solid var(--nv-color-border)", marginTop: 8 }}>
            <div>Merge preview: editor-arjun-dialogue → main — Conflicts: {preview.conflicts.length} Warnings: {preview.warnings.length} Auto-mergeable: {preview.auto_mergeable}</div>
            {preview.conflicts.slice(0, 3).map((c, i) => <div key={i} style={{ marginTop: 6, borderTop: "1px solid var(--nv-color-border)", paddingTop: 4 }}><b>{(c.range.start_ms / 1000).toFixed(1)}s</b> Main: {c.main} • Branch: {c.branch} • <i>{c.conflict_type}</i> [{c.category}]</div>)}
            <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}><Badge tone="neutral">structural</Badge><Badge tone="neutral">legal</Badge><Badge tone="neutral">approval_invalidation</Badge></div>
            <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Options: Keep main / Keep branch / Keep both / Manual / Auto-merge / Create conflict branch / Escalate</div>
          </div>
          <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Approval invalidated: Client approval 00:30–01:10 at rev_0192 invalidated by edit 00:46–00:51 → Brand Review invalidated, Legal at 01:45 unaffected</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Offline Editing & Reconciliation</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <Button size="sm" variant="ghost" onClick={() => { const s = createOfflineSnapshot(projectId, "branch_roughcut", "device_001"); alert(`Snapshot ${s.snapshot_id} expires ${new Date(s.expires_at).toLocaleTimeString()}`); }}>Cache proxy + snapshot</Button>
            <Button size="sm" variant="ghost" onClick={() => { queueOfflineOperation("device_001", { device_id: "device_001", local_branch: "branch_roughcut", local_revision: "rev_0190", operation_hash: "hash:op", parent_vector_clock: {}, op_id: "op_offline_1", actor_id: "user_editor_001", branch_id: "branch_roughcut", lamport_clock: 1900, vector_clock: {}, type: "trim_clip", target: { clip_id: "clip_004" }, payload: {}, base_revision: "rev_0190", created_at: new Date().toISOString(), signature: "sig", branch_aware: true }); alert("Queued offline trim"); }}>Queue offline op</Button>
            <Button size="sm" onClick={() => { const r = reconcileOffline("device_001"); alert(`Reconciled applied ${r.applied_automatically} needs ${r.needs_review} rejected ${r.rejected} — ${r.rejected_details?.[0] ?? ""}`); }}>Reconcile</Button>
          </div>
          <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Available offline: proxy edits, branches, comments, cuts/markers, permitted effects. Unavailable: public export, consent generation, external ingest, legal approval. Signed device+user+branch+revision+vector_clock → rebase, re-evaluate locks/approvals/brand/consent → report 42 applied, 4 needs review, 1 rejected (voice clone no consent)</div>
        </Card>
      </div>

      {/* Dashboard */}
      <Card padded>
        <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Collaboration Dashboard <Badge tone="neutral">8 / 50 active</Badge></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 8, fontSize: 11 }}>
          <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}><div style={{ fontWeight: 700 }}>Editing: 3</div><div>Reviewing: 2</div><div>Watching: 3</div></div>
          <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}><div style={{ fontWeight: 700 }}>Branches</div><div>Main Rev 193 clean</div><div>Dialogue Restructure — 2 conflicts</div></div>
          <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}><div style={{ fontWeight: 700 }}>Locks</div><div>00:45–01:18 Arjun</div><div>00:01:45 Legal</div></div>
          <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}><div style={{ fontWeight: 700 }}>Approvals</div><div>Creative: approved</div><div>Legal: pending</div></div>
        </div>
        <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Performance: presence 100ms, cursor 100ms, comment 200ms, timeline op 200ms, lock 300ms, branch 1s, conflict preview 5s, offline 10s for 1k ops — separate targets so media never degrades metadata collaboration</div>
        <div style={{ marginTop: 8, fontSize: 11, background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", border: "1px solid #222" }}>
          Live: Arjun editing Dialogue 00:45–01:18, Maya reviewing Legal Claims 00:48, Elena watching client branch, 3 comments unresolved, 1 legal region locked, your region 01:20–01:44, Branch Main Rev193 Permissions Edit assigned region — Merge readiness: Source Client Alternate Opening → Main Auto-mergeable 24 Conflicts 3 Approval invalidations 1
        </div>
      </Card>
    </div>
  );
}
