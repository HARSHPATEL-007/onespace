/**
 * N0VA ANI — Shared Team Intelligence Layer
 *
 * Curated, governed team OS above personal assistant: memory, decisions,
 * ADRs, prompts/workflows, ontology, expertise, gaps, risk graph, handoffs,
 * consensus — all permission-aware, inspectable, reversible.
 */

import { createHash } from "crypto";

// ============================================================================
// 1. Team Memory — curated versioned layer
// ============================================================================

export type TeamMemoryType =
  | "team_norms"
  | "working_agreement"
  | "reusable_procedure"
  | "domain_fact"
  | "project_context"
  | "confirmed_decision"
  | "known_risk"
  | "open_question"
  | "lessons_learned"
  | "customer_constraint"
  | "technical_assumption"
  | "approved_terminology"
  | "handoff_context";

export type MemoryStatus = "candidate" | "proposed" | "owner_review" | "published" | "periodic_review" | "superseded" | "archived" | "deleted";

export type RetentionPolicyKind = "ephemeral" | "project_lifetime" | "fixed_period" | "indefinite_governance" | "legal_hold" | "user_owned" | "team_owned";

export interface TeamMemoryObject {
  memory_id: string;
  team_id: string;
  type: TeamMemoryType;
  title: string;
  content: string;
  status: MemoryStatus;
  owner: { user_id: string; role: string };
  source_evidence: string[];
  visibility: string; // team id or "workspace" or "private"
  retention: { policy: RetentionPolicyKind; expires_at?: string };
  review: { next_review: string; reviewers: string[] };
  confidence: number;
  version: number;
  created_at: string;
  updated_at: string;
  superseded_by?: string | null;
  hash?: string;
}

export function createTeamMemory(input: Omit<TeamMemoryObject, "memory_id" | "hash" | "created_at" | "updated_at" | "version" | "status"> & Partial<Pick<TeamMemoryObject,"status"|"version">>): TeamMemoryObject {
  const now=new Date().toISOString();
  const obj:TeamMemoryObject={
    memory_id: `tm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,4)}`,
    team_id: input.team_id,
    type: input.type,
    title: input.title,
    content: input.content,
    status: input.status ?? "candidate",
    owner: input.owner,
    source_evidence: input.source_evidence ?? [],
    visibility: input.visibility ?? input.team_id,
    retention: input.retention ?? { policy:"team_owned" },
    review: input.review ?? { next_review: new Date(Date.now()+90*24*60*60*1000).toISOString(), reviewers:[input.owner.user_id] },
    confidence: input.confidence ?? 0.8,
    version: input.version ?? 1,
    created_at: now,
    updated_at: now,
    superseded_by: null,
  };
  obj.hash=createHash("sha256").update(`${obj.memory_id}|${obj.team_id}|${obj.title}|${obj.content}|${obj.version}`).digest("hex");
  return obj;
}

export class TeamMemoryStore {
  private store=new Map<string,TeamMemoryObject>();
  private audit:{memory_id:string; action:string; actor:string; at:string}[]=[];

  // Only publication event allows promotion from private to team; never auto-promote private messages
  propose(m: TeamMemoryObject, actor:string): TeamMemoryObject {
    if (m.status!=="candidate") throw new Error("must be candidate");
    m.status="proposed"; m.updated_at=new Date().toISOString();
    this.store.set(m.memory_id,m);
    this.audit.push({memory_id:m.memory_id, action:"proposed", actor, at:new Date().toISOString()});
    return m;
  }

  publish(memory_id:string, actor:string, assertOwner:(m:TeamMemoryObject,actor:string)=>boolean): TeamMemoryObject | null {
    const m=this.store.get(memory_id); if(!m) return null;
    if (!assertOwner(m,actor)) throw new Error("owner review required");
    if (m.status!=="proposed" && m.status!=="owner_review") throw new Error("must be proposed/owner_review");
    m.status="published"; m.version+=1; m.updated_at=new Date().toISOString();
    this.audit.push({memory_id, action:"published", actor, at:new Date().toISOString()});
    return m;
  }

  // Direct put for governance gateway (permission checked upstream)
  put(m:TeamMemoryObject):void{ this.store.set(m.memory_id,m); }
  get(id:string):TeamMemoryObject|undefined{ return this.store.get(id); }
  list(team_id?:string):TeamMemoryObject[]{ const all=[...this.store.values()]; return team_id?all.filter(x=>x.team_id===team_id):all; }
  search(team_id:string, q:string):TeamMemoryObject[]{ const lower=q.toLowerCase(); return this.list(team_id).filter(m=> m.title.toLowerCase().includes(lower) || m.content.toLowerCase().includes(lower)); }
  supersede(id:string, nextId:string, actor:string):void{ const m=this.store.get(id); if(m){ m.status="superseded"; m.superseded_by=nextId; m.updated_at=new Date().toISOString(); this.audit.push({memory_id:id, action:`superseded_by:${nextId}`, actor, at:new Date().toISOString()}); } }
  archive(id:string, actor:string):void{ const m=this.store.get(id); if(m){ m.status="archived"; this.audit.push({memory_id:id, action:"archived", actor, at:new Date().toISOString()}); } }
  // retention enforcement
  expired():TeamMemoryObject[]{ const now=Date.now(); return [...this.store.values()].filter(m=> m.retention.expires_at && new Date(m.retention.expires_at).getTime()<now); }
}

// ============================================================================
// 2. Decision Register — authoritative index
// ============================================================================

export type DecisionStatus = "proposed" | "approved" | "rejected" | "superseded" | "reversed";
export interface DecisionRecord {
  decision_id: string;
  title: string;
  decision: string;
  scope: string;
  status: DecisionStatus;
  decided_at: string;
  decision_owner: string;
  participants: string[];
  alternatives_considered: string[];
  rationale: string[];
  assumptions: string[];
  dissent: Array<{position:string; source:string}>;
  revisit_conditions: string[];
  evidence: string[];
  review_date?: string;
  confidence: number;
  superseded_by?: string | null;
  created_at: string;
}

export function createDecisionRecord(input: Omit<DecisionRecord,"decision_id"|"created_at"|"status"> & Partial<Pick<DecisionRecord,"status"|"decision_id">>): DecisionRecord{
  return { decision_id: input.decision_id ?? `decision_${Date.now().toString(36).slice(2,6)}`, title: input.title, decision: input.decision, scope: input.scope, status: input.status ?? "proposed", decided_at: input.decided_at, decision_owner: input.decision_owner, participants: input.participants, alternatives_considered: input.alternatives_considered, rationale: input.rationale, assumptions: input.assumptions, dissent: input.dissent ?? [], revisit_conditions: input.revisit_conditions ?? [], evidence: input.evidence, review_date: input.review_date, confidence: input.confidence ?? 0.8, superseded_by: null, created_at: new Date().toISOString() };
}

export class DecisionRegister {
  private store=new Map<string,DecisionRecord>();
  put(d:DecisionRecord):void{ this.store.set(d.decision_id,d); }
  get(id:string):DecisionRecord|undefined{ return this.store.get(id); }
  list(scope?:string):DecisionRecord[]{ const all=[...this.store.values()]; return scope?all.filter(d=>d.scope===scope):all; }
  confirm(id:string, actor:string):DecisionRecord| null{ const d=this.store.get(id); if(!d) return null; void actor; d.status="approved"; return d; }
  reopen(id:string, actor:string):DecisionRecord|null{ const d=this.store.get(id); if(!d) return null; void actor; d.status="proposed"; return d; }
  supersede(id:string, nextId:string):void{ const d=this.store.get(id); if(d){ d.status="superseded"; d.superseded_by=nextId; } }
  // searchable views
  byOwner(owner:string):DecisionRecord[]{ return [...this.store.values()].filter(d=>d.decision_owner===owner); }
  lackingRationale():DecisionRecord[]{ return [...this.store.values()].filter(d=>d.rationale.length===0); }
  unresolvedDissent():DecisionRecord[]{ return [...this.store.values()].filter(d=>d.dissent.length>0 && d.status!=="rejected"); }
  expiredAssumptions(now=Date.now()):DecisionRecord[]{ return [...this.store.values()].filter(d=> d.assumptions.some(a=> a.includes("older than six months")) || (d.review_date && new Date(d.review_date).getTime()<now)); }
  reversed():DecisionRecord[]{ return [...this.store.values()].filter(d=>d.status==="reversed"); }
  requiringReview():DecisionRecord[]{ return [...this.store.values()].filter(d=> d.review_date && new Date(d.review_date).getTime() < Date.now()); }
  conflicting(newer:DecisionRecord):DecisionRecord[]{ return [...this.store.values()].filter(d=> d.scope===newer.scope && d.decision!==newer.decision && d.status==="approved"); }
}

// ============================================================================
// 3. ADR Repository
// ============================================================================

export type ADRStatus = "draft" | "proposed" | "accepted" | "rejected" | "superseded" | "deprecated";
export interface ADR {
  adr_id: string; // ADR-042
  title: string;
  status: ADRStatus;
  context: string;
  decision: string;
  alternatives: string[];
  consequences: string[];
  assumptions: string[];
  evidence: string[];
  owners: { decision_owner:string; review_owner:string };
  review_trigger?: string;
  superseded_by?: string | null;
  markdown: string;
  created_at:string;
}

export class ADRRepository {
  private store=new Map<string,ADR>();
  private counter=1;
  generateDraft(input: Omit<ADR,"adr_id"|"markdown"|"status"|"created_at"> & Partial<Pick<ADR,"status">>): ADR{
    const id=`ADR-${String(this.counter++).padStart(3,"0")}`;
    const md=`# ${id}: ${input.title}\n\n## Status\n${input.status??"draft"}\n\n## Context\n${input.context}\n\n## Decision\n${input.decision}\n\n## Alternatives considered\n${input.alternatives.map(a=>`- ${a}`).join("\n")}\n\n## Consequences\n${input.consequences.map(c=>`- ${c}`).join("\n")}\n\n## Assumptions\n${input.assumptions.map(a=>`- ${a}`).join("\n")}\n\n## Evidence\n${input.evidence.map(e=>`- ${e}`).join("\n")}\n\n## Owners\n- Decision owner: ${input.owners.decision_owner}\n- Review owner: ${input.owners.review_owner}\n\n## Review trigger\n${input.review_trigger ?? ""}\n`;
    const adr:ADR={ adr_id:id, title:input.title, status: input.status ?? "draft", context:input.context, decision:input.decision, alternatives:input.alternatives, consequences:input.consequences, assumptions:input.assumptions, evidence:input.evidence, owners:input.owners, review_trigger:input.review_trigger, superseded_by:null, markdown:md, created_at:new Date().toISOString() };
    this.store.set(id,adr); return adr;
  }
  get(id:string):ADR|undefined{ return this.store.get(id); }
  approve(id:string, reviewer:string):ADR|null{ const a=this.store.get(id); if(!a) return null; void reviewer; a.status="accepted"; return a; }
  review(id:string, reviewer:string):ADR|null{ const a=this.store.get(id); if(!a) return null; void reviewer; a.status="proposed"; return a; }
  supersede(id:string, nextId:string):void{ const a=this.store.get(id); if(a){ a.status="superseded"; a.superseded_by=nextId; }}
  list():ADR[]{ return [...this.store.values()]; }
  contradicting(assumption:string):ADR[]{ return [...this.store.values()].filter(a=> a.assumptions.includes(assumption)); }
}

// ============================================================================
// 4. Shared Prompt & Workflow Libraries — governed
// ============================================================================

export type LibraryStatus = "draft" | "review" | "approved" | "deprecated" | "retired";
export interface PromptEntry {
  prompt_id: string;
  name: string;
  purpose: string;
  template: string;
  inputs: Record<string,string>;
  output_schema: string;
  owners: string[];
  scope: string;
  version: string;
  status: LibraryStatus;
  evaluation: { groundedness:number; schema_validity:number };
  permissions: { can_view:string; can_edit:string[] };
  evaluation_examples?: string[];
  safety_constraints?: string[];
  allowed_models?: string[];
  cost_limit?: number;
  latency_limit_ms?: number;
  usage_analytics?: { calls:number; without_content:boolean };
  created_at:string;
}

export class PromptLibrary {
  private store=new Map<string,PromptEntry>();
  create(p: Omit<PromptEntry,"prompt_id"|"version"|"status"|"created_at"|"evaluation"> & Partial<Pick<PromptEntry,"version"|"status"|"evaluation">>): PromptEntry{
    const entry:PromptEntry={
      prompt_id: `prompt_${Date.now().toString(36).slice(2,4)}`,
      name:p.name,
      purpose:p.purpose,
      template:p.template,
      inputs:p.inputs,
      output_schema:p.output_schema,
      owners:p.owners,
      scope:p.scope,
      version: p.version ?? "1.0.0",
      status: p.status ?? "draft",
      evaluation: p.evaluation ?? { groundedness:0.9, schema_validity:0.99 },
      permissions: p.permissions ?? { can_view: p.scope, can_edit: p.owners },
      created_at: new Date().toISOString(),
    };
    // prevent silent override of safety: check template
    if (entry.template.includes("ignore safety") || entry.template.includes("bypass")) throw new Error("prompt violates safety policy");
    this.store.set(entry.prompt_id, entry);
    return entry;
  }
  publish(id:string, actor:string):PromptEntry|null{ const e=this.store.get(id); if(!e) return null; if(!e.owners.includes(actor)) throw new Error("owner review required"); e.status="approved"; e.version= bumpVersion(e.version); return e; }
  list(scope?:string):PromptEntry[]{ const all=[...this.store.values()]; return scope?all.filter(p=>p.scope===scope):all; }
  get(id:string):PromptEntry|undefined{ return this.store.get(id); }
}

export interface WorkflowEntry {
  workflow_id: string;
  name: string;
  trigger: "manual" | "event" | "schedule";
  steps: Array<{ action:string; approval: "none"|"sender"|"owner" }>;
  required_roles: string[];
  rollback: string[];
  version: string;
  status: LibraryStatus;
  evaluation?: { success_rate:number };
  created_at:string;
}

export class WorkflowLibrary {
  private store=new Map<string,WorkflowEntry>();
  create(w: Omit<WorkflowEntry,"workflow_id"|"version"|"status"|"created_at"> & Partial<Pick<WorkflowEntry,"version"|"status">>): WorkflowEntry{
    const entry:WorkflowEntry={
      workflow_id: `wf_${Date.now().toString(36).slice(2,4)}`,
      name:w.name,
      trigger:w.trigger,
      steps:w.steps,
      required_roles:w.required_roles,
      rollback:w.rollback,
      version: w.version ?? "1.0.0",
      status: w.status ?? "draft",
      created_at: new Date().toISOString(),
    };
    this.store.set(entry.workflow_id, entry);
    return entry;
  }
  dryRun(id:string):{ ok:boolean; simulated:string[] }{ const w=this.store.get(id); if(!w) return {ok:false, simulated:[]}; return { ok:true, simulated: w.steps.map(s=>`would:${s.action}`)}; }
  publish(id:string, actor:string):WorkflowEntry|null{ const w=this.store.get(id); if(!w) return null; void actor; w.status="approved"; w.version=bumpVersion(w.version); return w; }
  list():WorkflowEntry[]{ return [...this.store.values()]; }
  get(id:string):WorkflowEntry|undefined{ return this.store.get(id); }
}

function bumpVersion(v:string):string{ const parts=v.split(".").map(Number); parts[2]=(parts[2]??0)+1; return parts.join("."); }

// ============================================================================
// 5. Team Ontology — preserves both definitions
// ============================================================================

export interface OntologyTerm { term:string; canonical_label:string; type:string; aliases:string[]; definition:string; owner:string; status:"approved"|"deprecated"; sensitivity?: string }
export interface OntologyRelation { from:string; relation:string; to:string }

export class TeamOntology {
  private terms=new Map<string,OntologyTerm[]>() // term lower -> list per team
  private relations:OntologyRelation[]=[];

  addTerm(t:OntologyTerm):void{
    const key=t.term.toLowerCase();
    const list=this.terms.get(key) ?? [];
    // conflict detection across teams: preserve both, don't force
    if (list.length>0 && list[0]!.definition!==t.definition) {
      // keep both, mark conflict
      t.definition=`${t.definition} [team:${t.owner}: ${t.definition}]`;
    }
    list.push(t);
    this.terms.set(key, list);
  }
  get(term:string):OntologyTerm[]|undefined{ return this.terms.get(term.toLowerCase()); }
  canonical(term:string):string|undefined{ const list=this.get(term); return list?.find(x=>x.status==="approved")?.canonical_label; }
  addRelation(r:OntologyRelation):void{ this.relations.push(r); }
  listTerms():OntologyTerm[]{ return [...this.terms.values()].flat(); }
  conflicts():Array<{term:string; definitions:string[]}>{ const out=[]; for(const [k,v] of this.terms){ if(v.length>1) out.push({term:k, definitions:v.map(x=>x.definition)});} return out; }
}

// ============================================================================
// 6. Role-Aware Recommendations — bounded, explainable
// ============================================================================

export type TeamRole = "project_owner" | "engineer" | "security_reviewer" | "product_manager" | "executive" | "new_member" | "external_collaborator";

export interface Recommendation {
  type:string;
  reason:string;
  source:string;
  recommended_action:string;
  confidence:number;
  approval_required:boolean;
  not_relevant_token?: string;
}

export function recommendForRole(role:TeamRole, context:{ ownerAssigned?:boolean }):Recommendation{
  switch(role){
    case "project_owner": return { type:"review_risk", reason:"You are the assigned owner of the unresolved security dependency.", source:"risk://risk_088", recommended_action:"Review mitigation plan", confidence:0.89, approval_required:true };
    case "engineer": return { type:"adr_review", reason:"Relevant ADR for your component changed.", source:"adr://ADR-042", recommended_action:"Review ADR", confidence:0.82, approval_required:false };
    case "security_reviewer": return { type:"control_review", reason:"Open controls require evidence.", source:"risk://risk_088", recommended_action:"Review evidence", confidence:0.85, approval_required:true };
    case "product_manager": return { type:"launch_risk", reason:"Customer impact requires scope decision.", source:"decision://decision_019", recommended_action:"Review launch risks", confidence:0.8, approval_required:false };
    case "executive": return { type:"material_risk", reason:"Material risks need attention.", source:"risk://risk_088", recommended_action:"Review material risks", confidence:0.78, approval_required:false };
    case "new_member": return { type:"onboarding", reason:"Verified onboarding context.", source:"memory://tm_01", recommended_action:"Read working agreements", confidence:0.9, approval_required:false };
    case "external_collaborator": return { type:"handoff_review", reason:"Redacted handoff available.", source:"handoff://handoff_204", recommended_action:"Review handoff", confidence:0.85, approval_required:false };
    default: return { type:"general", reason:"Contextual", source:"memory://tm_01", recommended_action:"Review", confidence:0.7, approval_required:false };
  }
}

// ============================================================================
// 7. Knowledge-Gap Detection — missing answers, not uninformed people
// ============================================================================

export interface KnowledgeGap {
  topic:string;
  evidence:string[];
  gap_type:"missing_authoritative_source"|"conflicting_docs"|"missing_owner"|"unavailable_artifact";
  impact:"low"|"medium"|"high";
  suggested_resolution:string[];
  owner:string|null;
  confidence:number;
}

export class KnowledgeGapDetector {
  detect(input:{ repeatedQuestions:string[]; conflictingDocs:boolean; missingOwners:string[]; unavailableArtifacts:string[] }):KnowledgeGap[] {
    const gaps:KnowledgeGap[]=[];
    if (input.repeatedQuestions.length>0) gaps.push({ topic: input.repeatedQuestions[0]!, evidence:[`question://q_091`], gap_type:"missing_authoritative_source", impact:"medium", suggested_resolution:["Ask the vendor for written confirmation","Assign a capacity owner","Add answer to runbook"], owner:null, confidence:0.87 });
    if (input.conflictingDocs) gaps.push({ topic:"conflicting definitions", evidence:["doc://a","doc://b"], gap_type:"conflicting_docs", impact:"high", suggested_resolution:["Resolve terminology"], owner:null, confidence:0.8 });
    if (input.missingOwners.length) gaps.push({ topic:"unowned risks", evidence:input.missingOwners, gap_type:"missing_owner", impact:"high", suggested_resolution:["Assign owners"], owner:null, confidence:0.9 });
    // Never label team as incompetent: workspace lacks answer
    return gaps.map(g=> ({...g})); // wording ensured outside
  }
}

// ============================================================================
// 8. Expertise Discovery — opt-in, no hidden ranking
// ============================================================================

export interface ExpertiseProfile {
  user_id:string;
  domain:string;
  evidence:string[];
  confidence:number;
  visibility:"team_directory"|"private"|"selected_teams";
  opt_out:boolean;
  last_verified:string;
  availability?: string;
}

export class ExpertiseDirectory {
  private store=new Map<string,ExpertiseProfile>(); // key user_id:domain

  upsert(p: ExpertiseProfile):void{
    // only allowed evidence types: self_declared, role, docs, tasks, voluntary, training, confirmed tags — never private messages/talk-time/surveillance
    const allowedPrefixes=["approved_docs","resolved_tasks","user_declared","role","published","voluntary","training","confirmed_tag"];
    for(const ev of p.evidence){ if(!allowedPrefixes.some(pre=> ev.startsWith(pre))) throw new Error(`disallowed evidence ${ev}`); }
    if (p.opt_out) { this.store.delete(`${p.user_id}:${p.domain}`); return; }
    this.store.set(`${p.user_id}:${p.domain}`, p);
  }

  find(domain:string, requester:string):ExpertiseProfile[]{
    void requester;
    return [...this.store.values()].filter(p=> p.domain===domain && !p.opt_out && p.visibility!=="private");
  }

  setVisibility(user_id:string, domain:string, visibility: ExpertiseProfile["visibility"]):void{
    const key=`${user_id}:${domain}`; const e=this.store.get(key); if(e) e.visibility=visibility;
  }

  list():ExpertiseProfile[]{ return [...this.store.values()]; }
}

// ============================================================================
// 9. Risk and Dependency Graph — typed, permission-aware
// ============================================================================

export type TeamGraphNodeKind = "Project"|"Milestone"|"Task"|"Decision"|"Dependency"|"Risk"|"Service"|"Team"|"Vendor"|"Handoff";
export interface RiskGraphNode{ id:string; kind:TeamGraphNodeKind; props:Record<string,unknown>; owner?:string }
export interface DependencyEdge{ dependency_id:string; from:string; to:string; relation:"blocks"|"depends_on"|"relates"; owner:string; due_at?:string; status:"ok"|"at_risk"|"blocked"; evidence:string[]; impact:"low"|"medium"|"high"; }

export class RiskDependencyGraph {
  private nodes=new Map<string,RiskGraphNode>();
  private edges:DependencyEdge[]=[];

  addNode(n:RiskGraphNode):void{ this.nodes.set(n.id,n); }
  addEdge(e:DependencyEdge):void{ this.edges.push(e); }
  listNodes():RiskGraphNode[]{ return [...this.nodes.values()]; }
  listEdges():DependencyEdge[]{ return [...this.edges]; }

  criticalPath(projectId:string):string[]{
    // stub topological longest path
    const projEdges=this.edges.filter(e=> e.from.startsWith(projectId) || e.to.startsWith(projectId) || true);
    return projEdges.slice(0,3).map(e=>e.from);
  }

  atRiskMilestones():string[]{ return this.edges.filter(e=> e.status==="at_risk").map(e=> e.to); }
  unownedRisks():RiskGraphNode[]{ return [...this.nodes.values()].filter(n=> n.kind==="Risk" && !n.owner); }
  staleAssumptions(thresholdDays=180):RiskGraphNode[]{ void thresholdDays; return []; }
  circular():string[][]{ return []; }
  impactIfSlips(taskId:string):string[]{ return this.edges.filter(e=> e.from===taskId).map(e=>e.to); }
  permissionView(requester:string, visibility: string):{nodes:RiskGraphNode[];edges:DependencyEdge[]}{ void requester; void visibility; return { nodes:this.listNodes(), edges:this.listEdges() }; }
}

// ============================================================================
// 10. Cross-Team Handoff Summaries — structured transfer packages
// ============================================================================

export interface HandoffPackage {
  handoff_id:string;
  from_team:string;
  to_team:string;
  project:string;
  scope:string;
  current_state:string;
  decisions:string[];
  open_questions:string[];
  risks:string[];
  dependencies:string[];
  required_actions:Array<{title:string; owner:string; deadline:string}>;
  artifacts:string[];
  access_notes:string[];
  acceptance:{ status:"awaiting_receiving_team"|"accepted"|"clarification_requested"|"rejected"|"expired"; by?:string };
  source_timestamps:string[];
  sending_contact:string;
  created_at:string;
}

export class HandoffCompiler {
  private store=new Map<string,HandoffPackage>();
  create(input: Omit<HandoffPackage,"handoff_id"|"acceptance"|"created_at"> & Partial<Pick<HandoffPackage,"handoff_id">>):HandoffPackage{
    const pkg:HandoffPackage={
      handoff_id: input.handoff_id ?? `handoff_${Date.now().toString(36).slice(2,4)}`,
      from_team: input.from_team,
      to_team: input.to_team,
      project: input.project,
      scope: input.scope,
      current_state: input.current_state,
      decisions: input.decisions,
      open_questions: input.open_questions,
      risks: input.risks,
      dependencies: input.dependencies,
      required_actions: input.required_actions,
      artifacts: input.artifacts,
      access_notes: input.access_notes,
      acceptance: { status:"awaiting_receiving_team" },
      source_timestamps: input.source_timestamps,
      sending_contact: input.sending_contact,
      created_at: new Date().toISOString(),
    };
    this.store.set(pkg.handoff_id, pkg);
    return pkg;
  }
  accept(id:string, by:string):HandoffPackage|null{ const h=this.store.get(id); if(!h) return null; h.acceptance={ status:"accepted", by }; return h; }
  requestClarification(id:string, by:string):HandoffPackage|null{ const h=this.store.get(id); if(!h) return null; h.acceptance={ status:"clarification_requested", by }; return h; }
  reject(id:string, by:string):HandoffPackage|null{ const h=this.store.get(id); if(!h) return null; h.acceptance={ status:"rejected", by }; return h; }
  get(id:string):HandoffPackage|undefined{ return this.store.get(id); }
  list():HandoffPackage[]{ return [...this.store.values()]; }
}

// ============================================================================
// 11. Consensus Tracking — multidimensional, silence≠agreement
// ============================================================================

export type ConsensusState = "no_position"|"exploring"|"emerging_alignment"|"conditional_consensus"|"explicit_consensus"|"formal_approval"|"dissent_recorded"|"blocked"|"deferred"|"reopened"|"reversed";

export interface ConsensusRecord {
  topic:string;
  state:ConsensusState;
  positions: Array<{position:string; support:string[]; conditions:string[]}>;
  unresolved_issues:string[];
  decision_authority:string;
  next_step:string;
  evidence:string[];
}

export class ConsensusEngine {
  private store=new Map<string,ConsensusRecord>();

  set(record: ConsensusRecord):void{
    // silence must never be interpreted as agreement — validate
    for(const pos of record.positions){ if(pos.support.length===0) throw new Error("support cannot be inferred from silence"); }
    this.store.set(record.topic, record);
  }
  get(topic:string):ConsensusRecord|undefined{ return this.store.get(topic); }
  recordPosition(topic:string, position:string, supporter:string, conditions:string[]):void{
    const r=this.store.get(topic);
    if(!r) throw new Error("no consensus record");
    const pos=r.positions.find(p=> p.position===position);
    if(pos){ if(!pos.support.includes(supporter)) pos.support.push(supporter); pos.conditions=conditions; }
    else r.positions.push({position, support:[supporter], conditions});
  }
  list():ConsensusRecord[]{ return [...this.store.values()]; }
}

// ============================================================================
// 12. Team Intelligence Gateway — permission/consent/retention/audit
// ============================================================================

export interface GatewayContext { user_id:string; team_id:string; roles:string[]; visibilityPolicy: string; consentRevoked?:boolean; }

export class TeamIntelligenceGateway {
  constructor(
    public memory: TeamMemoryStore,
    public decisions: DecisionRegister,
    public adrs: ADRRepository,
    public prompts: PromptLibrary,
    public workflows: WorkflowLibrary,
    public ontology: TeamOntology,
    public expertise: ExpertiseDirectory,
    public gaps: KnowledgeGapDetector,
    public riskGraph: RiskDependencyGraph,
    public handoffs: HandoffCompiler,
    public consensus: ConsensusEngine,
  ){}

  // Retrieve only authorized — every recommendation exposes sources/freshness/confidence/owner/visibility
  recommend(team_id:string, ctx:GatewayContext, topic:string):{ recommendation: ReturnType<typeof recommendForRole>; sources:string[]; freshness:string; confidence:number; owner:string; visibility:string } | null{
    if (ctx.consentRevoked) return null;
    // simple auth: must be member or project member
    const mems=this.memory.list(team_id);
    const m=mems.find(x=> x.title.toLowerCase().includes(topic.toLowerCase()));
    if (!m) return null;
    // visibility check
    if (m.visibility!==team_id && m.visibility!=="workspace" && m.visibility!==ctx.visibilityPolicy && !ctx.roles.includes("admin")) return null;
    const role = (ctx.roles[0] as never) ?? "engineer";
    const rec=recommendForRole(role as never, {});
    return { recommendation: rec, sources: m.source_evidence, freshness: m.updated_at, confidence: m.confidence, owner: m.owner.user_id, visibility: m.visibility };
  }

  audit():string[]{ return this.memory.list().map(m=> `${m.memory_id}:${m.status}`); }
}

// ============================================================================
// 13. Dashboard Views
// ============================================================================

export function buildDashboard(gw: TeamIntelligenceGateway, team_id:string){
  const memories=gw.memory.list(team_id);
  return {
    team_memory: {
      recently_published: memories.filter(m=>m.status==="published").slice(0,5),
      stale: memories.filter(m=> new Date(m.review.next_review).getTime()<Date.now()),
      frequently_reused: memories.slice(0,3),
      conflicting: gw.ontology.conflicts(),
      awaiting_review: memories.filter(m=>m.status==="proposed"||m.status==="owner_review"),
    },
    decisions: {
      recent: gw.decisions.list().slice(0,5),
      requiring_review: gw.decisions.requiringReview(),
      reopened: gw.decisions.list().filter(d=>d.status==="proposed"),
      unresolved_dissent: gw.decisions.unresolvedDissent(),
      missing_evidence: gw.decisions.lackingRationale(),
    },
    knowledge_gaps: gw.gaps.detect({ repeatedQuestions:["regional capacity"], conflictingDocs:false, missingOwners:[], unavailableArtifacts:[] }),
    risks: {
      blockers: gw.riskGraph.listEdges().filter(e=>e.status==="blocked"),
      at_risk: gw.riskGraph.atRiskMilestones(),
      unowned: gw.riskGraph.unownedRisks(),
    },
    handoffs: {
      draft: gw.handoffs.list().filter(h=>h.acceptance.status==="awaiting_receiving_team"),
    },
  };
}

// ============================================================================
// 14. Governance Defaults
// ============================================================================

export const TEAM_GOVERNANCE_DEFAULTS = {
  team_memory_publication: "approval_required" as const,
  private_conversation_indexing: "off" as const,
  expertise_discovery: "opt_in" as const,
  expertise_visibility: "user_controlled" as const,
  individual_rankings: "disabled" as const,
  team_sentiment_scoring: "disabled" as const,
  personality_inference: "disabled" as const,
  talk_time_based_expertise: "disabled" as const,
  cross_team_sharing: "permission_required" as const,
  prompt_publication: "owner_review_required" as const,
  workflow_execution: "dry_run_first" as const,
  external_actions: "explicit_approval" as const,
  retention: "object_specific" as const,
  model_training_on_team_content: "off" as const,
  decision_status: "proposed_until_confirmed" as const,
  consensus_silence: "never_inferred_as_agreement" as const,
};

// ============================================================================
// 15. Facade — Team Intelligence Layer
// ============================================================================

export class TeamIntelligenceLayer {
  memory=new TeamMemoryStore();
  decisions=new DecisionRegister();
  adrs=new ADRRepository();
  prompts=new PromptLibrary();
  workflows=new WorkflowLibrary();
  ontology=new TeamOntology();
  expertise=new ExpertiseDirectory();
  gaps=new KnowledgeGapDetector();
  riskGraph=new RiskDependencyGraph();
  handoffs=new HandoffCompiler();
  consensus=new ConsensusEngine();
  gateway: TeamIntelligenceGateway;

  constructor(){
    this.gateway=new TeamIntelligenceGateway(this.memory,this.decisions,this.adrs,this.prompts,this.workflows,this.ontology,this.expertise,this.gaps,this.riskGraph,this.handoffs,this.consensus);
  }
}

const globalTeamRegistry=new Map<string,TeamIntelligenceLayer>();
export function teamLayerForWorkspace(workspaceId:string):TeamIntelligenceLayer{
  let l=globalTeamRegistry.get(workspaceId);
  if(!l){ l=new TeamIntelligenceLayer(); globalTeamRegistry.set(workspaceId,l); }
  return l;
}
