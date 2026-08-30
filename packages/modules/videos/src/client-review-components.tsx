"use client";
import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import {
  createPortal, getPortal, listPortals, createReviewLink, listReviewLinks, verifyLinkAccess, createSession, revokeLink, revokePortal,
  visibleWatermarkText, forensicWatermarkId, createPlaybackToken, addExternalComment, listExternalComments, listPortalVersions, getVersionDiff, submitDecision, localizedDecision, listAudit, listDecisions,
} from "./client-review-engine";
import type { ClientReviewPortal, ReviewLink, ExternalComment, PortalDecision } from "./client-review-types";

export function ClientReviewPortalPanel({ projectId }: { projectId: string }) {
  const [portals, setPortals] = useState<ClientReviewPortal[]>(() => listPortals(projectId));
  const [links, setLinks] = useState<ReviewLink[]>(() => listReviewLinks(projectId));
  const [activePortalId, setActivePortalId] = useState<string>(portals[0]?.portal_id ?? "portal_01J_demo");
  const activePortal = useMemo(() => getPortal(activePortalId) ?? portals[0] ?? null, [activePortalId, portals]);
  const portalVersions = useMemo(() => activePortal ? listPortalVersions(activePortal.portal_id) : [], [activePortal]);
  const comments = useMemo(() => activePortal ? listExternalComments(activePortal.snapshot_id) : [], [portals, links, activePortal]);
  const decisions = useMemo(() => listDecisions(activePortalId), [activePortalId, portals]);
  const audit = useMemo(() => listAudit(activePortalId, "producer"), [activePortalId, portals]);

  const [commentText, setCommentText] = useState("Please use the tighter product angle.");
  const [language, setLanguage] = useState("en-US");
  const [decisionType, setDecisionType] = useState<"approved" | "rejected" | "approved_with_changes">("approved_with_changes");
  const [actorEmail, setActorEmail] = useState("reviewer@client.example");
  const [showConfirm, setShowConfirm] = useState(false);
  const [lastDecision, setLastDecision] = useState<PortalDecision | null>(decisions[0] ?? null);

  const activeLink = links[0] ?? null;

  const handleCreatePortal = () => {
    const p = createPortal({ project_id: projectId, snapshot_id: `snapshot_${Date.now()}`, access_policy: { guest_access: true, approval_requires_verification: true, comment_requires_identity: false, download: false, allowed_domains: ["client.example"], expires_at: "2026-09-05T18:00:00Z" } });
    setPortals([...listPortals(projectId)]);
    setActivePortalId(p.portal_id);
  };
  const handleCreateLink = () => {
    if (!activePortal) return;
    const l = createReviewLink({ project_id: projectId, snapshot_id: activePortal.snapshot_id, mode: "identified_guest" });
    setLinks([...listReviewLinks(projectId)]);
  };
  const handleAddComment = () => {
    if (!activeLink || !activePortal) return;
    addExternalComment({ review_link_id: activeLink.link_id, snapshot_id: activePortal.snapshot_id, time_ms: 45000, frame: 2700, text: commentText, author_email: actorEmail, region: { x: 0.22, y: 0.31, width: 0.42, height: 0.24 }, annotation_type: "rectangle" });
    setPortals([...listPortals(projectId)]); // trigger re-render
  };
  const handleDecision = () => {
    if (!activePortal) return;
    try {
      const d = submitDecision({
        portal_id: activePortal.portal_id, snapshot_id: activePortal.snapshot_id, decision: decisionType, actor_email: actorEmail,
        linked_review_items: decisionType === "approved" ? [] : ["ri_001", "ri_002"],
        text: decisionType === "rejected" ? "This version cannot be approved." : undefined,
        language,
      });
      setLastDecision(d);
      setShowConfirm(false);
    } catch (e: unknown) { alert((e as Error).message); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Governing principle */}
      <div style={{ background: "linear-gradient(135deg,#0f0f12 0%,#1a243a 100%)", color: "#fff", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", opacity: 0.7, fontWeight: 800 }}>CLIENT REVIEW PORTAL — MINIMUM ACCESS · TRACEABLE · LEGALLY MEANINGFUL</div>
        <div style={{ fontSize: 14, fontWeight: 900, marginTop: 4 }}>Secure external surface — snapshot-pinned playback, watermarked, decision-driven workflow</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, fontSize: 11, opacity: 0.9 }}>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Guest token · OTP · domain/IP · expiry → session</span>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Forensic + visible watermark · tokenized media</span>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Approve / Reject / Approve-with-changes → workflow</span>
        </div>
      </div>

      {/* Portal + Link controls */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
        <Card padded>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800 }}>Review Portals</span>
            <Badge tone="primary">{portals.length} portals</Badge>
            <Button size="sm" onClick={handleCreatePortal}>+ Create portal (snapshot_0194)</Button>
            <Button size="sm" variant="secondary" onClick={handleCreateLink} disabled={!activePortal}>+ Review link (identified_guest)</Button>
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {portals.map(p => (
              <button key={p.portal_id} onClick={() => setActivePortalId(p.portal_id)} style={{ padding: "6px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: activePortalId === p.portal_id ? "#0ea5e9" : "var(--nv-color-surface-2)", color: activePortalId === p.portal_id ? "#fff" : "var(--nv-color-text-muted)", border: "1px solid var(--nv-color-border)", cursor: "pointer" }}>
                {p.portal_id.slice(0,12)} · {p.review_policy.show_version_history ? "versions ✓" : ""} {p.access_policy.download === "disabled" ? "· no download" : ""}
              </button>
            ))}
          </div>
          {activePortal && (
            <div style={{ marginTop: 8, background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 11, fontFamily: "var(--nv-font-mono)" }}>
              <div>portal_id {activePortal.portal_id} · snapshot {activePortal.snapshot_id} · round {activePortal.review_round_id}</div>
              <div>guest_access {String(activePortal.access_policy.guest_access)} · download {String(activePortal.access_policy.download ?? "disabled")} · watermark forensic {String(activePortal.watermark_policy.forensic_id)} moving_diagonal</div>
              <div>allowed_domains {(activePortal.access_policy.allowed_domains ?? []).join(", ") || "—"} · allowed_ip {(activePortal.access_policy.allowed_ip_ranges ?? []).join(", ") || "—"} · expires {activePortal.access_policy.expires_at}</div>
            </div>
          )}
          {activeLink && (
            <div style={{ marginTop: 8, fontSize: 11, background: "rgba(16,185,129,0.08)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
              <div style={{ fontWeight: 700 }}>Active review link: {activeLink.link_id}</div>
              <div style={{ fontFamily: "var(--nv-font-mono)", fontSize: 10 }}>https://review.n0va.video/r/{activeLink.token} · mode {activeLink.mode} · view {String(activeLink.permissions.view)} comment {String(activeLink.permissions.comment)} approve {String(activeLink.permissions.approve)} download {String(activeLink.permissions.download)}</div>
              <div>expires {activeLink.expires_at} {activeLink.revoked_at ? `· revoked ${activeLink.revoked_at}` : ""} · watermark: {activeLink.watermark.visible_text}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <Button size="sm" variant="ghost" onClick={() => { const v = verifyLinkAccess(activeLink.link_id, { email: "reviewer@client.example", ip: "203.0.113.42", country: "IN" }); alert(`${v.allowed ? "✓ allowed" : "✗ denied"}: ${v.reason}`); }}>Check access (client.example / 203.0.113.42 / IN)</Button>
                <Button size="sm" variant="ghost" onClick={() => { const v = verifyLinkAccess(activeLink.link_id, { email: "attacker@evil.com", ip: "198.51.100.9", country: "RU" }); alert(`${v.allowed ? "✓ allowed" : "✗ denied"}: ${v.reason}`); }}>Check denied (evil.com / RU)</Button>
                <Button size="sm" variant="ghost" onClick={() => { revokeLink(activeLink.link_id, "suspected_link_sharing"); setLinks([...listReviewLinks(projectId)]); }}>Revoke link</Button>
              </div>
            </div>
          )}
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Protection Layer <Badge tone="primary">watermark · playback</Badge></div>
          {activeLink && (
            <div style={{ marginTop: 8, fontSize: 11 }}>
              <div style={{ background: "#0f0f12", color: "#e2e8f0", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", border: "1px solid #222" }}>
                <div>Visible: {visibleWatermarkText(activeLink.link_id, actorEmail)}</div>
                <div>Forensic: {forensicWatermarkId(activeLink.link_id, "sess_demo")} (per link+session, bound to snapshot hash)</div>
              </div>
              <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                <Button size="sm" variant="ghost" onClick={() => {
                  try {
                    const sess = createSession(activeLink.link_id, actorEmail);
                    const tok = createPlaybackToken(sess.session_id);
                    alert(`Playback token ${tok.token.slice(0,12)}… expires ${tok.expires_at} · segment_auth ${tok.segment_auth}`);
                  } catch (e: unknown) { alert((e as Error).message); }
                }}>Create session + playback token</Button>
                <Button size="sm" variant="ghost" onClick={() => { const r = revokePortal(activePortalId, "snapshot_superseded"); alert(`Revoked ${r.revoked_links} links, ${r.revoked_sessions} sessions — playback shows "This review session has expired or been revoked. Contact the project owner for a new link."`); setLinks([...listReviewLinks(projectId)]); }}>Revoke portal (all sessions)</Button>
              </div>
              <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Short-lived signed token · segment auth · token rotation · no permanent URLs · delivery-edge watermark injection · telemetry · revocation across tabs/mobile/embeddings</div>
            </div>
          )}
        </Card>
      </div>

      {/* Player mock + Workspace */}
      <div style={{ display: "grid", gridTemplateColumns: "1.25fr 0.9fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Client Player — V0.4 Snapshot-Pinned <Badge tone="primary">tokenized · watermarked</Badge></div>
          <div style={{ marginTop: 8, background: "#000", borderRadius: 10, overflow: "hidden", aspectRatio: "16/9", position: "relative", border: "1px solid #222" }}>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700 }}>Q3 Product Launch — Version 0.4 · 00:00:45</div>
            <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(-25deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 240px)" }} />
            <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.65)", color: "#facc15", fontSize: 10, padding: "2px 6px", borderRadius: 999, border: "1px solid rgba(250,204,21,0.35)" }}>
              Confidential · {actorEmail} · Session 8A42 — moving_diagonal
            </div>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 26, background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px", color: "#fff", fontSize: 10 }}>
              <span>▶ ⏸ ⏮ frame step  timecode  speed  loop  captions  audio desc  compare  quality  fullscreen</span>
              <span>00:00:45 / 00:02:04 · 60fps · adaptive bitrate · encrypted segments</span>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["00:00:45 ● 2 comments", "00:01:45 ● Legal disclosure", "00:02:10 ● Caption correction"].map(t => <span key={t} style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", padding: "4px 8px", borderRadius: 999 }}>{t}</span>)}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Time-coded comment at 00:00:45" className="nv-input" style={{ flex: 1, fontSize: 12 }} />
            <Button size="sm" onClick={handleAddComment}>Add comment @ 00:00:45 frame 2700 rectangle</Button>
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--nv-color-text-faint)" }}>Annotation: text · pin · rectangle · arrow · highlight · transcript selection · audio note · reply · mention · resolved · decision-critical — attached to snapshot + region</div>
          <div style={{ marginTop: 8, fontSize: 11 }}>
            <div style={{ fontWeight: 700 }}>Comments ({comments.length})</div>
            <div style={{ maxHeight: 140, overflow: "auto", border: "1px solid var(--nv-color-border)", borderRadius: 8, marginTop: 4 }}>
              {comments.slice(0, 8).map(c => (
                <div key={c.comment_id} style={{ padding: "6px 8px", borderBottom: "1px solid var(--nv-color-border)", fontSize: 11 }}>
                  <div style={{ display: "flex", gap: 6 }}><Badge tone="neutral">{c.anchor.time_ms}ms f{c.anchor.frame}</Badge><span>{c.author.masked ?? c.author.value}</span><Badge tone="primary">{c.status}</Badge></div>
                  <div style={{ color: "var(--nv-color-text-muted)" }}>{c.text}</div>
                  {c.anchor.region && <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>region {c.anchor.region.x.toFixed(2)},{c.anchor.region.y.toFixed(2)} {c.anchor.region.width.toFixed(2)}×{c.anchor.region.height.toFixed(2)} · Rectangle around the product package in the lower-right quadrant.</div>}
                </div>
              ))}
              {comments.length === 0 && <div style={{ padding: 8, color: "var(--nv-color-text-muted)", fontSize: 11 }}>No comments — add one above (spec: Please use the tighter product angle. at 45000ms frame 2700)</div>}
            </div>
          </div>
        </Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card padded>
            <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Version History <Badge tone="neutral">{portalVersions.length} labels</Badge></div>
            {portalVersions.map(v => (
              <div key={v.version_id} style={{ marginTop: 6, background: v.hidden ? "rgba(0,0,0,0.04)" : "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 11, opacity: v.hidden ? 0.55 : 1 }}>
                <div style={{ fontWeight: 700, display: "flex", gap: 6 }}>{v.label} {v.decision_status && <Badge tone={v.decision_status === "approved" ? "success" : "neutral"}>{v.decision_status}</Badge>} {v.hidden && <Badge tone="neutral">hidden</Badge>}</div>
                <div style={{ color: "var(--nv-color-text-muted)" }}>{v.review_stage} · {v.duration_ms ? `${(v.duration_ms/1000).toFixed(1)}s` : ""} {v.resolution ?? ""}</div>
                {v.change_summary && <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>{v.change_summary.join(" • ")}</div>}
              </div>
            ))}
            <div style={{ marginTop: 8, background: "#0f0f12", color: "#a5b4fc", borderRadius: 8, padding: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222" }}>
              <div>Comparison: v0.3 → v0.4</div>
              <div>Changed:</div>
              <div>- Opening shortened by 3.2s.</div>
              <div>- Product close-up replaced at 00:00:45.</div>
              <div>- Disclaimer added at 00:01:45.</div>
              <div>Approval impact: Creative retained · Brand revalidation · Legal newly required</div>
              <div style={{ marginTop: 4 }}><Button size="sm" variant="ghost" onClick={() => {
                const diff = getVersionDiff("snapshot_0193", "snapshot_0194");
                alert(diff.changed.join(" | ") + " // " + diff.approvalImpact.revalidation.join(" | "));
              }}>Show diff (spec)</Button></div>
            </div>
          </Card>
          <Card padded>
            <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Decision Panel <Badge tone={lastDecision ? (lastDecision.decision === "approved" ? "success" : lastDecision.decision === "rejected" ? "warning" : "primary") : "neutral"}>{lastDecision?.decision ?? "no decision yet"}</Badge></div>
            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <select value={decisionType} onChange={e => setDecisionType(e.target.value as never)} className="nv-input" style={{ flex: 1, minWidth: 180 }}>
                <option value="approved">Approve — I approve Version 0.4 for the stated review scope.</option>
                <option value="rejected">Reject — cannot accept, requires reason + linked comment</option>
                <option value="approved_with_changes">Approve with changes — subject to listed modifications</option>
              </select>
            </div>
            <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
              <input value={actorEmail} onChange={e => setActorEmail(e.target.value)} placeholder="reviewer@client.example" className="nv-input" style={{ flex: 1 }} />
              <select value={language} onChange={e => setLanguage(e.target.value)} className="nv-input">
                <option value="en-US">en-US</option><option value="fr-FR">fr-FR</option><option value="hi-IN">hi-IN</option><option value="de-DE">de-DE</option>
              </select>
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
              <Button size="sm" variant="secondary" onClick={() => setShowConfirm(true)}>{decisionType === "approved" ? "Approve version" : decisionType === "rejected" ? "Reject version" : "Submit approval with changes"}</Button>
              <Badge tone="neutral">Requires verified identity (OTP) for decision — streaming anonymous, approval named</Badge>
            </div>
            {showConfirm && (
              <div style={{ marginTop: 8, background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 11 }}>
                <div style={{ fontWeight: 800 }}>Confirm approval</div>
                <div>You are approving: Project Q3 Product Launch · Version 0.4 · Stage Client Approval · Scope Full timeline · Reviewer verified {actorEmail}</div>
                <div>This action will notify production and advance the workflow. Metadata retained per legal hold.</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}><Button size="sm" variant="ghost" onClick={() => setShowConfirm(false)}>Cancel</Button><Button size="sm" onClick={handleDecision}>Confirm approval</Button></div>
                <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 4 }}>Decision auto-converts: approved → unlock delivery + certificate; approved_with_changes → review items + block delivery; rejected → blocker + reopen stage (idempotent).</div>
              </div>
            )}
            {lastDecision && (
              <div style={{ marginTop: 8, background: "rgba(16,185,129,0.08)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 11 }}>
                <div style={{ fontWeight: 700 }}>Decision recorded — Audit APR-0194-7F2C</div>
                <div>{lastDecision.decision} by {lastDecision.actor.email} at {lastDecision.timestamp} · scope {lastDecision.scope} · hash {lastDecision.audit_hash.slice(0,24)}…</div>
                <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>Linked items: {(lastDecision.linked_review_items ?? []).join(", ") || "—"} · conditions {JSON.stringify(lastDecision.conditions ?? {})}</div>
                <div style={{ marginTop: 4 }}><Button size="sm" variant="ghost" onClick={() => {
                  const l = localizedDecision(lastDecision.decision_id, "fr-FR");
                  if (l) alert(`${l.interface_language}: ${l.displayed_text} (canonical ${l.canonical_decision}) via ${l.translation_source}`);
                }}>Show localized (fr-FR: Approuvé…)</Button></div>
              </div>
            )}
            <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>This version cannot be approved without reason + linked comment. Approve-with-changes keeps delivery blocked and routes to editor.</div>
          </Card>
        </div>
      </div>

      {/* Audit */}
      <Card padded>
        <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Review Audit — role-based <Badge tone="primary">producer full · client own · legal full-sensitive · viewer none</Badge><span style={{ marginLeft: "auto", fontSize: 10, color: "var(--nv-color-text-faint)" }}>IP masked · snapshot hash · version · audit_hash + timestamp</span></div>
        <div style={{ marginTop: 8, border: "1px solid var(--nv-color-border)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 160px", gap: 0, background: "var(--nv-color-surface-2)", padding: "6px 10px", fontSize: 11, fontWeight: 800, color: "var(--nv-color-text-faint)" }}>
            <span>Time · Actor</span><span>Action</span><span>Context · Hash</span>
          </div>
          {audit.slice(0, 10).map(a => (
            <div key={a.audit_id} style={{ display: "grid", gridTemplateColumns: "160px 1fr 160px", gap: 8, padding: "8px 10px", borderTop: "1px solid var(--nv-color-border)", fontSize: 11 }}>
              <span><Badge tone="neutral">{a.timestamp.slice(11,16)}</Badge> {a.actor.slice(0,14)}<div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>{a.action.startsWith("verified") ? "OTP verified" : ""}</div></span>
              <span style={{ color: "var(--nv-color-text-muted)" }}>{a.action} — IP: {a.ip_hash ?? "protected hash"} · device {a.device_fingerprint ?? "browser_fingerprint_class"}</span>
              <span style={{ fontFamily: "var(--nv-font-mono)", fontSize: 10 }}>{a.hash.slice(0,12)}… · {a.snapshot_id.slice(0,8)}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Accessible: semantic structure · keyboard-only · visible focus · screen-reader announcements “Comment added at 00:00:45. Please use the tighter product angle.” · drawing text alternative: Rectangle around product package in lower-right quadrant.</div>
      </Card>

      {/* Client experience */}
      <Card padded>
        <div style={{ fontWeight: 800 }}>Client Experience — Q3 Product Launch · Client Review — Version 0.4</div>
        <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, fontSize: 11 }}>
          <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>● 7 changes completed<div style={{ fontSize: 10, color: "var(--nv-color-text-muted)" }}>Opening, close-up, disclaimer, captions</div></div>
          <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>● 2 comments unresolved<div style={{ fontSize: 10, color: "var(--nv-color-text-muted)" }}>Awaiting producer confirmation</div></div>
          <div style={{ background: "rgba(14,165,233,0.08)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>● 1 change awaiting your confirmation<div style={{ fontSize: 10, color: "var(--nv-color-text-muted)" }}>Music under dialogue 00:01:10-00:01:26</div></div>
        </div>
        <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Access restricted: expires 5 Sept 2026 · allows comments+approval · no download · restricted to client.example · watermark visible · Multi-language interface separates player language from interface (decision preserves displayed text + canonical interpretation).</div>
      </Card>
    </div>
  );
}
