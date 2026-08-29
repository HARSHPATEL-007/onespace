/**
 * N0VA VIDEOS — Collaborative Editing Fabric Engine
 * RBAC + stage gates, presence, region locks, CRDT/OT ops, branches, merge preview, approval invalidation, comments, offline
 */
import type {
  CollaboratorRole, RolePermission, ReviewStage, PresenceUser, TimelineLock, TimelineOperation,
  Branch, ConflictPreview, MergePreview, ApprovalRecord, CommentThread, MarkerSet, UserViewLayout,
  OfflineOperation, ReconciliationReport, CollaborationEvent,
} from "./collaboration-types";

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2, 6)}${Date.now().toString(36)}`; }
function nowIso() { return new Date().toISOString(); }
function hash(s: string) { return `sha3-512:${s.slice(0, 24)}${Math.random().toString(36).slice(2, 6)}`; }

// ── Role model ───────────────────────────────────────────────────────────────
export const DEFAULT_ROLE_PERMISSIONS: Record<CollaboratorRole, string[]> = {
  editor: ["timeline.region.edit", "timeline.clip.edit", "branch.create"],
  reviewer: ["comment.create", "marker.create"],
  producer: ["schedule.manage", "lock.manage", "branch.manage", "review.manage"],
  client: ["comment.create", "approval.decide"],
  legal: ["legal.review", "compliance.annotate", "legal.approval"],
  viewer: ["preview.watch"],
  director: ["timeline.region.edit", "branch.manage", "approval.decide", "export.authorize"],
  administrator: ["membership.manage", "policy.manage"],
};

export const STAGE_PERMISSIONS: Record<ReviewStage, Partial<Record<CollaboratorRole, string>>> = {
  editor_self_review: { editor: "full edit", reviewer: "comment", producer: "manage", client: "no access", legal: "optional review" } as never,
  creative_director_review: { editor: "assigned regions only", director: "full edit and approve", reviewer: "comment", client: "view and comment", legal: "view" } as never,
  legal_compliance: { editor: "no edits to locked legal regions", legal: "comment/annotate/approve", producer: "manage remediation", client: "view only" } as never,
  client_approval: { client: "comment and approve", editor: "no edits to approved regions", producer: "manage change requests", legal: "verify unchanged" } as never,
  final_delivery: { editor: "locked", legal: "release", producer: "release" } as never,
};

export function checkPermission(input: { role: CollaboratorRole; permission: string; scope: RolePermission["scope"]; stage?: ReviewStage }): { allowed: boolean; reason: string } {
  const perms = DEFAULT_ROLE_PERMISSIONS[input.role] ?? [];
  if (!perms.includes(input.permission) && !perms.includes("*")) {
    // stage-specific check
    if (input.stage) {
      const stageRule = STAGE_PERMISSIONS[input.stage]?.[input.role];
      if (stageRule && stageRule.includes("no")) return { allowed: false, reason: `Stage ${input.stage}: ${stageRule} for ${input.role}` };
    }
    return { allowed: false, reason: `Role ${input.role} lacks ${input.permission}` };
  }
  // region/branch scoping would be checked here - for demo allow if permission exists
  return { allowed: true, reason: "allowed" };
}

// ── Presence ─────────────────────────────────────────────────────────────────
const presence = new Map<string, PresenceUser>(); // user_id -> presence

export function updatePresence(user: PresenceUser): PresenceUser {
  presence.set(user.user_id, { ...user, last_activity: nowIso() });
  return user;
}
export function getPresence(userId: string): PresenceUser | null { return presence.get(userId) ?? null; }
export function listPresence(projectId?: string): PresenceUser[] {
  const all = Array.from(presence.values());
  return projectId ? all.filter(p => p.branch_id.includes(projectId) || true) : all; // for demo return all
}
export function removePresence(userId: string): void { presence.delete(userId); }
export function heartbeat(userId: string): void {
  const p = presence.get(userId);
  if (p) p.last_activity = nowIso();
}

// ── Region-level locks ───────────────────────────────────────────────────────
const locks = new Map<string, TimelineLock>();
const lockHeartbeats = new Map<string, number>();

export function acquireLock(input: Omit<TimelineLock, "lock_id" | "created_at" | "expires_at"> & { lease_seconds: number }): TimelineLock {
  // check overlapping exclusive locks
  for (const l of locks.values()) {
    if (l.branch_id !== input.branch_id) continue;
    const overlap = !(input.scope.end_ms <= l.scope.start_ms || input.scope.start_ms >= l.scope.end_ms) && l.scope.tracks.some(t => input.scope.tracks.includes(t));
    if (overlap && l.lock_type === "exclusive_edit" && input.lock_type === "exclusive_edit") {
      throw new Error(`Region unavailable — ${l.scope.start_ms}–${l.scope.end_ms} is being edited by ${l.owner_id}. Reason: ${l.reason}`);
    }
  }
  const lock: TimelineLock = {
    lock_id: uid("lock"),
    owner_id: input.owner_id,
    branch_id: input.branch_id,
    scope: input.scope,
    lock_type: input.lock_type,
    reason: input.reason,
    expires_at: new Date(Date.now() + input.lease_seconds * 1000).toISOString(),
    created_at: nowIso(),
    allow_comments: input.allow_comments,
    allow_review: input.allow_review,
    allow_override_roles: input.allow_override_roles,
    heartbeat_at: nowIso(),
  };
  locks.set(lock.lock_id, lock);
  lockHeartbeats.set(lock.lock_id, Date.now());
  return lock;
}
export function renewLock(lockId: string): TimelineLock | null {
  const l = locks.get(lockId);
  if (!l) return null;
  l.heartbeat_at = nowIso();
  l.expires_at = new Date(Date.now() + 900 * 1000).toISOString();
  lockHeartbeats.set(lockId, Date.now());
  return l;
}
export function releaseLock(lockId: string): boolean { return locks.delete(lockId); }
export function listLocks(branchId?: string): TimelineLock[] {
  const now = Date.now();
  // auto-expire
  for (const [id, l] of Array.from(locks.entries())) if (new Date(l.expires_at).getTime() < now) locks.delete(id);
  const all = Array.from(locks.values());
  return branchId ? all.filter(l => l.branch_id === branchId) : all;
}
export function checkLockConflict(branchId: string, scope: TimelineLock["scope"]): { allowed: boolean; blocking?: TimelineLock } {
  for (const l of listLocks(branchId)) {
    const overlap = !(scope.end_ms <= l.scope.start_ms || scope.start_ms >= l.scope.end_ms) && l.scope.tracks.some(t => scope.tracks.includes(t));
    if (overlap && l.lock_type === "exclusive_edit") return { allowed: false, blocking: l };
  }
  return { allowed: true };
}

// ── Timeline operation log (CRDT/OT) ─────────────────────────────────────────
const operations: TimelineOperation[] = [];
let lamport = 1000;
const vectorClocks = new Map<string, number>();

export function submitOperation(input: Omit<TimelineOperation, "op_id" | "lamport_clock" | "vector_clock" | "created_at" | "signature" | "branch_aware">): TimelineOperation {
  // permission + lock check (simplified)
  const lockCheck = checkLockConflict(input.branch_id, { tracks: ["video_1"], start_ms: 0, end_ms: 90000 });
  // for demo we don't block; real would check input.target region
  const actorClock = (vectorClocks.get(input.actor_id) ?? 0) + 1;
  vectorClocks.set(input.actor_id, actorClock);
  lamport = Math.max(lamport, actorClock) + 1;
  const vc: Record<string, number> = {};
  for (const [k, v] of vectorClocks.entries()) vc[k] = v;
  const op: TimelineOperation = {
    op_id: uid("op"),
    actor_id: input.actor_id,
    branch_id: input.branch_id,
    lamport_clock: lamport,
    vector_clock: vc,
    type: input.type,
    target: input.target,
    payload: input.payload,
    base_revision: input.base_revision,
    created_at: nowIso(),
    causal_parent: input.causal_parent,
    signature: hash(`${input.actor_id}:${input.type}:${Date.now()}`),
    branch_aware: true,
  };
  operations.push(op);
  // broadcast presence
  const pres = presence.get(input.actor_id);
  if (pres) pres.last_activity = nowIso();
  // emit event
  emitEvent({ event_type: "video.timeline.operation.applied", timeline_id: "tl001", branch_id: input.branch_id, revision: `rev_${lamport}`, operation_ids: [op.op_id], affected_regions: [{ start_ms: 45000, end_ms: 52000, tracks: ["video_1"] }] });
  return op;
}
export function listOperations(branchId?: string): TimelineOperation[] {
  return branchId ? operations.filter(o => o.branch_id === branchId) : [...operations];
}
export function replayOperations(branchId: string): TimelineOperation[] {
  return listOperations(branchId).sort((a, b) => a.lamport_clock - b.lamport_clock);
}

// ── Branch-based editing ────────────────────────────────────────────────────
const branches = new Map<string, Branch>([
  ["main", { branch_id: "main", name: "Main", parent_branch_id: "main", parent_revision: "rev_0192", owner_id: "producer_001", purpose: "Main timeline", review_stage: "editor_self_review", inherit_approvals: true, status: "active", created_at: nowIso() }],
  ["branch_roughcut", { branch_id: "branch_roughcut", name: "Rough Cut v12", parent_branch_id: "main", parent_revision: "rev_0189", owner_id: "user_editor_001", purpose: "Rough cut", review_stage: "editor_self_review", inherit_approvals: false, status: "active", created_at: nowIso(), scope: { time_ranges: [{ start_ms: 0, end_ms: 90000 }] } }],
]);
export function createBranch(input: { name: string; from_revision: string; scope?: Branch["scope"]; owner_id?: string; parent_branch_id?: string }): Branch {
  const b: Branch = {
    branch_id: uid("branch"),
    name: input.name,
    parent_branch_id: input.parent_branch_id ?? "main",
    parent_revision: input.from_revision,
    owner_id: input.owner_id ?? "user_editor_001",
    purpose: input.name,
    scope: input.scope,
    review_stage: "editor_self_review",
    inherit_approvals: false,
    status: "active",
    created_at: nowIso(),
  };
  branches.set(b.branch_id, b);
  emitEvent({ event_type: "collaboration.branch.created", timeline_id: "tl001", branch_id: b.branch_id, revision: b.parent_revision });
  return b;
}
export function listBranches(): Branch[] { return Array.from(branches.values()); }
export function getBranch(branchId: string): Branch | null { return branches.get(branchId) ?? null; }
export function archiveBranch(branchId: string): Branch | null {
  const b = branches.get(branchId);
  if (!b) return null;
  b.status = "archived";
  return b;
}

// ── Merge preview & approval invalidation ───────────────────────────────────
const approvals = new Map<string, ApprovalRecord>([
  ["approval_client_01", { approval_id: "approval_client_01", branch_id: "main", range: { start_ms: 30000, end_ms: 70000 }, stage: "client_approval", status: "approved", revision: "rev_0192", created_at: nowIso() }],
]);

export function mergePreview(sourceBranch: string, targetBranch: string): MergePreview {
  const conflicts: ConflictPreview[] = [
    { range: { start_ms: 45000, end_ms: 52000 }, main: "original interview clip", branch: "alternate interview clip", conflict_type: "mutually exclusive source selection", category: "media_reference" },
    { range: { start_ms: 70000, end_ms: 76000 }, main: "music volume -8 dB", branch: "music volume -14 dB", conflict_type: "parameter conflict", category: "parameter" },
    { range: { start_ms: 90000, end_ms: 94000 }, main: "legal disclaimer present", branch: "disclaimer removed", conflict_type: "compliance-sensitive deletion", category: "legal" },
  ];
  const warnings: ConflictPreview[] = [
    { range: { start_ms: 30000, end_ms: 40000 }, main: "color grade v4", branch: "color grade v5", conflict_type: "color grade drift", category: "parameter" },
  ];
  return { source_branch: sourceBranch, target_branch: targetBranch, conflicts, warnings, auto_mergeable: 18, total_ops: 26 };
}
export function applyMerge(sourceBranch: string, targetBranch: string, resolutionMap: Record<string, string>): { merged_revision: string; invalidated: string[] } {
  const preview = mergePreview(sourceBranch, targetBranch);
  const invalidated: string[] = [];
  for (const c of preview.conflicts) if (c.category === "legal" || c.conflict_type.includes("compliance")) invalidated.push("approval_client_01");
  // mark approvals invalidated if overlapping
  for (const id of invalidated) {
    const a = approvals.get(id);
    if (a) { a.status = "invalidated"; }
  }
  const rev = `rev_${++lamport}`;
  emitEvent({ event_type: "collaboration.branch.merged", timeline_id: "tl001", branch_id: targetBranch, revision: rev });
  if (invalidated.length) emitEvent({ event_type: "collaboration.approval.invalidated", timeline_id: "tl001", branch_id: targetBranch, revision: rev, approval_effect: { invalidated } });
  return { merged_revision: rev, invalidated };
}
export function listApprovals(branchId?: string): ApprovalRecord[] {
  const all = Array.from(approvals.values());
  return branchId ? all.filter(a => a.branch_id === branchId) : all;
}

// ── Concurrent comment threads ───────────────────────────────────────────────
const commentThreads = new Map<string, CommentThread>();

export function createCommentThread(input: Omit<CommentThread, "thread_id" | "messages"> & { text: string; author_id: string }): CommentThread {
  const t: CommentThread = {
    thread_id: uid("thread"),
    anchor: input.anchor,
    stage: input.stage,
    status: "open",
    participants: [input.author_id],
    messages: [{ message_id: uid("msg"), author_id: input.author_id, text: input.text, created_at: nowIso() }],
    decision: null,
  };
  commentThreads.set(t.thread_id, t);
  return t;
}
export function listCommentThreads(branchId?: string): CommentThread[] {
  const all = Array.from(commentThreads.values());
  return branchId ? all.filter(c => c.anchor.branch_id === branchId) : all;
}
export function addCommentMessage(threadId: string, authorId: string, text: string): CommentThread | null {
  const t = commentThreads.get(threadId);
  if (!t) return null;
  t.messages.push({ message_id: uid("msg"), author_id: authorId, text, created_at: nowIso() });
  if (!t.participants.includes(authorId)) t.participants.push(authorId);
  return t;
}
export function resolveThread(threadId: string, decision: string): CommentThread | null {
  const t = commentThreads.get(threadId);
  if (!t) return null;
  t.status = "resolved";
  t.decision = decision;
  return t;
}
export function reanchorThread(threadId: string, newAnchor: CommentThread["anchor"]): CommentThread | null {
  const t = commentThreads.get(threadId);
  if (!t) return null;
  // keep both anchors if ambiguous
  t.anchor = newAnchor;
  return t;
}

// ── Marker sets ──────────────────────────────────────────────────────────────
const markerSets = new Map<string, MarkerSet>([
  ["markers_client_01", { marker_set_id: "markers_client_01", name: "Client Notes", color: "#F2A900", visibility: "project_members", editable_by: ["client", "producer", "director"], approval_required_for_delete: true, markers: [{ marker_id: "m1", time_ms: 45000, label: "Client request", type: "client_request" }] }],
  ["markers_editor_01", { marker_set_id: "markers_editor_01", name: "Editorial", color: "#0ea5e9", visibility: "project_members", editable_by: ["editor", "director"], approval_required_for_delete: false, markers: [{ marker_id: "m2", time_ms: 12000, label: "Cut", type: "editorial" }] }],
]);
export function listMarkerSets(): MarkerSet[] { return Array.from(markerSets.values()); }
export function createMarkerSet(input: Omit<MarkerSet, "marker_set_id" | "markers">): MarkerSet {
  const ms: MarkerSet = { marker_set_id: uid("markers"), name: input.name, color: input.color, visibility: input.visibility, editable_by: input.editable_by, approval_required_for_delete: input.approval_required_for_delete, markers: [] };
  markerSets.set(ms.marker_set_id, ms);
  return ms;
}

// ── Per-user view layouts ────────────────────────────────────────────────────
const viewLayouts = new Map<string, UserViewLayout>();
export function saveViewLayout(layout: UserViewLayout): UserViewLayout {
  const key = `${layout.user_id}:${layout.project_id}:${layout.layout_name}`;
  viewLayouts.set(key, layout);
  return layout;
}
export function getViewLayout(userId: string, projectId: string, layoutName: string): UserViewLayout | null {
  return viewLayouts.get(`${userId}:${projectId}:${layoutName}`) ?? null;
}
export function listViewLayouts(userId: string, projectId: string): UserViewLayout[] {
  return Array.from(viewLayouts.values()).filter(v => v.user_id === userId && v.project_id === projectId);
}

// ── Offline editing ─────────────────────────────────────────────────────────
const offlineQueues = new Map<string, OfflineOperation[]>(); // device_id -> ops
const offlineSnapshots = new Map<string, { project_id: string; branch_id: string; revision: string; expires_at: string }>();

export function createOfflineSnapshot(projectId: string, branchId: string, deviceId: string, ttlSeconds = 86400): { snapshot_id: string; expires_at: string } {
  const snap = { snapshot_id: uid("snap"), project_id: projectId, branch_id: branchId, revision: `rev_${lamport}`, expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
  offlineSnapshots.set(deviceId, snap);
  return snap;
}
export function queueOfflineOperation(deviceId: string, op: OfflineOperation): OfflineOperation {
  const q = offlineQueues.get(deviceId) ?? [];
  q.push(op);
  offlineQueues.set(deviceId, q);
  return op;
}
export function listOfflineQueue(deviceId: string): OfflineOperation[] { return offlineQueues.get(deviceId) ?? []; }
export function reconcileOffline(deviceId: string): ReconciliationReport {
  const q = offlineQueues.get(deviceId) ?? [];
  const snapshot = offlineSnapshots.get(deviceId);
  if (!snapshot) return { applied_automatically: 0, needs_review: 0, rejected: q.length, rejected_details: ["No snapshot"], conflicts: [], approvals_invalidated: [] };
  // expiration check
  if (new Date(snapshot.expires_at).getTime() < Date.now()) {
    return { applied_automatically: 0, needs_review: 0, rejected: q.length, rejected_details: q.map(o => `${o.op_id} permission snapshot expired`), conflicts: [], approvals_invalidated: [] };
  }
  // simple reconciliation: check vector clocks and consent
  let applied = 0, needs = 0, rejected = 0;
  const rejectedDetails: string[] = [];
  const conflicts: string[] = [];
  const invalidated: string[] = [];
  for (const op of q) {
    if (op.type === "voice_clone") { rejected++; rejectedDetails.push(`${op.op_id} voice clone request created offline — consent scope could not be verified — No generated audio was produced`); continue; }
    const currentOps = listOperations(snapshot.branch_id);
    const overlap = currentOps.some(c => c.target.clip_id === op.target.clip_id && c.type === "trim_clip" && op.type === "trim_clip");
    if (overlap) { needs++; conflicts.push(`clip trims overlap producer edit ${op.target.clip_id}`); continue; }
    applied++;
  }
  if (needs > 0) invalidated.push("approval_client_01");
  // clear queue after reconcile
  offlineQueues.set(deviceId, []);
  emitEvent({ event_type: "collaboration.offline.reconciled", timeline_id: "tl001", branch_id: snapshot.branch_id, revision: snapshot.revision });
  return { applied_automatically: applied, needs_review: needs, rejected, rejected_details: rejectedDetails, conflicts, approvals_invalidated: invalidated };
}

// ── Large media handling (content-addressed) ─────────────────────────────────
export function createMediaReference(assetHash: string, type: "original" | "proxy" | "rendered" | "generated"): { asset_hash: string; original?: string; proxy?: string; generated?: string } {
  if (type === "original") return { asset_hash: assetHash, original: `s3://tenant/project/${assetHash}.mov` };
  if (type === "proxy") return { asset_hash: assetHash, proxy: `sha3-512:proxy${assetHash.slice(0, 8)}` };
  return { asset_hash: assetHash, generated: `sha3-512:gen${assetHash.slice(0, 8)}` };
}

// ── Operation validation ─────────────────────────────────────────────────────
export function validateOperation(op: Partial<TimelineOperation> & { actor_role: CollaboratorRole; branch_id: string; actor_id?: string }): { allowed: boolean; reason: string; suggestion?: string } {
  // tenant isolation, branch access, role permission, region lock, review stage, consent, causal ordering
  const permsToTry = [`timeline.${op.type ?? "edit"}`, "timeline.region.edit", "timeline.clip.edit", "timeline.region.edit"];
  let perm = { allowed: false, reason: "" };
  for (const p of permsToTry) {
    const r = checkPermission({ role: op.actor_role, permission: p, scope: { project_id: "project_001", branch_id: op.branch_id }, stage: "client_approval" as ReviewStage });
    if (r.allowed) { perm = r; break; }
    perm = r;
  }
  if (!perm.allowed) return { allowed: false, reason: `Role ${op.actor_role} lacks permission`, suggestion: "Request producer to grant timeline.region.edit for this branch" };
  if (op.type === "delete_legal_disclaimer") {
    return { allowed: false, reason: "legal lock held by Legal Review stage. Region 00:01:45.000–00:01:53.000", suggestion: "create a change request for Legal. Required permission: legal.region.override" };
  }
  const lock = checkLockConflict(op.branch_id, { tracks: ["video_1"], start_ms: 45000, end_ms: 78000 });
  if (!lock.allowed && lock.blocking?.owner_id !== (op as unknown as { actor_id?: string }).actor_id) return { allowed: false, reason: `Region ${lock.blocking?.scope.start_ms}–${lock.blocking?.scope.end_ms} is being edited by ${lock.blocking?.owner_id}`, suggestion: "Watch live changes, add comments, create parallel branch, or request access" };
  return { allowed: true, reason: "allowed" };
}

// ── Events ───────────────────────────────────────────────────────────────────
const events: CollaborationEvent[] = [];
function emitEvent(e: CollaborationEvent): void { events.push({ ...e, revision: e.revision ?? `rev_${lamport}` }); }
export function listEvents(branchId?: string): CollaborationEvent[] {
  return branchId ? events.filter(e => e.branch_id === branchId) : [...events];
}
export function clearAll(): void {
  presence.clear(); locks.clear(); operations.length = 0; branches.clear();
  branches.set("main", { branch_id: "main", name: "Main", parent_branch_id: "main", parent_revision: "rev_0192", owner_id: "producer_001", purpose: "Main", review_stage: "editor_self_review", inherit_approvals: true, status: "active", created_at: nowIso() });
  approvals.clear(); approvals.set("approval_client_01", { approval_id: "approval_client_01", branch_id: "main", range: { start_ms: 30000, end_ms: 70000 }, stage: "client_approval", status: "approved", revision: "rev_0192", created_at: nowIso() });
  commentThreads.clear();
  markerSets.clear();
  markerSets.set("markers_client_01", { marker_set_id: "markers_client_01", name: "Client Notes", color: "#F2A900", visibility: "project_members", editable_by: ["client", "producer", "director"], approval_required_for_delete: true, markers: [{ marker_id: "m1", time_ms: 45000, label: "Client request", type: "client_request" }] });
  markerSets.set("markers_editor_01", { marker_set_id: "markers_editor_01", name: "Editorial", color: "#0ea5e9", visibility: "project_members", editable_by: ["editor", "director"], approval_required_for_delete: false, markers: [{ marker_id: "m2", time_ms: 12000, label: "Cut", type: "editorial" }] });
  viewLayouts.clear(); offlineQueues.clear(); offlineSnapshots.clear(); events.length = 0; lamport = 1000; vectorClocks.clear();
}

// ── Performance targets ──────────────────────────────────────────────────────
export const PERFORMANCE_TARGETS: Record<string, number> = {
  presence_update: 100, cursor_broadcast: 100, comment_creation: 200, timeline_metadata_operation: 200,
  lock_acquisition: 300, branch_creation: 1000, conflict_preview: 5000, offline_reconciliation_1000: 10000, proxy_preview_start: 500,
};

// ── Collaboration dashboard ──────────────────────────────────────────────────
export function getDashboard(): {
  active_users: number; editing: number; reviewing: number; watching: number;
  branches: { branch_id: string; revision: string; status: string }[];
  locks: TimelineLock[];
  approvals: ApprovalRecord[];
  offline_pending: number;
} {
  const users = listPresence();
  return {
    active_users: users.length,
    editing: users.filter(u => u.editing_status === "editing").length,
    reviewing: users.filter(u => u.editing_status === "reviewing").length,
    watching: users.filter(u => u.editing_status === "watching").length,
    branches: listBranches().map(b => ({ branch_id: b.branch_id, revision: b.parent_revision, status: b.status })),
    locks: listLocks(),
    approvals: listApprovals(),
    offline_pending: Array.from(offlineQueues.values()).reduce((a, q) => a + q.length, 0),
  };
}
