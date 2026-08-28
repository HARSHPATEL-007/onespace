"use client";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import {
  seedDemoGraph, getAsset, listNodes, getNode, createNodeVersion,
  getGraphVersion, listGraphVersions, disableNodeInGraph, reorderGraphNodes, replaceNodeInGraph,
  compareGraphVersions, createTimelineProjection, cacheKeyFor, cacheGet,
  invalidateDownstream, declareReproducibility, estimateCost, scheduleForOutput, explainFrameAtTime,
  diagnosticsForNode, traceForArtifact, bindApproval, rollbackToVersion, manifestForNode, c2paManifestForExport,
  enforceGuardrails,
} from "./graph-engine";
import type { GraphNode } from "./graph-types";

function msLabel(ms: number) { const s = Math.floor(ms/1000); return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}:${String(ms%1000).padStart(3,"0")}`; }

export function GraphPanel({ projectId, timelineId }: { projectId: string; timelineId: string }) {
  const [graphId, setGraphId] = useState("graph_01J_demo");
  const [logs, setLogs] = useState<string[]>([]);
  const [seed, setSeed] = useState<ReturnType<typeof seedDemoGraph> | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [explain, setExplain] = useState<ReturnType<typeof explainFrameAtTime> | null>(null);
  const [schedule, setSchedule] = useState<ReturnType<typeof scheduleForOutput> | null>(null);
  const [compare, setCompare] = useState<ReturnType<typeof compareGraphVersions> | null>(null);

  useEffect(() => {
    const s = seedDemoGraph(graphId);
    setSeed(s);
    setLogs(l => [...l, `Seeded graph ${s.graph_id} with ${s.versions.length} versions, ${s.nodes.length} nodes`]);
  }, [graphId]);

  const versions = useMemo(() => listGraphVersions(graphId), [seed, graphId, logs.length]);
  const nodes = useMemo(() => listNodes(), [seed, logs.length]);
  const asset = useMemo(() => getAsset("asset_camera_a001"), [seed]);

  const selected = selectedNode ? getNode(selectedNode) : null;

  const handleDisable = () => {
    if (!versions[0] || !nodes[1]) return;
    const base = versions[0]!;
    const target = nodes.find(n => n.operation === "denoise") ?? nodes[1]!;
    try {
      const v = disableNodeInGraph(graphId, base.graph_version, target.node_id, "Preserve natural film grain");
      setLogs(l => [...l, `Disable ${target.operation} ${target.node_id.slice(0,8)} → new ${v.graph_version} (immutable, old remains)`]);
    } catch (e) { setLogs(l => [...l, `Disable failed: ${String(e)}`]); }
  };
  const handleReorder = () => {
    if (!versions[0] || nodes.length < 3) return;
    const base = versions[0]!;
    const order = [...base.nodes];
    // swap denoise → color if possible
    const iD = order.findIndex(id => getNode(id)?.operation === "denoise");
    const iC = order.findIndex(id => getNode(id)?.operation === "color_grade");
    if (iD >=0 && iC >=0 && order[iD] && order[iC]) {
      const tmp = order[iD]!; order[iD] = order[iC]!; order[iC] = tmp;
      try {
        const r = reorderGraphNodes(graphId, base.graph_version, order);
        setLogs(l => [...l, `Reorder ${r.version.graph_version} ${r.warning ? `⚠ ${r.warning}` : "ok"}`]);
      } catch (e) { setLogs(l => [...l, `Reorder failed: ${String(e)}`]); }
    }
  };
  const handleReplace = () => {
    const old = nodes.find(n => n.operation === "color_grade");
    if (!old || !versions[0]) return;
    try {
      const upgraded = createNodeVersion(old.node_id, { exposure: 0.14 }, "Client wants warmer grade — new version, old remains for comparison/rollback");
      const r = replaceNodeInGraph(graphId, versions[0]!.graph_version, old.node_id, upgraded.node_id, "n0va.voice.cleanup.v2→v3");
      setLogs(l => [...l, `Replace ${old.node_id.slice(0,8)}→${upgraded.node_id.slice(0,8)} before ${old.node_hash.slice(0,12)} after ${r.after_hash.slice(0,12)} → ${r.version.graph_version}`]);
    } catch (e) { setLogs(l => [...l, `Replace failed: ${String(e)}`]); }
  };
  const handleCompare = () => {
    if (versions.length < 2) return;
    const c = compareGraphVersions(graphId, versions[0]!.graph_version, versions[1]!.graph_version);
    setCompare(c);
    setLogs(l => [...l, `Compare ${c.a.graph_version} vs ${c.b.graph_version}: +${c.diff.added.length} -${c.diff.removed.length} reordered=${c.diff.reordered}`]);
  };
  const handleExplain = () => {
    if (!versions[0]) return;
    const e = explainFrameAtTime(62400, graphId, versions[0]!.graph_version);
    setExplain(e);
    setLogs(l => [...l, `Explain ${e.frame_label}: ${e.active_path.length} active nodes, cache ${e.current_state}`]);
  };
  const handleSchedule = () => {
    if (!versions[0]) return;
    const target = versions[0]!.active_outputs[0]!;
    const s = scheduleForOutput(graphId, versions[0]!.graph_version, target);
    setSchedule(s);
    setLogs(l => [...l, `Schedule for ${target.slice(0,8)}: ${s.ordered_nodes.length} nodes, ${s.parallel_groups.length} parallel groups, $${s.estimated_total_cost_usd}`]);
  };
  const handleRollback = () => {
    if (versions.length < 2) return;
    const head = versions[versions.length -1]!;
    const target = versions[0]!;
    try {
      const v = rollbackToVersion(graphId, head.graph_version, target.graph_version, "Client rejected alternate voice");
      setLogs(l => [...l, `Rollback ${head.graph_version}→${target.graph_version} new head ${v.graph_version} (preserves newer)`]);
    } catch (e) { setLogs(l => [...l, `Rollback failed: ${String(e)}`]); }
  };
  const handleCacheInvalidate = () => {
    if (!nodes[0]) return;
    const n = nodes[0]!;
    const before = invalidateDownstream(graphId, versions[0]?.graph_version ?? "gv_42", n.node_id);
    setLogs(l => [...l, `Invalidate ${n.operation} downstream: ${before.length ? before.join(",") : "none (leaf)"}`]);
  };

  if (!seed) return <Card padded>Seeding graph…</Card>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header — CORE ARCHITECTURE */}
      <div style={{ background: "linear-gradient(135deg,#0f0f12 0%,#1a1f3a 100%)", color: "#fff", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", opacity: 0.7, fontWeight: 800 }}>NON-DESTRUCTIVE AI EDITING GRAPH — DAG RENDER FABRIC</div>
        <div style={{ fontSize: 16, fontWeight: 900, marginTop: 4 }}>Immutable source → parameterized nodes → cached artifacts → graph versions → signed export</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, fontSize: 11, opacity: 0.85 }}>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Nodes never overwrite inputs — new content-addressed output</span>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Graph version = ordered state of reusable nodes</span>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Timeline is projection, not mutable storage</span>
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Badge tone="primary">{graphId}</Badge>
          <Badge tone="success">{versions.length} versions</Badge>
          <Badge tone="neutral">{nodes.length} nodes</Badge>
          <Badge tone="neutral">{asset?.asset_id ?? "asset_camera_a001"} immutable</Badge>
        </div>
      </div>

      {/* Chain visualization */}
      <Card padded>
        <div style={{ fontWeight: 800, display: "flex", gap: 8, alignItems: "center" }}>Core Architecture <Badge tone="primary">DAG</Badge><span style={{ marginLeft: "auto", fontSize: 11, color: "var(--nv-color-text-faint)" }}>Source → Normalization → Semantic → Editorial → AI Enhance → Composite → Audio Mix → Caption → Color/Delivery → Signed Export</span></div>
        <div style={{ marginTop: 10, background: "#0f0f12", borderRadius: 10, padding: 12, border: "1px solid #222", overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 900 }}>
            {(versions[0]?.nodes ?? []).map((nid, i) => {
              const n = getNode(nid);
              if (!n) return null;
              const col = n.category === "structural" ? "#818cf8" : n.category === "visual_ai" ? "#ec4899" : n.category === "audio_ai" ? "#10b981" : n.category === "semantic" ? "#f59e0b" : "#38bdf8";
              return (
                <div key={nid} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div onClick={() => setSelectedNode(nid)} style={{ cursor: "pointer", background: selectedNode === nid ? col : "#1a1a1f", color: selectedNode === nid ? "#fff" : col, border: `1px solid ${col}`, borderRadius: 10, padding: "8px 10px", minWidth: 120, textAlign: "center" }}>
                    <div style={{ fontSize: 11, fontWeight: 800 }}>{n.operation}</div>
                    <div style={{ fontSize: 10, opacity: 0.8 }}>{n.category}</div>
                    <div style={{ fontSize: 9, fontFamily: "var(--nv-font-mono)", opacity: 0.6 }}>{nid.slice(0, 8)}</div>
                  </div>
                  {i < (versions[0]?.nodes.length ?? 0) - 1 && <span style={{ color: "#666" }}>→</span>}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "#a5b4fc" }}>Source branching: <code>denoise_v2</code> → <code>color_grade v4/v5</code> & <code>social_grade</code> → <code>approved_master</code> & <code>client_review_branch</code> — all content-addressed, unchanged subgraphs reusable</div>
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Button size="sm" onClick={handleDisable}>Disable node</Button>
          <Button size="sm" variant="secondary" onClick={handleReorder}>Reorder (non-commutative warn)</Button>
          <Button size="sm" variant="secondary" onClick={handleReplace}>Replace model v2→v3</Button>
          <Button size="sm" variant="ghost" onClick={handleCompare}>Compare gv_A vs gv_B</Button>
          <Button size="sm" variant="ghost" onClick={handleRollback}>Rollback to gv_42</Button>
        </div>
      </Card>

      {/* Node inspector */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Node Contract <Badge tone="primary">canonical hash</Badge><span style={{ marginLeft: "auto", fontSize: 11, color: "var(--nv-color-text-faint)" }}>face replacement example</span></div>
          {selected ? (
            <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.6 }}>
              <div style={{ fontFamily: "var(--nv-font-mono)", fontSize: 11, background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, border: "1px solid #222" }}>
                <div><strong>{selected.node_id}</strong> — {selected.node_type} / {selected.operation} [{selected.category}]</div>
                <div>schema {selected.schema_version} • state {selected.state} • determinism {selected.determinism_policy.mode}</div>
                <div>hash {selected.node_hash.slice(0, 24)}…</div>
                <div>inputs {selected.inputs.map(i => `${i.port}:${i.artifact_id.slice(0,8)}`).join(", ")}</div>
                <div>params {JSON.stringify(selected.parameters).slice(0, 120)}</div>
                <div>model {selected.execution.model_id} {selected.execution.model_version} digest {selected.execution.model_digest.slice(0,16)}…</div>
                <div>runtime {selected.execution.runtime_digest.slice(0,20)}… seed {selected.execution.seed} {selected.execution.precision} {selected.execution.hardware_class}</div>
                <div>scope {selected.scope ? JSON.stringify(selected.scope).slice(0,90) : "global (entire asset)"} — part of hash</div>
                <div>consent {selected.consent_refs?.join(",") ?? "none"} • operator {selected.attribution.operator_id} agent {selected.attribution.agent_id}</div>
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Badge tone={selected.state === "enabled" ? "success" : "warning"}>{selected.state}</Badge>
                <Badge tone="neutral">{selected.determinism_policy.mode}</Badge>
                <Badge tone="neutral">{selected.execution.precision}</Badge>
                <span style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>Hash = canonical(node type, operation, schema, input hashes, params, prompt_ref, model/runtime digest, seed, policy, consent, attribution, scope)</span>
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                <Button size="sm" onClick={() => { const v = createNodeVersion(selected.node_id, { exposure: Number(((selected.parameters as Record<string, unknown>).exposure as number ?? 0.12) + 0.02).toFixed(2) }); setLogs(l => [...l, `New version ${v.node_id.slice(0,8)} supersedes ${selected.node_id.slice(0,8)} — old remains for comparison/rollback`]); }}>New version (param edit)</Button>
                <Button size="sm" variant="ghost" onClick={() => { const d = diagnosticsForNode(selected.node_id); setLogs(l => [...l, `Diagnostics ${d?.node_id.slice(0,8)} cache ${d?.cache_state} repro ${d?.reproduction_command.slice(0,40)}`]); }}>Diagnostics</Button>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--nv-color-text-faint)" }}>Actions: [Disable] [Replace Model] [Compare A/B] [Duplicate to Branch] [View Provenance] [Render Range] — all create new graph version, never mutate</div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--nv-color-text-muted)", marginTop: 8 }}>Select a node in the chain above. Editing a parameter creates <strong>new node version</strong> — old node stays for comparison, rollback, re-render, audit.</div>
          )}
          <div style={{ marginTop: 10, background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 11 }}>
            <div style={{ fontWeight: 700 }}>Taxonomy (controlled)</div>
            <div>Structural: trim, split, ripple_delete, reorder, time_remap … • Visual AI: denoise, stabilization, inpainting, background_replace, face_blur/replace, relighting … • Audio AI: noise_reduction, voice_isolation, dubbing, lip_sync … • Semantic: transcription, scene_detection, continuity_analysis … • Finishing: color_grade, captions, watermark, codec_packaging, c2pa_manifest</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Immutable Source Layer</div>
          {asset && (
            <div style={{ marginTop: 8, background: "#0f0f12", color: "#e2e8f0", borderRadius: 8, padding: 10, border: "1px solid #222", fontSize: 11, fontFamily: "var(--nv-font-mono)", lineHeight: 1.6 }}>
              <div>{asset.asset_id} — {asset.media.codec} {asset.media.resolution.join("x")} {asset.media.frame_rate}fps {asset.media.duration_ms}ms</div>
              <div>write_once {String(asset.immutability.write_once)} • content {asset.immutability.content_hash.slice(0,24)}…</div>
              <div>decoded {asset.immutability.decoded_hash.slice(0,24)}… • provenance_root {asset.provenance_root.slice(0,24)}…</div>
              <div>frame hashes {asset.metadata.frame_hashes?.length ?? 0} • audio {asset.metadata.audio_hashes?.length ?? 0} • legal_hold {String(asset.immutability.legal_hold)}</div>
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--nv-color-text-muted)" }}>AI nodes may reference source, never modify or replace it. Original bytes, container, decoded hashes, timecode, camera meta, rights/consent preserved.</div>
          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700 }}>Graph versions (cheap, content-addressed branches)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            {versions.map(v => (
              <div key={v.graph_version} style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 11 }}>
                <div style={{ display: "flex", gap: 6 }}><Badge tone="primary">{v.graph_version}</Badge><span style={{ fontFamily: "var(--nv-font-mono)" }}>{v.graph_hash.slice(0, 18)}…</span><span style={{ marginLeft: "auto", color: "var(--nv-color-text-faint)" }}>{v.change_reason}</span></div>
                <div style={{ marginTop: 4, fontFamily: "var(--nv-font-mono)", color: "var(--nv-color-text-muted)" }}>{v.nodes.length} nodes • {v.edges.length} edges • roots {v.root_inputs.join(",")} → {v.active_outputs.join(",")}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--nv-color-text-faint)" }}>Rollback restores pointer to earlier immutable version, preserves newer work — new head gv_47.</div>
        </Card>
      </div>

      {/* Timeline projection + range-scoped */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Timeline as Graph Projection</div>
          <div style={{ background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 11, border: "1px solid #222", marginTop: 8 }}>
            <div>{`{ "timeline_clip_id": "clip_001", "source_range": { "asset_id": "asset_camera_a001", "in_ms": 12000, "out_ms": 18700 }, "graph_root_node": "${nodes.find(n => n.operation === "color_grade")?.node_id.slice(0,8) ?? "node_…"}", "active_graph_version": "${versions[0]?.graph_version ?? "gv_42"}", "displayed_operations": [ ${(versions[0]?.nodes.slice(0,3).map(n => `"${n.slice(0,8)}"`).join(", ")) ?? ""} ] }`}</div>
          </div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginTop: 6 }}>Same source clip appears in multiple branches with different active node configs — display without mutating history.</div>
          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700 }}>Range-scoped nodes <Badge tone="primary">scope ∈ hash</Badge></div>
          <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 11, marginTop: 6 }}>
            <div>Time: 42000–48600 • Regions: mask_face_01 → person_044 • Also: object_track, face_track, speaker_segment, audio_band, caption_interval, frame_range</div>
            <div style={{ fontFamily: "var(--nv-font-mono)", color: "#a5b4fc", marginTop: 4 }}>{`{ "scope": { "time_ranges": [{ "start_ms": 42000, "end_ms": 48600 }], "regions": [{ "mask_artifact_id": "mask_face_01", "semantic_target": "person_044" }] } }`}</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Compare <Badge tone="primary">A/B</Badge></div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <Button size="sm" onClick={handleCompare}>Compare enabled vs disabled</Button>
            <Button size="sm" variant="secondary" onClick={handleExplain}>Explain frame 00:01:02:14</Button>
            <Button size="sm" variant="ghost" onClick={handleSchedule}>Schedule target export</Button>
          </div>
          {compare && (
            <div style={{ marginTop: 8, background: "var(--nv-color-surface-2)", padding: 8, borderRadius: 8, fontSize: 11, border: "1px solid var(--nv-color-border)" }}>
              <div>Added: {compare.diff.added.slice(0,3).join(", ") || "—"} • Removed: {compare.diff.removed.slice(0,3).join(", ") || "—"} • Reordered: {String(compare.diff.reordered)}</div>
              <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}><Badge tone="neutral">side_by_side</Badge><Badge tone="neutral">overlay</Badge><Badge tone="neutral">difference</Badge><Badge tone="neutral">waveform</Badge><Badge tone="neutral">spectrogram</Badge></div>
            </div>
          )}
          {explain && (
            <div style={{ marginTop: 8, background: "#0f0f12", color: "#e2e8f0", padding: 8, borderRadius: 8, fontSize: 11, border: "1px solid #222" }}>
              <div><strong>{explain.frame_label}</strong> • source {explain.source.asset_id} hash {explain.source.decoded_hash.slice(0,12)}…</div>
              <div>Path: {explain.active_path.map(p => `${p.operation}(${p.state}/${p.cache})`).join(" → ")}</div>
              <div>AI: {(explain.active_path.find(p => p.model)?.model ?? "none")} seed {(explain.active_path.find(p => p.seed !== undefined)?.seed ?? "—")}</div>
            </div>
          )}
          {schedule && (
            <div style={{ marginTop: 8, background: "var(--nv-color-surface-2)", padding: 8, borderRadius: 8, fontSize: 11, border: "1px solid var(--nv-color-border)" }}>
              <div>Target {schedule.target_node.slice(0,8)} • order {schedule.ordered_nodes.map(n=>n.slice(0,4)).join("→")} • cached {schedule.cached_nodes.length} • to_schedule {schedule.to_schedule.length}</div>
              <div>Parallel: {schedule.parallel_groups.map(g=>`[${g.map(n=>n.slice(0,4)).join(",")}]`).join(" ")} • ${`$${schedule.estimated_total_cost_usd}`}</div>
            </div>
          )}
        </Card>
      </div>

      {/* Cache + reproducibility */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Render Cache <Badge tone="primary">content-addressed</Badge></div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 4 }}>Key = input hashes + node hash + graph_version hash + render_profile + color/audio/caption + runtime + determinism</div>
          <div style={{ background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222", marginTop: 8 }}>
            <div>{`{ "cache_key": "cache:sha3-512:…", "node_id": "${nodes[0]?.node_id.slice(0,8) ?? ""}", "node_hash": "${nodes[0]?.node_hash.slice(0,12) ?? ""}…", "artifact_id": "artifact_…", "media_equivalence": "verified", "storage": { "tier": "warm", "location": "s3://n0va-render-cache/…" } }`}</div>
            <div style={{ marginTop: 6 }}>Reuse: exact, segment, frame-tile, audio-block, proxy, export-profile, cross-branch; cross-project only with tenant policy</div>
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 6 }}><Button size="sm" variant="ghost" onClick={handleCacheInvalidate}>Invalidate downstream</Button><Badge tone="neutral">Dependency-based, not time-based</Badge></div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginTop: 6 }}>Invalid if: input hash, params, model/runtime digest, color/audio pipeline, prompt, consent, external dep, schema change — upstream unchanged stays reusable. Model upgrade does not auto-invalidate historical outputs.</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Reproducible Rendering</div>
          <div style={{ display: "flex", gap: 4, marginTop: 6, fontSize: 11 }}>
            <Badge tone="success">bit_exact</Badge><Badge tone="primary">media_exact</Badge><Badge tone="neutral">process_exact</Badge>
          </div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginTop: 6 }}>Locks: model weights/digest, runtime/container, plugins, GPU mode, seeds, precision, sampling, color libs, codec, encoder, metadata ordering, locale, fonts, external asset versions. Verification runs 2.</div>
          <div style={{ background: "var(--nv-color-surface-2)", padding: 8, borderRadius: 8, fontSize: 11, border: "1px solid var(--nv-color-border)", marginTop: 8 }}>
            <div><strong>Seed 88211</strong> + sampling params recorded; external provider without determinism → <em>traceable_but_not_reproducible</em> (immutable artifact stored, never silent replace)</div>
            <div style={{ marginTop: 4, display: "flex", gap: 4 }}><Badge tone="neutral">strict seed+no temp</Badge><Badge tone="neutral">bounded ±0.005</Badge><Badge tone="neutral">creative traceable</Badge><Badge tone="warning">external</Badge></div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11 }}>Semantic nodes (transcription etc.) reusable across branches — not recomputed per branch</div>
        </Card>
      </div>

      {/* Cost + guardrails + approvals */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Cost — per node metrics</div>
          {selected && (
            <div style={{ marginTop: 8, background: "var(--nv-color-surface-2)", padding: 8, borderRadius: 8, fontSize: 11, border: "1px solid var(--nv-color-border)" }}>
              {(() => { const m = estimateCost(selected); return (<><div>GPU {m.gpu_seconds}s • CPU {m.cpu_seconds}s • peak {m.peak_memory_mb}MB • ${m.provider_cost.amount} {m.provider_cost.currency} • hit {String(m.cache.hit)}</div><div style={{ marginTop: 4, color: "var(--nv-color-text-muted)" }}>Recommend: reuse artifact, proxy first, defer enhancement till approval, cheaper model for preview, render only changed ranges</div></>); })()}
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Scheduler optimizes cache reuse, GPU locality, model warmness, memory, deadline, cost, tenant isolation, geographic restrictions.</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Guardrails & Approvals</div>
          <div style={{ fontSize: 11, marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            <span>✕ Original media never writable via editing API</span>
            <span>✕ No in-place param edit — new node version</span>
            <span>✕ Every output content-addressed, graph version immutable after approval/publication</span>
            <span>✕ No untracked runtime, no cross-tenant cache without policy, no consent-less synthetic, no unverified publish</span>
            <span>✓ Approvals bind to <code>graph_id:gv:output_hash:scope(destination,format,territories)</code> — param/model/range/consent/profile/caption/watermark/disclosure change invalidates</span>
          </div>
          <div style={{ marginTop: 8, background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222" }}>{`{ "approval_id": "approval_01J…", "approved_target": { "graph_id": "${graphId}", "graph_version": "${versions[0]?.graph_version ?? "gv_42"}", "output_node": "node_export_master", "output_hash": "sha3-512:…" }, "scope": { "destination": "youtube", "format": "4k_hdr", "territories": ["IN","US"] } }`}</div>
        </Card>
      </div>

      {/* Logs + manifest */}
      <Card padded>
        <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Graph operations log <Badge tone="neutral">{logs.length} events</Badge><span style={{ marginLeft: "auto", fontSize: 11, color: "var(--nv-color-text-faint)" }}>Explain • Debug • Regulatory trace • External reproduction • C2PA</span></div>
        <div style={{ marginTop: 8, background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 11, border: "1px solid #222", maxHeight: 140, overflowY: "auto" }}>
          {logs.length === 0 ? <div style={{ color: "#666" }}>No operations yet — try Disable / Reorder / Replace / Compare / Explain</div> : logs.map((l, i) => <div key={i}>• {l}</div>)}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--nv-color-text-muted)" }}>Node manifest, C2PA assertions, legal discovery, audit snapshot, model-risk report exportable. External provider captures request/response hash, region, terms version — never silent replace.</div>
      </Card>
    </div>
  );
}
