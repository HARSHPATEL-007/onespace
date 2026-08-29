#!/usr/bin/env node
import {
  checkPermission, updatePresence, listPresence, acquireLock, listLocks, submitOperation, listOperations,
  createBranch, listBranches, mergePreview, applyMerge, listApprovals, createCommentThread, listCommentThreads,
  listMarkerSets, getDashboard, createOfflineSnapshot, queueOfflineOperation, reconcileOffline, validateOperation, clearAll,
} from "./src/collaboration-engine.ts";

function assert(c,m){ if(!c){ console.error("FAIL",m); process.exit(1);} else console.log("PASS",m); }
console.log("=== Collaboration Fabric Smoke ===");
clearAll();

// RBAC
let perm = checkPermission({ role: "editor", permission: "timeline.region.edit", scope: { project_id: "project_001", branch_id: "branch_roughcut" } });
assert(perm.allowed, "editor can edit timeline.region.edit");
let denied = checkPermission({ role: "viewer", permission: "timeline.region.edit", scope: { project_id: "project_001" } });
assert(!denied.allowed, "viewer denied edit");
console.log(`RBAC editor allowed, viewer denied: ${denied.reason}`);

// Stage-aware
let stageBlock = checkPermission({ role: "editor", permission: "timeline.region.edit", scope: { project_id: "project_001" }, stage: "client_approval" });
console.log(`Stage client_approval for editor: ${stageBlock.reason}`);

// Presence
updatePresence({ user_id: "user_editor_001", display_name: "Arjun", role: "editor", branch_id: "branch_roughcut", timeline_position_ms: 84200, selected_clip: "clip_004", active_tool: "trim", editing_status: "editing", last_activity: new Date().toISOString(), voice_chat: false, screen_sharing: false });
updatePresence({ user_id: "user_legal_001", display_name: "Maya", role: "legal", branch_id: "branch_roughcut", timeline_position_ms: 48000, editing_status: "reviewing", last_activity: new Date().toISOString(), voice_chat: false, screen_sharing: false });
updatePresence({ user_id: "user_client_001", display_name: "Elena", role: "client", branch_id: "branch_roughcut", timeline_position_ms: 0, editing_status: "watching", last_activity: new Date().toISOString(), voice_chat: false, screen_sharing: false });
let pres = listPresence();
assert(pres.length===3, `presence 3 got ${pres.length}`);
console.log(`Presence: ${pres.map(p=>`${p.display_name} ${p.editing_status} ${p.timeline_position_ms}`).join(" | ")}`);

// Locks - region level
let lock = acquireLock({ owner_id: "user_editor_001", branch_id: "branch_roughcut", scope: { tracks: ["video_1","audio_dialogue"], start_ms: 45000, end_ms: 78000 }, lock_type: "exclusive_edit", reason: "Dialogue restructuring", lease_seconds: 900, allow_comments: true, allow_review: true, allow_override_roles: ["director","producer"] });
assert(lock.lock_id.startsWith("lock_"), "lock acquired");
assert(listLocks("branch_roughcut").length===1, "list locks 1");
console.log(`Lock ${lock.lock_id.slice(0,8)} 45-78s exclusive_edit`);

// Lock conflict
try {
  acquireLock({ owner_id: "user_editor_002", branch_id: "branch_roughcut", scope: { tracks: ["video_1"], start_ms: 50000, end_ms: 60000 }, lock_type: "exclusive_edit", reason: "Overlap", lease_seconds: 900, allow_comments: true, allow_review: true, allow_override_roles: [] });
  console.error("FAIL lock conflict should throw");
  process.exit(1);
} catch (e) {
  console.log(`PASS lock conflict blocked: ${String(e).slice(0,60)}`);
}

// Operations - CRDT/OT metadata + immutable media
let op1 = submitOperation({ actor_id: "user_editor_001", branch_id: "branch_roughcut", type: "trim_clip", target: { clip_id: "clip_004" }, payload: { source_out_ms: 22400 }, base_revision: "rev_0189" });
assert(op1.lamport_clock>1000 && op1.vector_clock["user_editor_001"]===1, "op lamport/vector");
let op2 = submitOperation({ actor_id: "user_director_001", branch_id: "branch_roughcut", type: "edit_title", target: { clip_id: "title_01" }, payload: { text: "New Title" }, base_revision: "rev_0190" });
assert(listOperations("branch_roughcut").length===2, "operations 2");
console.log(`Operations ${op1.op_id.slice(0,8)} lamport ${op1.lamport_clock} vc ${JSON.stringify(op1.vector_clock)}`);

// Branch-based editing
let branch = createBranch({ name: "Client alternate opening", from_revision: "rev_0192", scope: { time_ranges: [{ start_ms: 0, end_ms: 30000 }] }, owner_id: "producer_001" });
assert(branch.branch_id.startsWith("branch_"), "branch created");
assert(branch.parent_revision==="rev_0192", "branch parent rev");
assert(listBranches().length>=2, "branches >=2");
console.log(`Branch ${branch.branch_id.slice(0,8)} ${branch.name} scope 0-30s`);

// Merge preview - conflicts
let preview = mergePreview("branch_client_alt_03", "main");
assert(preview.conflicts.length===3, "merge conflicts 3");
assert(preview.auto_mergeable===18, "auto-mergeable 18");
console.log(`Merge preview conflicts ${preview.conflicts.length} auto ${preview.auto_mergeable} category ${preview.conflicts[0].category}`);

// Apply merge - approval invalidation
let beforeApprovals = listApprovals("main").filter(a=>a.status==="approved").length;
let merged = applyMerge("branch_client_alt_03", "main", { conflict_001: "keep_source" });
assert(merged.merged_revision.startsWith("rev_"), "merged revision");
let afterInvalidated = listApprovals("main").filter(a=>a.status==="invalidated").length;
console.log(`Merge ${merged.merged_revision} invalidated ${merged.invalidated.length} approvals`);

// Comments - anchored, branch-aware
let thread = createCommentThread({ anchor: { branch_id: "branch_main", timeline_ms: 45000, frame: 2700, region: { x: 0.2, y: 0.3, width: 0.4, height: 0.25 } }, stage: "creative_review", text: "Please use alternate product angle.", author_id: "user_client_001" });
assert(thread.thread_id.startsWith("thread_"), "comment thread");
assert(thread.anchor.timeline_ms===45000, "anchor timeline_ms");
console.log(`Comment thread ${thread.thread_id.slice(0,8)} anchor ${thread.anchor.timeline_ms}`);

// Marker sets
let markers = listMarkerSets();
assert(markers.length>=2, "marker sets >=2");
console.log(`Markers ${markers.map(m=>m.name).join(", ")}`);

// View layouts - per-user
let dash = getDashboard();
assert(dash.active_users>=3, "dashboard active users");
assert(dash.branches.length>=2, "dashboard branches");
console.log(`Dashboard active ${dash.active_users} editing ${dash.editing} branches ${dash.branches.length} locks ${dash.locks.length}`);

// Offline
let snap = createOfflineSnapshot("project_001", "branch_roughcut", "device_001", 86400);
assert(snap.snapshot_id.startsWith("snap_"), "offline snapshot");
queueOfflineOperation("device_001", { device_id: "device_001", local_branch: "branch_roughcut", local_revision: "rev_0190", operation_hash: "hash:op1", parent_vector_clock: {}, op_id: "op_offline_1", actor_id: "user_editor_001", branch_id: "branch_roughcut", lamport_clock: 1900, vector_clock: {}, type: "trim_clip", target: { clip_id: "clip_004" }, payload: {}, base_revision: "rev_0190", created_at: new Date().toISOString(), signature: "sig", branch_aware: true });
// queue a voice clone that should be rejected offline
queueOfflineOperation("device_001", { device_id: "device_001", local_branch: "branch_roughcut", local_revision: "rev_0190", operation_hash: "hash:voice", parent_vector_clock: {}, op_id: "op_voice_offline", actor_id: "user_editor_001", branch_id: "branch_roughcut", lamport_clock: 1901, vector_clock: {}, type: "voice_clone", target: { clip_id: "clip_voice" }, payload: {}, base_revision: "rev_0190", created_at: new Date().toISOString(), signature: "sig", branch_aware: true });
let recon = reconcileOffline("device_001");
assert(recon.rejected===1 && recon.rejected_details?.[0].includes("voice clone"), "offline voice clone rejected");
console.log(`Offline reconcile applied ${recon.applied_automatically} needs ${recon.needs_review} rejected ${recon.rejected}`);

// Operation validation
let valid = validateOperation({ actor_role: "editor", actor_id: "user_editor_001", branch_id: "branch_roughcut", type: "trim_clip" });
assert(valid.allowed, "validate trim allowed");
let invalid = validateOperation({ actor_role: "editor", branch_id: "branch_roughcut", type: "delete_legal_disclaimer" });
assert(!invalid.allowed && invalid.reason.includes("legal lock"), "validate legal lock blocked");
console.log(`Validate trim ${valid.reason} | delete legal ${invalid.reason.slice(0,50)}`);

console.log("\nAll collaboration smoke checks passed.");
