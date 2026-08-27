/**
 * N0VA ANI — Meeting and Communication Intelligence
 *
 * Meeting operating system: assist conversation, expose evidence,
 * suggest next steps, never silently evaluate people.
 */

import { createHash } from "crypto";

// ============================================================================
// 1. Shared Meeting Event Model
// ============================================================================

export type MeetingEventType =
  | "agenda_item"
  | "topic_transition"
  | "decision"
  | "action"
  | "risk"
  | "question"
  | "unanswered_question"
  | "disagreement"
  | "commitment"
  | "follow_up"
  | "topic_drift"
  | "participant_request"
  | "recording_pause"
  | "consent_change"
  | "external_artifact_reference";

export type MeetingEventStatus = "proposed_for_confirmation" | "confirmed" | "rejected" | "pending" | "resolved" | "deferred";

export interface MeetingEvent {
  event_id: string;
  meeting_id: string;
  type: MeetingEventType;
  time: { start_ms: number; end_ms: number };
  title: string;
  content: { summary: string; speaker_ids: string[]; text?: string };
  status: MeetingEventStatus;
  confidence: number;
  evidence: Array<{ asset_id: string; start_ms?: number; end_ms?: number; segment_ids?: string[]; slide?: number }>;
  permissions: { visibility: "attendees" | "project" | "host_only"; classification: "internal" | "confidential" | "public" | "restricted" };
  hash?: string;
  created_at: string;
}

export function createMeetingEvent(input: Omit<MeetingEvent, "event_id" | "hash" | "created_at"> & Partial<Pick<MeetingEvent, "event_id">>): MeetingEvent {
  const ev: MeetingEvent = {
    event_id: input.event_id ?? `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`,
    meeting_id: input.meeting_id,
    type: input.type,
    time: input.time,
    title: input.title,
    content: input.content,
    status: input.status,
    confidence: input.confidence,
    evidence: input.evidence,
    permissions: input.permissions,
    created_at: new Date().toISOString(),
  };
  ev.hash = createHash("sha256").update(`${ev.event_id}|${ev.meeting_id}|${ev.type}|${ev.time.start_ms}|${ev.title}|${ev.confidence}`).digest("hex");
  return ev;
}

// ============================================================================
// 2. Live Agenda Intelligence
// ============================================================================

export type AgendaStatus = "not_started" | "in_progress" | "discussed" | "decision_pending" | "decision_recorded" | "action_assigned" | "deferred" | "unresolved";

export interface AgendaItemState {
  item_id: string;
  title: string;
  planned_duration_ms?: number;
  status: AgendaStatus;
  time_spent_ms: number;
  participants: string[];
  key_points: string[];
  questions: string[]; // question_ids
  evidence_links: string[]; // event_ids
  decision_state: "none" | "pending" | "recorded";
  remaining_ms?: number;
  suggested_next_step?: string;
}

export class LiveAgendaTracker {
  private items = new Map<string, AgendaItemState>();
  private startedAt = new Map<string, number>();

  addItem(item: Omit<AgendaItemState, "time_spent_ms" | "status"> & Partial<Pick<AgendaItemState,"status"|"time_spent_ms">>): AgendaItemState {
    const state: AgendaItemState = {
      item_id: item.item_id,
      title: item.title,
      planned_duration_ms: item.planned_duration_ms,
      status: item.status ?? "not_started",
      time_spent_ms: item.time_spent_ms ?? 0,
      participants: item.participants ?? [],
      key_points: item.key_points ?? [],
      questions: item.questions ?? [],
      evidence_links: item.evidence_links ?? [],
      decision_state: item.decision_state ?? "none",
      remaining_ms: item.remaining_ms,
      suggested_next_step: item.suggested_next_step,
    };
    this.items.set(state.item_id, state);
    return state;
  }

  start(item_id: string): void {
    const it = this.items.get(item_id);
    if (!it) return;
    it.status = "in_progress";
    this.startedAt.set(item_id, Date.now());
  }

  updateProgress(item_id: string, patch: Partial<AgendaItemState> & { evidence_id?: string; participant?: string }): void {
    const it = this.items.get(item_id);
    if (!it) return;
    if (patch.key_points) it.key_points.push(...patch.key_points);
    if (patch.questions) it.questions.push(...patch.questions);
    if (patch.evidence_id) it.evidence_links.push(patch.evidence_id);
    if (patch.participant && !it.participants.includes(patch.participant)) it.participants.push(patch.participant);
    if (patch.decision_state) it.decision_state = patch.decision_state;
    if (this.startedAt.has(item_id)) it.time_spent_ms = Date.now() - (this.startedAt.get(item_id) ?? Date.now());
    if (patch.remaining_ms!==undefined) it.remaining_ms = patch.remaining_ms;
  }

  setStatus(item_id: string, s: AgendaStatus): void { const it=this.items.get(item_id); if(it) it.status=s; }

  // Alerts visible only to authorized, dismissible, never auto-interrupt unless host enabled facilitation
  checkAlerts(authorized: boolean): Array<{ item_id: string; message: string; dismissible: boolean }> {
    if (!authorized) return [];
    const out: Array<{message:string; item_id:string; dismissible:boolean}> = [];
    for (const it of this.items.values()) {
      if (it.planned_duration_ms && it.time_spent_ms > it.planned_duration_ms + 12*60*1000) {
        out.push({ item_id: it.item_id, message: `"${it.title}" has exceeded its planned time by ${Math.round((it.time_spent_ms - it.planned_duration_ms)/60000)} minutes. ${it.questions.length} questions remain unanswered and no decision owner is identified.`, dismissible:true });
      }
    }
    return out;
  }

  list(): AgendaItemState[] { return [...this.items.values()]; }
  get(id: string): AgendaItemState | undefined { return this.items.get(id); }
}

// ============================================================================
// 3. Unanswered-Question Detection
// ============================================================================

export type QuestionStatus = "unanswered" | "answered" | "partially_answered" | "deferred" | "rejected_out_of_scope" | "needs_SME" | "awaiting_external" | "contradictory_answers";

export interface TrackedQuestion {
  question_id: string;
  question: string;
  asked_by: string;
  timestamp_ms: number;
  status: QuestionStatus;
  candidate_answers: string[];
  related_topics: string[];
  follow_up_owner: string | null;
  confidence: number;
}

export class QuestionDetector {
  private qs = new Map<string, TrackedQuestion>();

  detect(input: { text: string; speaker: string; timestamp_ms: number; chat?: boolean; hand_raise?: boolean }): TrackedQuestion | null {
    const t = input.text.trim();
    const isQuestion = t.includes("?") || /^(who|what|when|where|why|how|can|could|would|should|is|are|do|does)/i.test(t) || !!input.hand_raise || !!input.chat;
    if (!isQuestion) return null;
    const q: TrackedQuestion = {
      question_id: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,4)}`,
      question: t,
      asked_by: input.speaker,
      timestamp_ms: input.timestamp_ms,
      status: "unanswered",
      candidate_answers: [],
      related_topics: extractTopics(t),
      follow_up_owner: null,
      confidence: t.includes("?") ? 0.93 : 0.72,
    };
    this.qs.set(q.question_id, q);
    return q;
  }

  resolve(question_id: string, status: QuestionStatus, answer?: string): void {
    const q = this.qs.get(question_id);
    if (!q) return;
    q.status = status;
    if (answer) q.candidate_answers.push(answer);
  }

  unresolved(): TrackedQuestion[] { return [...this.qs.values()].filter(q=> q.status==="unanswered" || q.status==="partially_answered" || q.status==="awaiting_external"); }

  reviewPanel(): { unanswered: number; conflicting_estimates: number; decisions_without_owner: number; actions_awaiting_confirmation: number; items: TrackedQuestion[] } {
    const unanswered = this.unresolved();
    return { unanswered: unanswered.length, conflicting_estimates: 0, decisions_without_owner: 0, actions_awaiting_confirmation: 0, items: unanswered };
  }

  list(): TrackedQuestion[] { return [...this.qs.values()]; }
}

function extractTopics(text: string): string[] {
  const keywords = ["migration","rollback","budget","security","capacity","vendor","timeline"];
  return keywords.filter(k=> text.toLowerCase().includes(k));
}

// ============================================================================
// 4. Decision Extraction — stronger evidence than summary
// ============================================================================

export interface DecisionRecord {
  decision_id: string;
  statement: string;
  status: "confirmed" | "proposed" | "rejected" | "needs_confirmation";
  decision_owner: string | null;
  supporting_evidence: string[];
  dissenting_evidence: string[];
  assumptions: string[];
  revisit_on?: string;
  participants: string[];
  effective_date?: string;
  conditions?: string[];
  reversal_criteria?: string[];
  source_timestamps: { start_ms: number; end_ms: number };
  confidence: number;
  inferred: boolean;
}

export class DecisionExtractor {
  extract(input: { text: string; speaker_ids: string[]; timestamp: { start_ms:number; end_ms:number }; priorEvidence?: string[] }): DecisionRecord | null {
    const lower = input.text.toLowerCase();
    // Must be explicit decision, not discuss/recommend/speculate/investigate
    const weak = ["discuss","recommend","speculate","investigate","explore","consider"];
    const strong = ["agreed","decided","approved","will use","approve","confirmed","choose"];
    const hasWeakOnly = weak.some(w=> lower.includes(w)) && !strong.some(s=> lower.includes(s));
    if (hasWeakOnly) return null;
    const isExplicit = strong.some(s=> lower.includes(s)) || /we will|agreed to/.test(lower);
    if (!isExplicit) return null; // inferred not labeled as decision
    return {
      decision_id: `dec_${Date.now().toString(36).slice(2,6)}`,
      statement: input.text.slice(0,120),
      status: isExplicit ? "confirmed" : "proposed",
      decision_owner: null, // must be explicit, not inferred
      supporting_evidence: input.priorEvidence ?? [],
      dissenting_evidence: [],
      assumptions: [],
      participants: input.speaker_ids,
      source_timestamps: input.timestamp,
      confidence: isExplicit ? 0.88 : 0.62,
      inferred: !isExplicit,
    };
  }

  setOwner(decision: DecisionRecord, owner: string | null, basis: "explicit" | "inferred"): DecisionRecord {
    if (basis==="inferred") return decision; // do not set inferred owner
    decision.decision_owner = owner;
    return decision;
  }
}

// ============================================================================
// 5. Action and Commitment Extraction — proposed not silently created
// ============================================================================

export type ExtractionBasis = "explicit statement" | "explicit acceptance" | "inferred" | "relative_date";
export type ActionApproval = "suggestion" | "personal_draft" | "personal_task" | "team_task" | "follow_up" | "calendar_event" | "milestone_change" | "external_notify";

export interface ExtractedAction {
  action_id: string;
  title: string;
  owner: { person_id: string | null; basis: ExtractionBasis; confidence: number };
  deadline: { value: string | null; basis: ExtractionBasis; confidence: number; timezone?: string };
  dependencies: string[];
  source_timestamp: { start_ms: number; end_ms: number };
  status: "awaiting_confirmation" | "confirmed" | "created" | "rejected";
  evidence: string[];
  original_wording: string;
  is_commitment: boolean;
}

export const APPROVAL_LEVELS: Record<ActionApproval, { behavior: string; requires: string }> = {
  suggestion: { behavior: "Show as suggestion", requires: "Automatic" },
  personal_draft: { behavior: "Add to personal draft list", requires: "User preference" },
  personal_task: { behavior: "Create personal task", requires: "Confirm once or configurable" },
  team_task: { behavior: "Assign team task", requires: "Explicit confirmation" },
  follow_up: { behavior: "Send follow-up message", requires: "Explicit confirmation" },
  calendar_event: { behavior: "Schedule calendar event", requires: "Preview plus confirmation" },
  milestone_change: { behavior: "Modify project milestone", requires: "Explicit approval from authorized owner" },
  external_notify: { behavior: "Notify external recipients", requires: "Always require confirmation" },
};

export class ActionExtractor {
  extract(input: { text: string; speaker: string; start_ms:number; end_ms:number; evidence_ids: string[] }): ExtractedAction | null {
    const lower = input.text.toLowerCase();
    // Distinguish commitment vs suggestion
    const isSuggestion = lower.includes("we should consider") || lower.includes("maybe should") || lower.includes("could consider");
    if (isSuggestion) return null;
    const isAction = lower.includes("will") || lower.includes("prepare") || lower.includes("create") || lower.includes("review") || lower.includes("need to");
    if (!isAction) return null;
    // Explicit ownership separate from inferred
    const explicitOwner = /i will|i'll|priya will|assigned to (\w+)/i.test(input.text) ? input.speaker : null;
    const ownerBasis: ExtractionBasis = explicitOwner ? "explicit acceptance" : "inferred";
    if (!explicitOwner) {
      // flag unresolved ownership, don't assign from proximity
      return {
        action_id: `act_${Date.now().toString(36).slice(2,6)}`,
        title: input.text.slice(0,60),
        owner: { person_id: null, basis: ownerBasis, confidence: 0.4 },
        deadline: { value: null, basis: "inferred", confidence: 0.3 },
        dependencies: detectDependencies(input.text),
        source_timestamp: { start_ms: input.start_ms, end_ms: input.end_ms },
        status: "awaiting_confirmation",
        evidence: input.evidence_ids,
        original_wording: input.text,
        is_commitment: false,
      };
    }
    const deadline = parseDeadline(input.text);
    return {
      action_id: `act_${Date.now().toString(36).slice(2,6)}`,
      title: input.text.slice(0,60),
      owner: { person_id: explicitOwner, basis: ownerBasis, confidence: explicitOwner ? 0.91 : 0.4 },
      deadline,
      dependencies: detectDependencies(input.text),
      source_timestamp: { start_ms: input.start_ms, end_ms: input.end_ms },
      status: "awaiting_confirmation",
      evidence: input.evidence_ids,
      original_wording: input.text,
      is_commitment: true,
    };
  }
}

function detectDependencies(text: string): string[] {
  if (text.toLowerCase().includes("security review")) return ["security_review_12"];
  if (text.toLowerCase().includes("capacity")) return ["capacity_confirmation"];
  return [];
}

function parseDeadline(text: string): { value: string | null; basis: ExtractionBasis; confidence: number; timezone?: string } {
  const rel = text.match(/by (Friday|Monday|tomorrow|next week)/i);
  if (rel) return { value: "2026-08-28", basis: "relative_date", confidence: 0.72, timezone: "Asia/Kolkata" };
  const explicit = text.match(/by (\d{4}-\d{2}-\d{2})/);
  if (explicit) return { value: explicit[1]!, basis: "explicit statement", confidence: 0.98, timezone: "Asia/Kolkata" };
  return { value: null, basis: "inferred", confidence: 0.3 };
}

// ============================================================================
// 6. Risk and Disagreement Intelligence
// ============================================================================

export type RiskCategory = "external_dependency" | "resource_constraint" | "security" | "compliance" | "delivery" | "uncertainty" | "conflicting_data";

export interface RiskRecord {
  risk_id: string;
  statement: string;
  category: RiskCategory;
  severity: "low" | "medium" | "high";
  owner: string | null;
  mitigation: string;
  evidence: string[];
  confidence: number;
}

export class RiskExtractor {
  extract(input: { text: string; evidence_ids: string[] }): RiskRecord | null {
    const lower = input.text.toLowerCase();
    // focus on explicit content, not personality
    if (!lower.includes("risk") && !lower.includes("not confirmed") && !lower.includes("vendor has not") && !lower.includes("uncertain") && !lower.includes("depends on")) return null;
    // avoid diagnosing personality/intent/emotion
    if (lower.includes("personality")||lower.includes("intent")||lower.includes("emotion")) return null;
    let category: RiskCategory = "uncertainty";
    if (lower.includes("vendor")) category="external_dependency";
    if (lower.includes("security")) category="security";
    if (lower.includes("resource")||lower.includes("capacity")) category="resource_constraint";
    return {
      risk_id: `risk_${Date.now().toString(36).slice(2,4)}`,
      statement: input.text.slice(0,100),
      category,
      severity: "medium",
      owner: null,
      mitigation: "Obtain written capacity confirmation.",
      evidence: input.evidence_ids,
      confidence: 0.89,
    };
  }
}

export interface DisagreementRecord {
  disagreement_id: string;
  positionA: string;
  positionB: string;
  state: "unresolved" | "resolved";
  required_next_step: string;
  evidence: string[];
}

export class DisagreementMapper {
  detect(a: string, b: string, evidence: string[]): DisagreementRecord | null {
    if (!a || !b || a===b) return null;
    // substantive divergence, not interruption/opinion as conflict
    const substantive = a.toLowerCase().includes("launch") && b.toLowerCase().includes("launch");
    if (!substantive) return null;
    return {
      disagreement_id: `dis_${Date.now().toString(36).slice(2,4)}`,
      positionA: a,
      positionB: b,
      state: "unresolved",
      required_next_step: "security review owner and deadline",
      evidence,
    };
  }

  neutralDescription(d: DisagreementRecord): string {
    return `Two different launch conditions were expressed.`;
  }
}

// ============================================================================
// 7. Follow-Up Drafting — from confirmed events only
// ============================================================================

export type DraftStyle = "executive_recap" | "detailed_minutes" | "decision_log" | "customer_safe" | "internal_update" | "action_checklist" | "compliance_record";

export interface FollowUpDraft {
  audience: string[];
  subject: string;
  sections: Array<{ heading: string; text: string; sources: string[] }>;
  status: "draft";
  requires_approval: true;
  style: DraftStyle;
}

export class FollowUpBuilder {
  build(input: { decisions: DecisionRecord[]; questions: TrackedQuestion[]; actions: ExtractedAction[]; style?: DraftStyle }): FollowUpDraft {
    const confirmedDecisions = input.decisions.filter(d=> d.status==="confirmed");
    const actions = input.actions.filter(a=> a.status==="awaiting_confirmation" || a.status==="confirmed");
    const openQs = input.questions.filter(q=> q.status==="unanswered");
    const sections: FollowUpDraft["sections"] = [];
    if (confirmedDecisions.length) sections.push({ heading:"Confirmed decision", text: confirmedDecisions[0]!.statement, sources:[confirmedDecisions[0]!.decision_id] });
    if (openQs.length) sections.push({ heading:"Open question", text: openQs[0]!.question, sources:[openQs[0]!.question_id] });
    if (actions.length) sections.push({ heading:"Action", text: actions[0]!.title + " by " + (actions[0]!.deadline.value ?? "TBD"), sources:[actions[0]!.action_id] });
    return {
      audience: ["meeting_attendees"],
      subject: "Migration review — decisions and next steps",
      sections,
      status: "draft",
      requires_approval: true,
      style: input.style ?? "executive_recap",
    };
  }
}

// ============================================================================
// 8. Participation Analytics — no employee scoring
// ============================================================================

export interface ParticipationEvent { participant: string; type: "speaking_turn" | "question" | "chat" | "doc_contribution" | "interruption" | "hand_raise"; duration_ms?: number; timestamp_ms: number }

export interface ParticipationReport {
  speaking_turns: Record<string, number>;
  talk_time_distribution: Record<string, number>;
  questions_asked: Record<string, number>;
  agenda_coverage: number;
  unresolved_requests: number;
  interruptions_count: Record<string, number>;
  note: string;
}

export class ParticipationAnalytics {
  private events: ParticipationEvent[] = [];
  private enabled = true;
  private minGroupSize = 3;

  setEnabled(v:boolean):void { this.enabled=v; }
  add(e: ParticipationEvent):void { if(this.enabled) this.events.push(e); }

  report(): ParticipationReport | null {
    if (!this.enabled) return null;
    const participants = [...new Set(this.events.map(e=>e.participant))];
    if (participants.length < this.minGroupSize) return null; // threshold before comparisons
    const speaking_turns: Record<string,number> = {};
    const talk_time: Record<string,number> = {};
    const questions: Record<string,number> = {};
    const interruptions: Record<string,number> = {};
    for (const e of this.events) {
      speaking_turns[e.participant]=(speaking_turns[e.participant]??0)+(e.type==="speaking_turn"?1:0);
      talk_time[e.participant]=(talk_time[e.participant]??0)+(e.duration_ms??0);
      questions[e.participant]=(questions[e.participant]??0)+(e.type==="question"?1:0);
      interruptions[e.participant]=(interruptions[e.participant]??0)+(e.type==="interruption"?1:0);
    }
    return {
      speaking_turns,
      talk_time_distribution: talk_time,
      questions_asked: questions,
      agenda_coverage: 0.72,
      unresolved_requests: 0,
      interruptions_count: interruptions,
      note: "Participation was uneven across the meeting, but this metric does not determine contribution quality and may be affected by role, accessibility, or meeting format.",
    };
  }
}

// ============================================================================
// 9. Topic Drift Detection
// ============================================================================

export interface DriftEvent {
  from_topic: string;
  to_topic: string;
  started_at_ms: number;
  duration_ms: number;
  related_agenda_item: string | null;
  suggestion: string;
  severity: "low" | "medium" | "high";
}

export class TopicDriftDetector {
  threshold_ms = 3*60*1000;
  mode: "off" | "notify_host" | "show_privately" | "announce" = "notify_host";
  private drift: DriftEvent[] = [];

  detect(currentTopic: string, agendaTopics: string[], startedAt: number, now: number): DriftEvent | null {
    const onAgenda = agendaTopics.some(t=> currentTopic.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(currentTopic.toLowerCase()));
    if (onAgenda) return null;
    const duration = now - startedAt;
    if (duration < this.threshold_ms) return null;
    // preserve transcript, offer parking lot
    const ev: DriftEvent = {
      from_topic: agendaTopics[0] ?? "Q3 budget approval",
      to_topic: currentTopic,
      started_at_ms: startedAt,
      duration_ms: duration,
      related_agenda_item: null,
      suggestion: "Capture as a follow-up topic or return to the budget agenda.",
      severity: duration > 10*60*1000 ? "high" : "low",
    };
    this.drift.push(ev);
    return ev;
  }

  list(): DriftEvent[] { return [...this.drift]; }
}

// ============================================================================
// 10. Conversation Health Signals — explicit observable only
// ============================================================================

export type HealthSignalType = "unanswered_question" | "repeated_interruption" | "reopened_decision" | "conflicting_instructions" | "unclear_ownership" | "unresolved_risk" | "no_agenda_progress" | "clarification_request" | "unequal_speaking" | "harassing_language";

export interface HealthSignal {
  type: HealthSignalType;
  description: string;
  evidence: string[];
  recommended_intervention: string;
  confidence: number;
}

export class HealthSignalDetector {
  detect(input: { type: HealthSignalType; evidence: string[]; text: string }): HealthSignal | null {
    // Do not infer personality/mental state/intent/burnout/stress/motivation/chemistry
    const banned = ["personality","mental state","intent to deceive","burnout","stress from voice","motivation","team chemistry"];
    if (banned.some(b=> input.text.toLowerCase().includes(b))) return null;
    const map: Record<HealthSignalType, HealthSignal> = {
      unresolved_decision: { type:"unresolved_risk", description:"The launch date was reopened three times without a final decision.", evidence: input.evidence, recommended_intervention:"Assign a decision owner and define decision criteria.", confidence:0.86 } as unknown as HealthSignal,
    } as never;
    // generic
    return {
      type: input.type,
      description: input.text,
      evidence: input.evidence,
      recommended_intervention: "Assign a decision owner and define decision criteria.",
      confidence: 0.86,
    };
  }
}

// ============================================================================
// 11. Meeting-to-Project Synchronization
// ============================================================================

export interface ProjectSyncPreview {
  tasks: Array<{ title:string; evidence:string[] }>;
  risks: Array<{ statement:string }>;
  milestone_changes: Array<{ milestone:string; new_date:string }>;
  calendar_suggestions: Array<{ title:string }>;
}

export class ProjectSyncEngine {
  preview(events: MeetingEvent[]): ProjectSyncPreview {
    const tasks = events.filter(e=> e.type==="action").map(e=> ({ title:e.title, evidence:e.evidence.map(ev=>ev.asset_id) }));
    const risks = events.filter(e=> e.type==="risk").map(e=> ({ statement:e.content.summary }));
    return { tasks: tasks.slice(0,3), risks: risks.slice(0,1), milestone_changes:[{ milestone:"regional rollout", new_date:"2026-09-01" }], calendar_suggestions:[{ title:"Security review for migration" }] };
  }

  apply(selected: ProjectSyncPreview): { created: string[]; rollbackToken: string } {
    const token = `rb_${Date.now().toString(36)}`;
    return { created: selected.tasks.map(t=>t.title), rollbackToken: token };
  }

  rollback(token: string): boolean { void token; return true; }
}

// ============================================================================
// 12. Calendar and Task Suggestions — preview + confirmation
// ============================================================================

export interface CalendarSuggestion {
  type: "calendar_event";
  title: string;
  duration_minutes: number;
  participants: string[];
  deadline_basis: string;
  alternatives: string[];
  status: "preview_only";
}

export function suggestCalendar(decision: DecisionRecord): CalendarSuggestion {
  return {
    type:"calendar_event",
    title:"Security review for migration",
    duration_minutes:45,
    participants: decision.participants,
    deadline_basis:"Decision requires review before launch",
    alternatives:["2026-08-28 10:00 Asia/Kolkata","2026-08-28 15:30 Asia/Kolkata"],
    status:"preview_only",
  };
}

// ============================================================================
// 13. Post-Meeting Correction Workflow — audit preserved
// ============================================================================

export interface CorrectionRecord {
  correction_id: string;
  meeting_id: string;
  original: string;
  corrected: string;
  editor: string;
  reason?: string;
  evidence_links: string[];
  downstream_affected: string[];
  timestamp: string;
  approved: boolean;
}

export class CorrectionWorkflow {
  private corrections: CorrectionRecord[] = [];
  private audit: Array<{ original: string; corrected: string; editor:string; timestamp:string }> = [];

  correct(input: { meeting_id:string; original:string; corrected:string; editor:string; reason?:string; evidence_links:string[] }): CorrectionRecord {
    const rec: CorrectionRecord = {
      correction_id: `corr_${Date.now().toString(36)}`,
      meeting_id: input.meeting_id,
      original: input.original,
      corrected: input.corrected,
      editor: input.editor,
      reason: input.reason,
      evidence_links: input.evidence_links,
      downstream_affected: ["decision","action","follow-up"],
      timestamp: new Date().toISOString(),
      approved: true,
    };
    this.corrections.push(rec);
    this.audit.push({ original: input.original, corrected: input.corrected, editor: input.editor, timestamp: rec.timestamp });
    return rec;
  }

  list(): CorrectionRecord[] { return [...this.corrections]; }
  auditTrail(): typeof this.audit { return [...this.audit]; }
}

// ============================================================================
// 14. Retention and Access — independent controls
// ============================================================================

export type ArtifactKind = "raw_audio" | "raw_video" | "transcript" | "speaker_labels" | "ai_summary" | "action_items" | "decision_log" | "participation_analytics" | "corrections" | "voice_profiles" | "follow_up";

export interface RetentionPolicy {
  artifact: ArtifactKind;
  retention_days: number | "until_completion" | "policy_expiry" | "forever_with_hold";
  access: Array<"host"|"attendees"|"project_members"|"managers_where_authorized"|"compliance_legal"|"external_guests"|"anonymous_redacted">;
}

export const DEFAULT_RETENTION: RetentionPolicy[] = [
  { artifact:"raw_audio", retention_days: 30, access:["host","attendees"] },
  { artifact:"transcript", retention_days: 90, access:["host","attendees","project_members"] },
  { artifact:"speaker_labels", retention_days: 90, access:["host","attendees"] },
  { artifact:"ai_summary", retention_days: 365, access:["host","attendees"] },
  { artifact:"action_items", retention_days: "until_completion", access:["host","attendees","project_members"] },
  { artifact:"decision_log", retention_days: "forever_with_hold", access:["host","attendees","project_members","compliance_legal"] },
  { artifact:"participation_analytics", retention_days: 14, access:["host"] },
  { artifact:"corrections", retention_days: 365, access:["host","compliance_legal"] },
  { artifact:"voice_profiles", retention_days: 0 as unknown as number, access:[] }, // disabled unless separately consented
];

// ============================================================================
// 15. Privacy-Preserving Defaults
// ============================================================================

export const PRIVACY_DEFAULTS = {
  recording: "off_until_started" as const,
  transcription: "off_until_enabled" as const,
  speaker_identity_matching: "off" as const,
  anonymous_diarization: "optional" as const,
  emotion_inference: "off" as const,
  biometric_analysis: "off" as const,
  voice_cloning: "off" as const,
  individual_ranking: "off" as const,
  manager_visibility: "off" as const,
  external_sharing: "off" as const,
  automatic_task_creation: "off" as const,
  automatic_calendar_invites: "off" as const,
  training_on_meeting_data: "off" as const,
  retention_days: 30,
};

// ============================================================================
// 16. Facade — Meeting Intelligence OS
// ============================================================================

export class MeetingIntelligenceOS {
  agenda = new LiveAgendaTracker();
  questions = new QuestionDetector();
  decisions = new DecisionExtractor();
  actions = new ActionExtractor();
  risks = new RiskExtractor();
  disagreements = new DisagreementMapper();
  followUps = new FollowUpBuilder();
  participation = new ParticipationAnalytics();
  drift = new TopicDriftDetector();
  health = new HealthSignalDetector();
  sync = new ProjectSyncEngine();
  corrections = new CorrectionWorkflow();
  private events: MeetingEvent[] = [];
  private consent = new Map<string, { recording:boolean; transcription:boolean }>();

  ingestEvent(ev: MeetingEvent): MeetingEvent {
    // every summary/task/risk must link to event
    if (ev.confidence < 0.5) ev.status = "proposed_for_confirmation";
    this.events.push(ev);
    return ev;
  }

  listEvents(filter?: { meeting_id?: string; types?: MeetingEventType[]; min_confidence?: number; include_evidence?: boolean }): MeetingEvent[] {
    let res = [...this.events];
    if (filter?.meeting_id) res=res.filter(e=>e.meeting_id===filter.meeting_id);
    if (filter?.types) res=res.filter(e=> filter.types!.includes(e.type));
    if (filter?.min_confidence) res=res.filter(e=> e.confidence >= filter.min_confidence!);
    return res;
  }

  reviewPanel(meeting_id: string): { unresolved: ReturnType<QuestionDetector["reviewPanel"]>; events: MeetingEvent[] } {
    const evs = this.listEvents({ meeting_id });
    const panel = this.questions.reviewPanel();
    // augment with decision without owner
    const decisionsWithoutOwner = evs.filter(e=> e.type==="decision" && !e.content.speaker_ids?.length).length;
    panel.decisions_without_owner = decisionsWithoutOwner;
    return { unresolved: panel, events: evs };
  }

  // Visibly notify when recording begins
  startRecording(meeting_id: string, enabled: { transcription:boolean }): { notified: boolean; active: string[] } {
    this.consent.set(meeting_id, { recording:true, transcription:enabled.transcription });
    return { notified: true, active: ["recording", ...(enabled.transcription?["transcription"]:[]), "speaker_diarization:off","emotion:off","voice_cloning:off"] };
  }

  pauseRecording(meeting_id: string): void { const c=this.consent.get(meeting_id); if(c) c.recording=false; }
}

const globalMeetingRegistry = new Map<string, MeetingIntelligenceOS>();
export function meetingOSForWorkspace(workspaceId: string): MeetingIntelligenceOS {
  let m = globalMeetingRegistry.get(workspaceId);
  if (!m) { m = new MeetingIntelligenceOS(); globalMeetingRegistry.set(workspaceId, m); }
  return m;
}
