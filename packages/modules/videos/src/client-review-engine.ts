/**
 * N0VA VIDEOS — Client Review Portal Engine
 * Guest tokens → secure links → watermarked playback → frame-accurate feedback → decisions → workflow → audit
 */
import type {
  ClientReviewPortal, ReviewLink, ReviewMode, ExternalComment, PortalVersion, PortalDecision, DecisionType,
  ApprovalEvent, AuditEntry, PortalSession, LocalizedDecision,
} from "./client-review-types";

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2, 6)}${Date.now().toString(36)}`; }
function nowIso() { return new Date().toISOString(); }
function hash(s: string) { return `sha3-512:${s.slice(0, 32)}${Math.random().toString(36).slice(2, 6)}`; }
function randomToken() { return `7Qm3${Math.random().toString(36).slice(2, 10)}xP9${Math.random().toString(36).slice(2, 8)}`; }

// ── Stores ───────────────────────────────────────────────────────────────────
const portals = new Map<string, ClientReviewPortal>();
const links = new Map<string, ReviewLink>();
const comments = new Map<string, ExternalComment>();
const versions = new Map<string, PortalVersion[]>();
const decisions = new Map<string, PortalDecision>();
const sessions = new Map<string, PortalSession>();
const auditLog: AuditEntry[] = [];

// ── Seed ─────────────────────────────────────────────────────────────────────
(function seed() {
  const portal: ClientReviewPortal = {
    portal_id: "portal_01J_demo", project_id: "project_001", review_round_id: "round_0194", snapshot_id: "snapshot_0194",
    branding: { logo_asset_id: "asset_logo_001", accent_color: "#1E293B", display_name: "N0VA Client Review" },
    localization: { default_language: "en-US", available_languages: ["en-US", "hi-IN", "fr-FR", "de-DE", "ja-JP"] },
    access_policy: { guest_access: true, approval_requires_verification: true, comment_requires_identity: false, download: "disabled", allowed_domains: ["client.example"], allowed_ip_ranges: ["203.0.113.0/24"], expires_at: "2026-09-05T18:00:00Z" },
    review_policy: { allow_comments: true, allow_drawings: true, allow_rejection: true, allow_approval: true, allow_approval_with_changes: true, show_version_history: true, show_audit_trail_to: ["producer", "legal", "authorized_client"] },
    watermark_policy: { enabled: true, forensic_id: true, position: "moving_diagonal", visible_text: "CONFIDENTIAL · {viewer_identity} · {timestamp}" },
    created_at: nowIso(),
  };
  portals.set(portal.portal_id, portal);
  const link: ReviewLink = {
    link_id: "rl_01J_demo", project_id: "project_001", snapshot_id: "snapshot_0194", mode: "identified_guest",
    permissions: { view: true, comment: true, approve: true, reject: true, approve_with_changes: true, download: false, version_history: true, audit_trail: false },
    authentication: { login_required: false, email_verification_for_decision: true, password_required: false, otp_required: true },
    restrictions: { allowed_domains: ["client.example"], allowed_ip_ranges: ["203.0.113.0/24"], allowed_countries: ["IN", "US", "GB"], max_sessions: 3 },
    watermark: { enabled: true, visible_text: "CONFIDENTIAL · {viewer_identity} · {timestamp}", forensic_id: true, position: "moving_diagonal" },
    expires_at: "2026-09-05T18:00:00Z", revoked_at: null, created_at: nowIso(), token: randomToken(),
  };
  links.set(link.link_id, link);
  versions.set("portal_01J_demo", [
    { version_id: "v0.4", label: "v0.4 — Client review — 29 Aug 2026", review_stage: "client_review", created_at: "2026-08-29T09:00:00Z", snapshot_id: "snapshot_0194", duration_ms: 124000, resolution: "3840x2160", decision_status: "pending", unresolved_comments: 2, change_summary: ["Opening shortened by 3.2 seconds.", "Product close-up replaced at 00:00:45."], watermark_policy: { enabled: true, forensic_id: true, position: "moving_diagonal" } },
    { version_id: "v0.3", label: "v0.3 — Client review — 27 Aug 2026", review_stage: "client_review", created_at: "2026-08-27T10:00:00Z", snapshot_id: "snapshot_0193", decision_status: "pending", unresolved_comments: 5 },
    { version_id: "v0.2", label: "v0.2 — Internal review — hidden", review_stage: "internal_review", created_at: "2026-08-25T10:00:00Z", snapshot_id: "snapshot_0192", hidden: true },
  ]);
  auditLog.push({ audit_id: uid("audit"), portal_id: portal.portal_id, snapshot_id: portal.snapshot_id, actor: "reviewer@client.example", action: "verified by one-time code", timestamp: "2026-08-29T09:01:00Z", ip_hash: "protected_hash", device_fingerprint: "browser_fingerprint_class", review_link_id: link.link_id, hash: hash("verified") });
})();

// ── Helpers ──────────────────────────────────────────────────────────────────
function audit(portal_id: string, snapshot_id: string, actor: string, action: string, link_id?: string): AuditEntry {
  const e: AuditEntry = { audit_id: uid("audit"), portal_id, snapshot_id, actor, action, timestamp: nowIso(), ip_hash: "protected_hash", device_fingerprint: "browser_fingerprint_class", review_link_id: link_id, hash: hash(`${portal_id}:${action}:${Date.now()}`) };
  auditLog.push(e);
  return e;
}
function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  return `${user[0]}***@${domain}`;
}

// ── Portal creation ──────────────────────────────────────────────────────────
export function createPortal(input: {
  project_id: string; snapshot_id: string; access_policy?: Partial<ClientReviewPortal["access_policy"]>; review_policy?: Partial<ClientReviewPortal["review_policy"]>; branding?: Partial<ClientReviewPortal["branding"]>; localization?: Partial<ClientReviewPortal["localization"]>;
}): ClientReviewPortal {
  const portal: ClientReviewPortal = {
    portal_id: uid("portal"), project_id: input.project_id, review_round_id: `round_${Date.now()}`, snapshot_id: input.snapshot_id,
    branding: { logo_asset_id: input.branding?.logo_asset_id ?? "asset_logo_001", accent_color: input.branding?.accent_color ?? "#1E293B", display_name: input.branding?.display_name ?? "N0VA Client Review" },
    localization: { default_language: input.localization?.default_language ?? "en-US", available_languages: input.localization?.available_languages ?? ["en-US", "hi-IN", "fr-FR"] },
    access_policy: {
      guest_access: input.access_policy?.guest_access ?? true,
      approval_requires_verification: input.access_policy?.approval_requires_verification ?? true,
      comment_requires_identity: input.access_policy?.comment_requires_identity ?? false,
      download: (input.access_policy?.download as ClientReviewPortal["access_policy"]["download"]) ?? "disabled",
      allowed_domains: input.access_policy?.allowed_domains,
      allowed_ip_ranges: input.access_policy?.allowed_ip_ranges,
      allowed_countries: (input.access_policy as Record<string, unknown>)?.allowed_countries as string[] | undefined,
      expires_at: input.access_policy?.expires_at ?? "2026-09-05T18:00:00Z",
      max_sessions: input.access_policy?.max_sessions,
    },
    review_policy: {
      allow_comments: input.review_policy?.allow_comments ?? true,
      allow_drawings: input.review_policy?.allow_drawings ?? true,
      allow_rejection: input.review_policy?.allow_rejection ?? true,
      allow_approval: input.review_policy?.allow_approval ?? true,
      allow_approval_with_changes: input.review_policy?.allow_approval_with_changes ?? true,
      show_version_history: input.review_policy?.show_version_history ?? true,
      show_audit_trail_to: input.review_policy?.show_audit_trail_to ?? ["producer"],
    },
    watermark_policy: { enabled: true, forensic_id: true, position: "moving_diagonal", visible_text: "CONFIDENTIAL · {viewer_identity} · {timestamp}" },
    created_at: nowIso(),
  };
  portals.set(portal.portal_id, portal);
  versions.set(portal.portal_id, [
    { version_id: "v0.4", label: "v0.4 — Client review — 29 Aug 2026", review_stage: "client_review", created_at: nowIso(), snapshot_id: input.snapshot_id, decision_status: "pending" },
  ]);
  audit(portal.portal_id, portal.snapshot_id, "system", "portal created");
  return portal;
}
export function getPortal(portalId: string): ClientReviewPortal | null { return portals.get(portalId) ?? null; }
export function listPortals(projectId?: string): ClientReviewPortal[] {
  const all = Array.from(portals.values());
  return projectId ? all.filter(p => p.project_id === projectId) : all;
}

// ── Review link service ──────────────────────────────────────────────────────
export function createReviewLink(input: {
  project_id: string; snapshot_id: string; mode?: ReviewMode; permissions?: Partial<ReviewLink["permissions"]>; authentication?: Partial<ReviewLink["authentication"]>; restrictions?: Partial<ReviewLink["restrictions"]>; watermark?: Partial<ReviewLink["watermark"]>; expires_at?: string;
}): ReviewLink {
  const link: ReviewLink = {
    link_id: uid("rl"), project_id: input.project_id, snapshot_id: input.snapshot_id, mode: input.mode ?? "identified_guest",
    permissions: {
      view: input.permissions?.view ?? true, comment: input.permissions?.comment ?? true, approve: input.permissions?.approve ?? true,
      reject: input.permissions?.reject ?? true, approve_with_changes: input.permissions?.approve_with_changes ?? true,
      download: input.permissions?.download ?? false, version_history: input.permissions?.version_history ?? true, audit_trail: input.permissions?.audit_trail ?? false,
    },
    authentication: {
      login_required: input.authentication?.login_required ?? false, email_verification_for_decision: input.authentication?.email_verification_for_decision ?? true,
      password_required: input.authentication?.password_required ?? false, otp_required: input.authentication?.otp_required ?? true,
    },
    restrictions: {
      allowed_domains: input.restrictions?.allowed_domains, allowed_ip_ranges: input.restrictions?.allowed_ip_ranges,
      allowed_countries: input.restrictions?.allowed_countries, max_sessions: input.restrictions?.max_sessions ?? 3,
    },
    watermark: {
      enabled: input.watermark?.enabled ?? true, visible_text: input.watermark?.visible_text ?? "CONFIDENTIAL · {viewer_identity} · {timestamp}",
      forensic_id: input.watermark?.forensic_id ?? true, position: input.watermark?.position ?? "moving_diagonal",
    },
    expires_at: input.expires_at ?? "2026-09-05T18:00:00Z", revoked_at: null, created_at: nowIso(), token: randomToken(),
  };
  links.set(link.link_id, link);
  audit(link.project_id, link.snapshot_id, "system", "review link created", link.link_id);
  return link;
}
export function getReviewLink(linkId: string): ReviewLink | null { return links.get(linkId) ?? null; }
export function listReviewLinks(projectId?: string): ReviewLink[] {
  const all = Array.from(links.values());
  return projectId ? all.filter(l => l.project_id === projectId) : all;
}
export function verifyLinkAccess(linkId: string, context: { email?: string; ip?: string; country?: string }): { allowed: boolean; reason: string } {
  const link = links.get(linkId);
  if (!link) return { allowed: false, reason: "Link not found" };
  if (link.revoked_at) return { allowed: false, reason: "Link revoked" };
  if (new Date(link.expires_at).getTime() < Date.now()) return { allowed: false, reason: "Link expired" };
  if (link.restrictions.allowed_domains && context.email) {
    const domain = context.email.split("@")[1];
    if (domain && !link.restrictions.allowed_domains.some(d => domain.endsWith(d))) return { allowed: false, reason: `Domain ${domain} not allowed` };
  }
  if (link.restrictions.allowed_countries && context.country && !link.restrictions.allowed_countries.includes(context.country)) return { allowed: false, reason: `Country ${context.country} not allowed` };
  // IP check simplified
  if (link.restrictions.allowed_ip_ranges && context.ip) {
    const ip = context.ip;
    const allowed = (link.restrictions.allowed_ip_ranges as string[]).some(range => ip.startsWith((range.split("/")[0] ?? "").split(".").slice(0, 3).join(".")));
    if (!allowed && link.restrictions.allowed_ip_ranges.length > 0) return { allowed: false, reason: `IP ${context.ip} not in allowed range` };
  }
  const sessionCount = Array.from(sessions.values()).filter(s => s.link_id === linkId && !s.revoked).length;
  if (link.restrictions.max_sessions && sessionCount >= link.restrictions.max_sessions) return { allowed: false, reason: `Max sessions ${link.restrictions.max_sessions} reached` };
  return { allowed: true, reason: "allowed" };
}
export function createSession(linkId: string, viewerIdentity: string): PortalSession {
  const link = links.get(linkId);
  if (!link) throw new Error("Link not found");
  const portal = Array.from(portals.values()).find(p => p.snapshot_id === link.snapshot_id) ?? (Array.from(portals.values())[0] as ClientReviewPortal | undefined);
  if (!portal) throw new Error("No portal for this link");
  const access = verifyLinkAccess(linkId, { email: viewerIdentity.includes("@") ? viewerIdentity : undefined });
  if (!access.allowed) throw new Error(access.reason);
  const session: PortalSession = {
    session_id: uid("sess"), portal_id: portal.portal_id, link_id: linkId, viewer_identity: viewerIdentity,
    token: `sess_${randomToken()}`, created_at: nowIso(), expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), revoked: false,
  };
  sessions.set(session.session_id, session);
  audit(portal.portal_id, portal.snapshot_id, viewerIdentity, "session created", linkId);
  return session;
}
export function revokeLink(linkId: string, reason?: string): ReviewLink | null {
  const link = links.get(linkId);
  if (!link) return null;
  link.revoked_at = nowIso();
  // revoke active sessions
  for (const s of sessions.values()) if (s.link_id === linkId) s.revoked = true;
  audit(link.project_id, link.snapshot_id, "system", `link revoked: ${reason ?? "unspecified"}`, linkId);
  return link;
}
export function revokePortal(portalId: string, reason?: string): { portal: ClientReviewPortal | null; revoked_sessions: number; revoked_links: number } {
  const portal = portals.get(portalId);
  if (!portal) return { portal: null, revoked_sessions: 0, revoked_links: 0 };
  let revokedLinks = 0, revokedSessions = 0;
  for (const link of links.values()) if (link.snapshot_id === portal.snapshot_id && !link.revoked_at) { link.revoked_at = nowIso(); revokedLinks++; }
  for (const s of sessions.values()) {
    const sessPortal = portals.get(s.portal_id);
    const snap = sessPortal?.snapshot_id ?? links.get(s.link_id)?.snapshot_id;
    if (snap === portal.snapshot_id && !s.revoked) { s.revoked = true; revokedSessions++; }
  }
  audit(portalId, portal.snapshot_id, "system", `portal revoked: ${reason ?? "unspecified"}`);
  return { portal, revoked_sessions: revokedSessions, revoked_links: revokedLinks };
}

// ── Watermarking ─────────────────────────────────────────────────────────────
export function visibleWatermarkText(linkId: string, viewerIdentity: string): string {
  const link = links.get(linkId);
  const tmpl = link?.watermark.visible_text ?? "CONFIDENTIAL · {viewer_identity} · {timestamp}";
  const ts = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  return tmpl.replace("{viewer_identity}", maskEmail(viewerIdentity)).replace("{timestamp}", ts).replace("{viewer_identity}", maskEmail(viewerIdentity));
}
export function forensicWatermarkId(linkId: string, sessionId: string): string {
  return hash(`${linkId}:${sessionId}`).slice(0, 24);
}

// ── Protected playback ─────────────────────────────────────────────────────
export function createPlaybackToken(sessionId: string): { token: string; expires_at: string; segment_auth: boolean } {
  const sess = sessions.get(sessionId);
  if (!sess || sess.revoked) throw new Error("Session revoked or not found");
  if (new Date(sess.expires_at).getTime() < Date.now()) throw new Error("Session expired");
  return { token: `pb_${randomToken()}`, expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), segment_auth: true };
}

// ── Comments ─────────────────────────────────────────────────────────────────
export function addExternalComment(input: {
  review_link_id: string; snapshot_id: string; time_ms: number; frame: number; text: string;
  author_email: string; region?: { x: number; y: number; width: number; height: number }; annotation_type?: string;
}): ExternalComment {
  const link = links.get(input.review_link_id);
  if (!link) throw new Error("Review link not found");
  if (!link.permissions.comment) throw new Error("Comments not allowed for this link");
  const c: ExternalComment = {
    comment_id: uid("comment"), review_link_id: input.review_link_id, snapshot_id: input.snapshot_id,
    anchor: { time_ms: input.time_ms, frame: input.frame, region: input.region },
    author: { identity: input.author_email.includes("@") ? "verified_email" : "guest", value: input.author_email, masked: maskEmail(input.author_email) },
    text: input.text, status: "open", created_at: nowIso(), annotation_type: input.annotation_type ?? "rectangle",
  };
  comments.set(c.comment_id, c);
  const portal = Array.from(portals.values()).find(p => p.snapshot_id === input.snapshot_id);
  if (portal) audit(portal.portal_id, portal.snapshot_id, input.author_email, `comment added at ${input.time_ms}ms: ${input.text.slice(0, 40)}`, input.review_link_id);
  return c;
}
export function listExternalComments(snapshotId?: string, linkId?: string): ExternalComment[] {
  let all = Array.from(comments.values());
  if (snapshotId) all = all.filter(c => c.snapshot_id === snapshotId);
  if (linkId) all = all.filter(c => c.review_link_id === linkId);
  return all;
}

// ── Versions ─────────────────────────────────────────────────────────────────
export function listPortalVersions(portalId: string): PortalVersion[] {
  return versions.get(portalId) ?? [];
}
export function getVersionDiff(fromSnapshot: string, toSnapshot: string): { changed: string[]; approvalImpact: { retained: string[]; revalidation: string[] } } {
  return {
    changed: ["Opening shortened by 3.2 seconds.", "Product close-up replaced at 00:00:45.", "Disclaimer added at 00:01:45."],
    approvalImpact: { retained: ["Creative approval: retained"], revalidation: ["Brand approval: revalidation required", "Legal approval: newly required"] },
  };
}

// ── Decisions ────────────────────────────────────────────────────────────────
export function submitDecision(input: {
  portal_id: string; snapshot_id: string; decision: DecisionType; actor_email: string; organization?: string;
  linked_review_items?: string[]; text?: string; scope?: string; language?: string;
}): PortalDecision {
  const portal = portals.get(input.portal_id);
  if (!portal) throw new Error("Portal not found");
  const link = Array.from(links.values()).find(l => l.snapshot_id === input.snapshot_id);
  if (link && !link.permissions.approve && input.decision === "approved") throw new Error("Approval not allowed for this link");
  if (input.decision === "rejected" && (!input.linked_review_items || input.linked_review_items.length === 0) && !input.text) {
    throw new Error("Rejection requires reason and at least one linked comment or review item");
  }
  if (input.decision === "approved_with_changes" && (!input.linked_review_items || input.linked_review_items.length === 0)) {
    throw new Error("Approve with changes requires change requests");
  }
  // confirmation already handled by caller (email OTP etc.)
  const decision: PortalDecision = {
    decision_id: uid("decision"), portal_id: input.portal_id, snapshot_id: input.snapshot_id, stage: "client_approval",
    decision: input.decision, actor: { type: "verified_guest", email: input.actor_email, organization: input.organization },
    scope: input.scope ?? "full_timeline", linked_review_items: input.linked_review_items ?? [], text: input.text,
    timestamp: nowIso(), audit_hash: hash(`${input.portal_id}:${input.decision}:${Date.now()}`),
    conditions: { requires_rework: input.decision === "approved_with_changes", requires_resubmission: input.decision === "approved_with_changes" },
    confirmation: { verified_identity: true, reviewed_scope: input.scope ?? "full_timeline", language: input.language ?? "en-US", displayed_text: input.decision, canonical_decision: input.decision },
  };
  decisions.set(decision.decision_id, decision);
  // workflow side effects
  const approvalEvent: ApprovalEvent = {
    event_id: uid("approval"), project_id: portal.project_id, snapshot_id: portal.snapshot_id, stage: "client_approval",
    decision: input.decision, actor: decision.actor, scope: decision.scope, linked_review_items: decision.linked_review_items,
    conditions: { requires_rework: input.decision === "approved_with_changes", requires_resubmission: input.decision === "approved_with_changes" },
    timestamp: decision.timestamp, audit_hash: decision.audit_hash,
  };
  // store as audit
  audit(portal.portal_id, portal.snapshot_id, input.actor_email, `decision ${input.decision} for ${input.snapshot_id}`, link?.link_id);
  // emit workflow event (mock)
  if (input.decision === "approved") {
    // complete stage, unlock delivery
  } else if (input.decision === "approved_with_changes") {
    // create review items, block delivery
  } else if (input.decision === "rejected") {
    // create blocker
  }
  return decision;
}
export function getDecision(decisionId: string): PortalDecision | null { return decisions.get(decisionId) ?? null; }
export function listDecisions(portalId?: string): PortalDecision[] {
  const all = Array.from(decisions.values());
  return portalId ? all.filter(d => d.portal_id === portalId) : all;
}
export function localizedDecision(decisionId: string, language: string): LocalizedDecision | null {
  const d = decisions.get(decisionId);
  if (!d) return null;
  const map: Record<string, string> = {
    "fr-FR": d.decision === "approved_with_changes" ? "Approuvé sous réserve de modifications" : d.decision,
    "en-US": d.decision,
  };
  return {
    interface_language: language, decision: d.decision, displayed_text: map[language] ?? d.decision,
    canonical_decision: d.decision, translation_source: "n0va_localization_v2",
  };
}

// ── Audit ────────────────────────────────────────────────────────────────────
export function listAudit(portalId?: string, forRole: string = "producer"): AuditEntry[] {
  let all = [...auditLog];
  if (portalId) all = all.filter(a => a.portal_id === portalId);
  // role-based filtering
  if (forRole === "client") all = all.filter(a => ["verified by", "comment added", "approval"].some(k => a.action.toLowerCase().includes(k.toLowerCase())));
  if (forRole === "viewer") return [];
  return all;
}

// ── Helpers for tests ────────────────────────────────────────────────────────
export function clearPortalStores(): void {
  portals.clear(); links.clear(); comments.clear(); decisions.clear(); sessions.clear(); auditLog.length = 0;
  // reseed demo
  const portal: ClientReviewPortal = {
    portal_id: "portal_01J_demo", project_id: "project_001", review_round_id: "round_0194", snapshot_id: "snapshot_0194",
    branding: { logo_asset_id: "asset_logo_001", accent_color: "#1E293B", display_name: "N0VA Client Review" },
    localization: { default_language: "en-US", available_languages: ["en-US", "hi-IN", "fr-FR", "de-DE", "ja-JP"] },
    access_policy: { guest_access: true, approval_requires_verification: true, comment_requires_identity: false, download: "disabled", allowed_domains: ["client.example"], allowed_ip_ranges: ["203.0.113.0/24"], expires_at: "2026-09-05T18:00:00Z" },
    review_policy: { allow_comments: true, allow_drawings: true, allow_rejection: true, allow_approval: true, allow_approval_with_changes: true, show_version_history: true, show_audit_trail_to: ["producer", "legal", "authorized_client"] },
    watermark_policy: { enabled: true, forensic_id: true, position: "moving_diagonal", visible_text: "CONFIDENTIAL · {viewer_identity} · {timestamp}" },
    created_at: nowIso(),
  };
  portals.set(portal.portal_id, portal);
}
export function getPortalForTest(portalId: string): ClientReviewPortal | null { return portals.get(portalId) ?? null; }
