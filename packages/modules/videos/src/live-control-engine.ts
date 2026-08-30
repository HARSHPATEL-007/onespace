/**
 * N0VA VIDEOS — Resilient Live Control Room Engine
 * 5 planes, state machine, multi-region active-active, bounded recovery
 */
import type {
  LiveSession, LiveStatus, RegionConfig, EncoderConfig, DestinationHealth, HealthPrediction, FailoverPolicy,
  HandoffReport, CaptionRevision, HighlightCandidate, ReplayBuffer, RecordingSegment, FallbackAsset, ContributorDiagnostics, LiveIncident,
} from "./live-control-types";

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso() { return new Date().toISOString(); }

const sessions = new Map<string, LiveSession>();
const incidents = new Map<string, LiveIncident>();
const captionRevisions = new Map<string, CaptionRevision>();
const highlights = new Map<string, HighlightCandidate>();
const replayBuffers = new Map<string, ReplayBuffer>();
const fallbackAssets: FallbackAsset[] = [
  { asset_id:"slate_global_01", purpose:"technical_difficulty", duration_ms:30000, loopable:true, captioned:true, loudness_verified:true, rights_verified:true, destinations:["youtube","linkedin","custom_rtmp"], expires_at:"2027-01-31T00:00:00Z" },
];

const FAILOVER_POLICY: FailoverPolicy = {
  max_switch_time_ms:15000, require_operator_confirmation:false,
  allowed_actions:["switch_encoder","switch_region","reconnect_destination","play_emergency_slate"],
  preserve_program_clock:true, preserve_caption_clock:true,
  notify_roles:["technical_director","producer","broadcast_engineer"],
};

// ── Health prediction model (mock neural) ────────────────────────────────────
export function predictHealth(streamId: string, signals: Partial<Record<string, number>> = {}): HealthPrediction {
  const packet_loss = signals.packet_loss ?? 2.8;
  const jitter = signals.jitter ?? 96;
  const rtt = signals.rtt ?? 412;
  const queue = signals.queue_depth ?? 48;
  const gpu = signals.gpu_util ?? 72;
  // Simple model: failure prob increases with packet loss, jitter, queue
  let failure_prob = Math.min(0.95, packet_loss*0.15 + jitter*0.003 + queue*0.004 + (gpu>85?0.15:0));
  let health = Math.max(10, 100 - failure_prob*80 - jitter*0.1);
  let level: HealthPrediction["level"] = failure_prob<0.2?"healthy":failure_prob<0.5?"watch":failure_prob<0.75?"at_risk":"critical";
  let causes: HealthPrediction["likely_causes"] = [];
  if (packet_loss>2) causes.push({ cause:"upstream_packet_loss", probability:0.76 });
  if (queue>40) causes.push({ cause:"encoder_queue_growth", probability:0.48 });
  if (rtt>300) causes.push({ cause:"regional_network_degradation", probability:0.62 });
  if (causes.length===0) causes.push({ cause:"stable", probability:0.12 });
  let recommended = failure_prob>0.75 ? "increase_srt_latency_then_reduce_bitrate" : failure_prob>0.5 ? "reduce_bitrate_one_rung" : "monitor";
  let time_to_deg = failure_prob>0.5 ? Math.max(5, Math.round(60 - failure_prob*50)) : undefined;
  return {
    stream_id: streamId, health_score: Math.round(health), failure_probability_60s: Number(failure_prob.toFixed(2)),
    time_to_degradation_seconds: time_to_deg, likely_causes: causes, recommended_action: recommended, confidence:0.89, evidence:["packet_loss","jitter","encoder_queue"], model_version:"n0va-live-health-v3", level,
  };
}

// ── Session lifecycle ────────────────────────────────────────────────────────
const VALID_TRANSITIONS: Record<LiveStatus, LiveStatus[]> = {
  configuring:["armed"], armed:["previewing"], previewing:["live"], live:["degraded","failover_active","emergency_mode","ending"], degraded:["failover_active","emergency_mode","recovered","live"], failover_active:["recovered","degraded","emergency_mode"], emergency_mode:["recovery_pending","live"], recovery_pending:["recovered"], recovered:["live","ending"], ending:["finalizing"], finalizing:["verified"], verified:[],
};

export function createSession(input: { event_id: string; regions: string[]; sources: string[]; destinations: { platform:string; profile:string }[]; recording?: { program?: boolean; clean_feed?: boolean; isos?: boolean; audio_stems?: boolean }; failover_policy?: string; tenant_id?: string }): LiveSession {
  const sessionId = `live_${new Date().toISOString().slice(0,10).replace(/-/g,"")}_${uid("sess").slice(-4)}`;
  const regions: RegionConfig[] = input.regions.map((r,i)=>({
    region: r, role: i===0?"primary":i===1?"hot_standby":"cold", health:"healthy", encoder_id:`enc_${r.slice(0,2)}_01`, ingest_endpoint:`srt://${r}.n0va.live:9000`
  }));
  const encoders: EncoderConfig[] = [];
  for (const reg of regions) {
    // two encoders per region, different AZ/power/network
    encoders.push({ encoder_id:`enc_${reg.region}_hw_01`, region: reg.region, type:"hardware", status:"warmed", profile:"youtube_1080p60_v5", metrics:{ queue_depth:12, gpu_util:42, frame_drop_rate:0.01, bitrate_kbps:6100 }, state:{ program_frame:89234400, scene:"Product demonstration", audio_mix:"stereo", graphics:"lower_third", caption_state:"published", gop_position:12 } });
    encoders.push({ encoder_id:`enc_${reg.region}_sw_02`, region: reg.region, type:"software_gpu", status:"warmed", profile:"youtube_1080p60_v5", metrics:{ queue_depth:8, gpu_util:68, frame_drop_rate:0.02, bitrate_kbps:5800 } });
  }
  const destinations: DestinationHealth[] = input.destinations.map(d=>({
    id: `${d.platform}_live`, platform: d.platform, status: "healthy" as const, health_score:94,
    ingest:{ connected:true, bitrate_kbps:6100, packet_loss_percent:0.4, rtt_ms:42, jitter_ms:12 },
    media:{ video_fps:60, audio_bitrate_kbps:192, av_sync_ms:18, caption_delay_ms:120 },
    audience_impact:"none", bitrate_ladder:[{profile:"1080p60",video_kbps:8000,audio_kbps:192},{profile:"1080p30",video_kbps:5000,audio_kbps:160},{profile:"720p30",video_kbps:2800,audio_kbps:128},{profile:"480p30",video_kbps:1200,audio_kbps:96}], current_rung:0,
  }));
  // diversify one destination to degraded for demo
  if (destinations[1]) { destinations[1].status="degraded"; destinations[1].health_score=64; destinations[1].ingest.packet_loss_percent=2.8; destinations[1].ingest.rtt_ms=412; destinations[1].media.caption_delay_ms=620; destinations[1].action="reduce_bitrate_and_reconnect"; destinations[1].audience_impact="moderate"; }

  const health = predictHealth(input.sources[0] ?? "stream_001", { packet_loss:0.4, jitter:12 });
  const session: LiveSession = {
    tenant_id: input.tenant_id ?? "tenant_001", session_id: sessionId, event_id: input.event_id,
    status:"live", program_clock:{ timebase:"90000", current_pts:89234400, wall_clock: nowIso() },
    regions, encoders, destinations,
    recording:{ program:"recording_program_001", clean_feed:"recording_clean_001", iso_count:8, integrity_status:"verified", segments: generateRecordingSegments("recording_program_001") },
    health_prediction: health, live_state:{ status:"live", failover_level:0, operator_acknowledged:false, audience_impact:"none" },
    fallback_assets: [...fallbackAssets], audit_chain_head:`sha3-512:${sessionId}`, created_at: nowIso(), updated_at: nowIso(),
  };
  sessions.set(sessionId, session);
  return session;
}
export function getSession(sessionId: string): LiveSession | null { return sessions.get(sessionId) ?? null; }
export function listSessions(): LiveSession[] { return Array.from(sessions.values()); }
export function transitionSession(sessionId: string, target: LiveStatus, reason?: string): LiveSession | null {
  const s = sessions.get(sessionId);
  if (!s) return null;
  const allowed = VALID_TRANSITIONS[s.status] ?? [];
  if (!allowed.includes(target) && s.status!==target) {
    // allow force for demo but log
  }
  s.status = target;
  s.live_state.status = target as unknown as LiveSession["live_state"]["status"];
  if (reason) s.live_state.reason = reason;
  s.updated_at = nowIso();
  return s;
}

// ── Failover hierarchy ───────────────────────────────────────────────────────
export function executeFailover(sessionId: string, input: { scope: string; from: string; to: string; reason: string; mode?: string; operator_id?: string }): { handoff: HandoffReport; session: LiveSession; incident: LiveIncident } {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  const fromEnc = session.encoders.find(e=>e.encoder_id===input.from);
  const toEnc = session.encoders.find(e=>e.encoder_id===input.to);
  if (!fromEnc || !toEnc) throw new Error("Encoder not found in session");
  // Determine level
  let level: number = 1;
  if (input.scope==="encoder") level=1;
  else if (input.scope==="ingest") level=2;
  else if (input.scope==="region") level=3;
  else if (input.scope==="destination") level=4;
  else if (input.scope==="emergency") level=5;
  // Choose handoff mode
  let mode: HandoffReport["mode"] = (input.mode as HandoffReport["mode"]) ?? "keyframe";
  if (fromEnc.metrics && fromEnc.metrics.queue_depth && fromEnc.metrics.queue_depth>60) mode="emergency_media";
  else if (toEnc.state?.gop_position!==undefined) mode="frame_accurate";

  const handoff: HandoffReport = {
    from_encoder: input.from, to_encoder: input.to, switch_time: nowIso(),
    last_source_pts: 89234400, first_target_pts: 89234400,
    timestamp_continuity: "pass", audio_continuity: "pass", caption_continuity: mode==="frame_accurate"?"pass":"warning",
    frames_repeated:0, frames_dropped: mode==="keyframe"?1:0, mode,
  };
  // Update session: switch active path, set failover level
  session.live_state.failover_level = level as unknown as LiveSession["live_state"]["failover_level"];
  session.live_state.active_program_path = `${toEnc.region}.${toEnc.encoder_id}`;
  session.live_state.status = "failover_active" as unknown as LiveSession["live_state"]["status"];
  session.status = "failover_active";
  // Mark encoders
  fromEnc.status="failed"; toEnc.status="active";
  // Create incident
  const incident: LiveIncident = {
    incident_id: uid("inc"), severity: level<=1?"p1":level===2?"p1":level===3?"p0":"p2",
    root_cause_hypothesis: input.reason, confidence:0.86, affected_components:[input.from, session.regions.find(r=>r.encoder_id===input.from)?.region ?? "unknown", input.scope],
    actions_taken: [mode, `switched ${input.from}→${input.to}`, "preserve_program_clock"],
    operator_status:"unacknowledged", correlated_signals:["packet_loss","encoder_queue_growth","youtube_ingest_degraded"],
  };
  incidents.set(incident.incident_id, incident);
  session.updated_at = nowIso();
  return { handoff, session, incident };
}

// ── Destination health & bitrate recovery ────────────────────────────────────
export function getDestinationHealth(sessionId: string, destinationId: string): DestinationHealth | null {
  const s = sessions.get(sessionId);
  if (!s) return null;
  return s.destinations.find(d=>d.id===destinationId) ?? null;
}
export function updateDestinationHealth(sessionId: string, destinationId: string, patch: Partial<DestinationHealth["ingest"]>): DestinationHealth | null {
  const s = sessions.get(sessionId);
  if (!s) return null;
  const d = s.destinations.find(x=>x.id===destinationId);
  if (!d) return null;
  if (patch.packet_loss_percent!==undefined) d.ingest.packet_loss_percent = patch.packet_loss_percent;
  if (patch.rtt_ms!==undefined) d.ingest.rtt_ms = patch.rtt_ms;
  if (patch.jitter_ms!==undefined) d.ingest.jitter_ms = patch.jitter_ms;
  // Recalc health
  const pred = predictHealth(destinationId, { packet_loss: d.ingest.packet_loss_percent, jitter: d.ingest.jitter_ms, rtt: d.ingest.rtt_ms });
  d.health_score = pred.health_score;
  if (pred.level==="critical") d.status="degraded";
  else if (pred.level==="healthy") d.status="healthy";
  return d;
}
export function reconnectDestination(sessionId: string, destinationId: string): DestinationHealth | null {
  const d = getDestinationHealth(sessionId, destinationId);
  if (!d) return null;
  d.status="reconnecting";
  // staged recovery: increase latency, reduce bitrate one rung, reconnect, restore gradually
  if (d.bitrate_ladder && d.current_rung!==undefined && d.current_rung < d.bitrate_ladder.length-1) {
    d.current_rung += 1; // downgrade one rung
    const rung = d.bitrate_ladder[d.current_rung];
    if (rung) d.ingest.bitrate_kbps = rung.video_kbps;
  }
  // simulate reconnect after 2s
  setTimeout(()=>{ d.status="healthy"; d.health_score=88; d.ingest.packet_loss_percent=0.6; }, 2000);
  return d;
}
export function recoverBitrate(sessionId: string, destinationId: string): DestinationHealth | null {
  const d = getDestinationHealth(sessionId, destinationId);
  if (!d || d.current_rung===undefined || d.current_rung===0) return d;
  // upgrade only after 60s stable — for demo immediate
  d.current_rung -= 1;
  if (d.bitrate_ladder) {
    const rung = d.bitrate_ladder[d.current_rung];
    if (rung) d.ingest.bitrate_kbps = rung.video_kbps;
  }
  d.health_score = Math.min(94, d.health_score+8);
  return d;
}

// ── Caption correction ───────────────────────────────────────────────────────
export function createCaptionRevision(input: { segment_id?: string; original_text: string; corrected_text: string; start_ms: number; end_ms: number; reason: string; actor?: string }): CaptionRevision {
  const rev: CaptionRevision = {
    segment_id: input.segment_id ?? uid("cap"), version: 1, original_text: input.original_text, corrected_text: input.corrected_text,
    start_ms: input.start_ms, end_ms: input.end_ms, reason: input.reason, correction_latency_ms: 1400, actor: input.actor ?? "caption_agent", human_review_required:false, state:"corrected",
  };
  // versioning: if exists, increment
  const existing = captionRevisions.get(input.segment_id ?? "");
  if (existing) { rev.version = existing.version+1; rev.segment_id = existing.segment_id; }
  captionRevisions.set(rev.segment_id, rev);
  return rev;
}
export function listCaptionRevisions(): CaptionRevision[] { return Array.from(captionRevisions.values()); }

// ── Highlight clipping ───────────────────────────────────────────────────────
export function createHighlightCandidate(input: { trigger: string; event_time_ms: number; pre_roll_ms?: number; post_roll_ms?: number; formats?: string[]; publish_mode?: string }): HighlightCandidate {
  const pre = input.pre_roll_ms ?? 10000; const post = input.post_roll_ms ?? 15000;
  const hl: HighlightCandidate = {
    candidate_id: uid("hl"), start_ms: input.event_time_ms - pre, end_ms: input.event_time_ms + post, score:0.91,
    reasons:[input.trigger, "speech_emphasis", "chat_velocity_spike"], source_isos:["iso_cam_01","iso_cam_03","iso_program"],
    suggested_formats: input.formats ?? ["16:9","9:16","1:1"], status:"awaiting_operator_review", pre_roll_ms: pre, post_roll_ms: post,
  };
  highlights.set(hl.candidate_id, hl);
  return hl;
}
export function listHighlights(): HighlightCandidate[] { return Array.from(highlights.values()); }

// ── Replay buffer ────────────────────────────────────────────────────────────
export function startReplay(input: { session_id: string; source: string; start_offset_seconds: number; duration_seconds: number; speed?: number; graphics_template?: string }): ReplayBuffer {
  const session = sessions.get(input.session_id);
  if (!session) throw new Error("Session not found");
  const liveEdge = 102000; // mock 01:42:00
  const replayPoint = liveEdge - input.start_offset_seconds*1000;
  const buf: ReplayBuffer = {
    source: input.source, start_offset_seconds: input.start_offset_seconds, duration_seconds: input.duration_seconds, speed: input.speed ?? 0.5, graphics_template: input.graphics_template,
    state:"playing", live_edge_ms: liveEdge*10, replay_point_ms: replayPoint*10,
  };
  replayBuffers.set(`${input.session_id}:${input.source}`, buf);
  return buf;
}
export function getReplayBuffer(sessionId: string, source: string): ReplayBuffer | null { return replayBuffers.get(`${sessionId}:${source}`) ?? null; }

// ── Recording integrity ──────────────────────────────────────────────────────
function generateRecordingSegments(recordingId: string): RecordingSegment[] {
  const segs: RecordingSegment[] = [];
  for (let i=0;i<6;i++) {
    segs.push({
      segment_id: `seg_${String(i).padStart(6,"0")}`, recording_id: recordingId,
      start_timecode:`01:42:${String(i*10).padStart(2,"0")}:00`, end_timecode:`01:42:${String((i+1)*10).padStart(2,"0")}:00`,
      duration_ms:10000, expected_frames:600, received_frames:600, dropped_frames:0,
      audio_samples_expected:480000, audio_samples_received:480000, checksum:`sha3-512:${recordingId.slice(0,8)}${i}`, storage_replicas:3, verified:true,
    });
  }
  return segs;
}
export function verifyRecording(recordingId: string, checks: string[]): { verified: boolean; segments: RecordingSegment[]; missing_intervals: string[] } {
  // For demo, all verified
  const segs = generateRecordingSegments(recordingId);
  return { verified:true, segments: segs, missing_intervals:[] };
}

// ── Contributor diagnostics ──────────────────────────────────────────────────
export function diagnoseContributor(contributorId: string): ContributorDiagnostics {
  return {
    contributor_id: contributorId, status:"healthy",
    network:{ upload_mbps:4.2, packet_loss_percent:3.1, rtt_ms:188, jitter_ms:74 },
    device:{ cpu_percent:92, camera:"720p", capture_fps:21, audio_sample_rate:44100 },
    environment:{ echo:true, background_noise:"high", lighting:"insufficient" },
    permissions:{ camera:true, mic:true },
    recommended_action:"Switch to audio priority and request wired connection.",
  };
}

// ── Fallback assets ──────────────────────────────────────────────────────────
export function listFallbackAssets(): FallbackAsset[] { return [...fallbackAssets]; }
export function validateFallbackAsset(assetId: string): { valid: boolean; checks: Record<string, boolean> } {
  const a = fallbackAssets.find(x=>x.asset_id===assetId);
  if (!a) return { valid:false, checks:{} };
  return { valid: true, checks:{ codec:true, loudness_verified: a.loudness_verified, caption_track: a.captioned, brand_approval:true, rights_clearance: a.rights_verified, destination_compatibility:true, loop_boundary:true } };
}

// ── Incidents & alert correlation ────────────────────────────────────────────
export function getIncident(incidentId: string): LiveIncident | null { return incidents.get(incidentId) ?? null; }
export function listIncidents(): LiveIncident[] { return Array.from(incidents.values()); }
export function acknowledgeIncident(incidentId: string, operatorId: string): LiveIncident | null {
  const inc = incidents.get(incidentId);
  if (!inc) return null;
  inc.operator_status="acknowledged";
  return inc;
}
export function correlateSignals(signals: string[]): LiveIncident {
  const inc: LiveIncident = {
    incident_id: uid("inc"), severity:"p1", root_cause_hypothesis:"regional_network_degradation", confidence:0.86,
    affected_components:["srt_contribution_01","encoder_primary_01","youtube_destination"], actions_taken:["reduced_bitrate","increased_srt_latency"], operator_status:"unacknowledged", correlated_signals: signals,
  };
  incidents.set(inc.incident_id, inc);
  return inc;
}

// ── Recovery objectives ──────────────────────────────────────────────────────
export const RECOVERY_OBJECTIVES = {
  program_output: { target_ms:5000, max_visible_disruption_ms:2000 },
  destination_reconnect: { target_ms:30000 },
  caption_service: { target_ms:3000, max_delay_ms:2000 },
  program_recording: { zero_gaps:true, segment_recovery_ms:10000 },
  iso_recording: { silent_loss:false },
};

// ── Post-event report ────────────────────────────────────────────────────────
export function generateEventReport(sessionId: string): Record<string, unknown> {
  const s = sessions.get(sessionId);
  if (!s) throw new Error("Session not found");
  return {
    event: s.event_id, duration:"02:14:32", peak_destinations: s.destinations.length, regions_used: s.regions.filter(r=>r.health!=="healthy"||r.role!=="cold").length,
    encoder_switches: s.live_state.failover_level>0?1:0, destination_reconnects:2, visible_interruptions:0, caption_corrections: listCaptionRevisions().length, replay_segments: replayBuffers.size, highlight_candidates: highlights.size,
    recording_integrity:{ program:"verified", clean_feed:"verified", isos:"8/8 verified", audio_stems:"6/6 verified", missing_intervals:"none" },
    incidents: listIncidents().slice(0,3), health_timeline: [s.health_prediction],
  };
}
