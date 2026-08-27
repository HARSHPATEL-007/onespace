/**
 * N0VA ANI — Unified Interaction Surface
 *
 * One consistent contract across Docs/Sheets/Mail/CRM/Meet/mobile.
 * Predictable controls, explicit consent, accessibility, reversibility.
 */

// ============================================================================
// 1. Interaction Contract — states & shape
// ============================================================================

export type InteractionState = "available" | "previewing" | "awaiting_confirmation" | "executing" | "completed" | "failed" | "undo_available" | "reversed";
export type Surface = "side_panel" | "command_palette" | "inline" | "floating_button" | "voice" | "mobile" | "ambient";
export type Risk = "low" | "medium" | "high" | "critical";

export interface Interaction {
  id: string;
  surface: Surface;
  capability: string;
  context: { module: string; document_id?: string; selection?: string; project_id?: string; meeting_id?: string };
  state: InteractionState;
  reason: string;
  confidence: "low"|"medium"|"high";
  risk: Risk;
  actions: Array<"accept"|"edit"|"dismiss"|"undo"|"redo">;
  undo: { available: boolean; expires_at?: string; inverse_action?: string; requires_confirmation?: boolean };
  side_effect?: string; // e.g., create_draft
  where_result_appears?: string;
}

export function createInteraction(input: Omit<Interaction,"id"|"state"|"actions"|"undo"> & Partial<Pick<Interaction,"state"|"actions"|"undo"|"id">>): Interaction {
  return {
    id: (input as unknown as {id?:string}).id ?? `int_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,4)}`,
    surface: input.surface,
    capability: input.capability,
    context: input.context,
    state: input.state ?? "previewing",
    reason: input.reason,
    confidence: input.confidence ?? "high",
    risk: input.risk ?? "low",
    actions: input.actions ?? ["accept","edit","dismiss"],
    undo: input.undo ?? { available: false },
    side_effect: input.side_effect,
    where_result_appears: input.where_result_appears ?? "side_panel",
  };
}

// ============================================================================
// 2. Context Resolver & Controls — visible context bar
// ============================================================================

export type ContextSource = "selected_text" | "current_document" | "current_thread" | "current_meeting" | "current_project" | "team_memory" | "connected_apps" | "web_search" | "no_memory" | "session_temp";

export interface ContextState {
  sources: Record<ContextSource, boolean>;
  exclude?: string[];
}

export const DEFAULT_CONTEXT: ContextState = {
  sources: { selected_text:true, current_document:true, current_thread:false, current_meeting:false, current_project:false, team_memory:false, connected_apps:false, web_search:false, no_memory:false, session_temp:false },
};

export class ContextResolver {
  private state: ContextState = JSON.parse(JSON.stringify(DEFAULT_CONTEXT));
  get():ContextState{ return JSON.parse(JSON.stringify(this.state)); }
  toggle(src:ContextSource, on:boolean):void{ this.state.sources[src]=on; if(on && src==="no_memory"){ for(const k of Object.keys(this.state.sources) as ContextSource[]){ if(k!=="no_memory") this.state.sources[k]=false; } } }
  bar():string{ const on=Object.entries(this.state.sources).filter(([,v])=>v).map(([k])=>k).join(", "); return `Using: ${on || "none"} ✓ Selected text ✓ Current document ○ Workspace knowledge ○ Connected apps ○ Web search`; }
}

// ============================================================================
// 3. Capability Registry & Command Router — structured capabilities
// ============================================================================

export interface CommandDef {
  id: string; // docs.create_summary
  label: string;
  module: string;
  risk: Risk;
  requires_selection: boolean;
  side_effect: string;
  undo: string;
  confirmation: "optional"|"required"|"none";
  aliases?: string[];
}

export class CapabilityRegistry {
  private cmds=new Map<string,CommandDef>();
  register(c:CommandDef):void{ this.cmds.set(c.id,c); }
  list(module?:string):CommandDef[]{ const all=[...this.cmds.values()]; return module?all.filter(c=>c.module===module):all; }
  resolve(query:string, ctx:{ module:string; hasSelection:boolean; role:string }): CommandDef[] {
    const lower=query.toLowerCase();
    return [...this.cmds.values()].filter(c=>{
      if(c.requires_selection && !ctx.hasSelection) return false;
      const hay=`${c.label} ${c.id} ${(c.aliases??[]).join(" ")}`.toLowerCase();
      return hay.includes(lower) || lower.split(/\s+/).every(tok=> hay.includes(tok));
    }).sort((a,b)=> a.label.localeCompare(b.label));
  }
}

// ============================================================================
// 4. Permission Checker — plain language
// ============================================================================

export interface PermissionState {
  canRead:boolean;
  canCreateDraft:boolean;
  canSendWithoutApproval:boolean;
  canAccessHR:boolean;
  message?:string;
}

export function permissionMessage(p:PermissionState):string{
  if(!p.canSendWithoutApproval) return "I can prepare the report, but I cannot access the restricted finance folder with your current permissions.";
  if(!p.canAccessHR) return "ANI can: ✓ Read this document ✓ Create a draft ✗ Send email without approval ✗ Access private HR records";
  return "ANI can: ✓ Read this document ✓ Create a draft";
}

// ============================================================================
// 5. Suggestion Manager — inline states
// ============================================================================

export type SuggestionState = "generated"|"visible"|"accepted"|"edited"|"dismissed"|"expired"|"reverted";

export interface Suggestion {
  id:string;
  text:string;
  state:SuggestionState;
  context:string;
  confidence: ConfidenceBand;
  source:string;
  actions: Array<"accept"|"edit"|"dismiss"|"why">;
  why?:string;
  undo_available?:boolean;
}

type ConfidenceBand = "high"|"moderate"|"low";

export class SuggestionManager {
  private items=new Map<string,Suggestion>();
  create(text:string, context:string, confidence:ConfidenceBand="high"):Suggestion{
    const s:Suggestion={ id:`sug_${Date.now().toString(36)}`, text, state:"generated", context, confidence, source:context, actions:["accept","edit","dismiss","why"], why:`You selected six paragraphs containing unresolved action items.`, undo_available:false };
    this.items.set(s.id,s);
    // visible immediately unless policy says otherwise (not auto-open for minor events)
    s.state="visible";
    return s;
  }
  accept(id:string):Suggestion|null{ const s=this.items.get(id); if(!s) return null; s.state="accepted"; s.undo_available=true; return s; }
  edit(id:string, newText:string):Suggestion|null{ const s=this.items.get(id); if(!s) return null; s.text=newText; s.state="edited"; return s; }
  dismiss(id:string):Suggestion|null{ const s=this.items.get(id); if(!s) return null; s.state="dismissed"; return s; }
  revert(id:string):Suggestion|null{ const s=this.items.get(id); if(!s) return null; s.state="reverted"; return s; }
  list():Suggestion[]{ return [...this.items.values()]; }
}

// ============================================================================
// 6. Approval & Undo Managers
// ============================================================================

export class ApprovalManager {
  private pending=new Map<string,Interaction>();
  request(i:Interaction):void{ i.state="awaiting_confirmation"; this.pending.set(i.id,i); }
  approve(id:string):Interaction|null{ const i=this.pending.get(id); if(!i) return null; i.state="executing"; setTimeout(()=> i.state="completed", 10); return i; }
  reject(id:string):Interaction|null{ const i=this.pending.get(id); if(!i) return null; i.state="failed"; return i; }
  list():Interaction[]{ return [...this.pending.values()]; }
}

export interface UndoEntry { action_id:string; type:string; status:"completed"|"reversed"; undo_available:boolean; expires_at?:string; inverse_action?:string; requires_confirmation?:boolean; }

export class UndoManager {
  private history:UndoEntry[]=[];
  push(e:UndoEntry):void{ this.history.push(e); }
  undo(action_id:string):UndoEntry|null{
    const e=this.history.find(x=>x.action_id===action_id);
    if(!e || !e.undo_available) return null;
    if(e.expires_at && new Date(e.expires_at).getTime() < Date.now()) return null;
    e.status="reversed";
    return e;
  }
  redo(action_id:string):UndoEntry|null{
    const e=this.history.find(x=>x.action_id===action_id);
    if(!e || e.status!=="reversed") return null;
    e.status="completed";
    return e;
  }
  list():UndoEntry[]{ return [...this.history]; }
}

// ============================================================================
// 7. Activity History — global across modules
// ============================================================================

export interface ActivityItem {
  timestamp:string;
  module:string;
  user_request:string;
  context_used:string;
  model_or_workflow:string;
  tools_called:string[];
  approval?:string;
  side_effect?:string;
  status: InteractionState;
  undo_available:boolean;
  source:string;
  privacy_classification:string;
  error?:string;
}

export class ActivityHistory {
  private items:ActivityItem[]=[];
  add(a:ActivityItem):void{ this.items.push(a); }
  list(filter?: Partial<Pick<ActivityItem,"module"|"status">>):ActivityItem[]{
    let res=[...this.items];
    if(filter?.module) res=res.filter(i=>i.module===filter.module);
    if(filter?.status) res=res.filter(i=>i.status===filter.status);
    return res.sort((a,b)=> b.timestamp.localeCompare(a.timestamp));
  }
  export():ActivityItem[]{ return [...this.items]; }
}

// ============================================================================
// 8. Notification Policy — quiet hours, digest, sensitive preview false
// ============================================================================

export interface NotificationPolicy {
  quiet_hours:{ enabled:boolean; start:string; end:string; timezone:string };
  channels:{ in_app:boolean; email:boolean; push:boolean; voice:boolean };
  frequency:{ maximum_per_hour:number; group_similar:boolean };
  exceptions:string[];
  sensitive_preview:boolean;
}

export const DEFAULT_NOTIFICATION_POLICY: NotificationPolicy = {
  quiet_hours:{ enabled:true, start:"20:00", end:"08:00", timezone:"Asia/Kolkata"},
  channels:{ in_app:true, email:false, push:false, voice:false},
  frequency:{ maximum_per_hour:3, group_similar:true},
  exceptions:["security_incident","approval_expiring","critical_system_failure"],
  sensitive_preview:false,
};

export class NotificationPolicyManager {
  policy:NotificationPolicy={...DEFAULT_NOTIFICATION_POLICY};
  update(patch:Partial<NotificationPolicy>):NotificationPolicy{ this.policy={...this.policy, ...patch}; return this.policy; }
  shouldDeliver(now:Date, category:string):boolean{
    if(this.policy.exceptions.includes(category)) return true;
    if(this.policy.quiet_hours.enabled){
      const h=now.getHours(); const start=parseInt(this.policy.quiet_hours.start.split(":")[0]!); const end=parseInt(this.policy.quiet_hours.end.split(":")[0]!);
      if(start<=end ? (h>=start && h<end) : (h>=start || h<end)) return false;
    }
    return true;
  }
  snooze(id:string, until:string):void{ void id; void until; }
}

// ============================================================================
// 9. Accessibility Adapter — 3 equivalent paths
// ============================================================================

export interface A11yPrefs {
  high_contrast:boolean;
  font_size:number;
  reduced_motion:boolean;
  screen_reader:boolean;
  keyboard_only:boolean;
  color_independent_status:boolean;
  plain_language_errors:boolean;
  adjustable_timing:boolean;
  touch_target_min:number;
}

export const DEFAULT_A11Y: A11yPrefs = {
  high_contrast:false, font_size:16, reduced_motion:false, screen_reader:false, keyboard_only:false, color_independent_status:true, plain_language_errors:true, adjustable_timing:true, touch_target_min:44,
};

export class AccessibilityAdapter {
  prefs:A11yPrefs={...DEFAULT_A11Y};
  update(p:Partial<A11yPrefs>):A11yPrefs{ this.prefs={...this.prefs, ...p}; return this.prefs; }
  // semantic roles, live-region, focus restoration
  announce(message:string, priority:"polite"|"assertive"="polite"): { live_region:string; priority:typeof priority }{ return { live_region:message, priority }; }
  focusOrder(elements:string[]):string[]{ return [...elements]; }
}

// ============================================================================
// 10. Universal ANI Shell — facade
// ============================================================================

export type InteractionMode = "ask"|"draft"|"assist"|"execute"|"review"|"quiet"|"offline"|"accessibility"|"admin";
export type ProgressiveLevel = 1|2|3|4|5;

export class UniversalShell {
  context=new ContextResolver();
  registry=new CapabilityRegistry();
  suggestions=new SuggestionManager();
  approvals=new ApprovalManager();
  undo=new UndoManager();
  history=new ActivityHistory();
  notifications=new NotificationPolicyManager();
  a11y=new AccessibilityAdapter();
  mode: InteractionMode="ask";
  level: ProgressiveLevel=1;

  constructor(){
    // seed structured capabilities, not arbitrary model actions
    this.registry.register({ id:"docs.create_summary", label:"Summarize selected content", module:"docs", risk:"low", requires_selection:true, side_effect:"create_draft", undo:"delete_draft", confirmation:"optional", aliases:["summarize"]});
    this.registry.register({ id:"docs.find_actions", label:"Find open action items", module:"docs", risk:"low", requires_selection:true, side_effect:"none", undo:"none", confirmation:"none"});
    this.registry.register({ id:"docs.create_task", label:"Create task from selection", module:"docs", risk:"medium", requires_selection:true, side_effect:"create_task", undo:"delete_task", confirmation:"required"});
    this.registry.register({ id:"sheets.analyze", label:"Analyze selected range", module:"sheets", risk:"low", requires_selection:true, side_effect:"none", undo:"none", confirmation:"none"});
    this.registry.register({ id:"mail.draft_reply", label:"Draft reply", module:"mail", risk:"low", requires_selection:false, side_effect:"create_draft", undo:"delete_draft", confirmation:"optional"});
    this.registry.register({ id:"crm.create_opportunity", label:"Create opportunity", module:"crm", risk:"high", requires_selection:false, side_effect:"create_record", undo:"delete_record", confirmation:"required"});
  }

  setMode(m:InteractionMode):void{ this.mode=m; }
  setLevel(l:ProgressiveLevel):void{ this.level=l; }
  canExecute(risk:Risk):boolean{
    if(this.mode==="ask") return risk==="low" ? false : false; // ask never side effects
    if(this.mode==="draft") return risk==="low" || risk==="medium";
    if(this.mode==="assist") return true; // but approval manager gates
    if(this.mode==="execute") return true;
    return false;
  }
}

// ============================================================================
// 11. Side Panel, FAB, Command Palette configs
// ============================================================================

export const SIDE_PANEL_LAYOUT = `┌─────────────────────────────┐
│ ANI                         │
│ [Ask anything...]     [⋮]   │
├─────────────────────────────┤
│ Context                     │
│ Current document · 12 pages │
├─────────────────────────────┤
│ Suggested                   │
│ Summarize decisions         │
│ Extract action items        │
│ Find conflicting dates      │
├─────────────────────────────┤
│ Conversation                │
│ ...                         │
├─────────────────────────────┤
│ [Command] [Attach] [Voice]  │
└─────────────────────────────┘`;

export const FAB_RULES = {
  max_primary:5,
  context_aware:true,
  no_auto_side_effect:true,
  clear_labels:true,
  keyboard_equiv:"Alt+Space",
  dismissable:true,
  position:"bottom_right",
  not_obscure_focused:true,
};

export const COMMAND_PALETTE = {
  shortcut:"Ctrl/Cmd + Space",
  features:["fuzzy","recent","favorites","context_rank","permission_filter","previews","aliases","no_exec_on_select","destructive_label"] as const,
};

export const KEYBOARD_SHORTCUTS: Record<string,string> = {
  "Ctrl/Cmd + Space":"Open ANI command palette",
  "Escape":"Close panel, cancel suggestion, or stop preview",
  "Ctrl/Cmd + Enter":"Submit request",
  "Alt/Option + Enter":"Submit and open result in side panel",
  "Ctrl/Cmd + Shift + A":"Accept suggestion",
  "Ctrl/Cmd + Shift + D":"Dismiss suggestion",
  "Ctrl/Cmd + Z":"Undo latest reversible ANI action",
  "Ctrl/Cmd + Shift + Z":"Redo where supported",
  "Alt/Option + A":"Open activity history",
  "Alt/Option + H":"Read current context and available actions",
};

// ============================================================================
// 12. Voice Interface — alternative channel, not separate logic
// ============================================================================

export interface VoiceState {
  listening:boolean;
  transcript_preview:string;
  intent_preview?:string;
  confirmation_required?:boolean;
  quiet_hours_compliant:boolean;
}

export class VoiceAdapter {
  push_to_talk=true;
  wake_word: string|null=null;
  listening=false;
  transcript="";
  startListening():VoiceState{ this.listening=true; return { listening:true, transcript_preview:"", quiet_hours_compliant:true };}
  stopListening():VoiceState{ this.listening=false; return { listening:false, transcript_preview:this.transcript, confirmation_required: false, quiet_hours_compliant:true };}
  confirmHighImpact(prompt:string):string{ return `You asked me to ${prompt}. Send it?`; }
}

// ============================================================================
// 13. Mobile Surface — bottom-sheet, offline draft
// ============================================================================

export const MOBILE_SHELL = {
  components:["Floating action button","Voice and text input","Compact command palette","Notification cards","Approval queue","Activity history","Undo center"],
  features:["bottom_sheet","one_handed","offline_draft","push_preview_no_sensitive","biometric_confirm","haptic_with_alternative","large_targets","voice_keyboard_alt","action_queue","network_state"] as const,
};

// ============================================================================
// 14. Global registry
// ============================================================================

const globalShellRegistry=new Map<string,UniversalShell>();
export function shellForWorkspace(workspaceId:string):UniversalShell{
  let s=globalShellRegistry.get(workspaceId);
  if(!s){ s=new UniversalShell(); globalShellRegistry.set(workspaceId,s); }
  return s;
}
