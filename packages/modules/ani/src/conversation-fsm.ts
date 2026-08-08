export type ConversationPhase = "intake" | "clarify" | "plan" | "act" | "verify" | "handoff";

export interface PhaseTransition {
  from: ConversationPhase;
  to: ConversationPhase;
  condition: string;
}

export class ConversationStateMachine {
  private currentPhase: ConversationPhase = "intake";
  private history: Array<{ phase: ConversationPhase; timestamp: string; note: string }> = [];

  private transitions: PhaseTransition[] = [
    { from: "intake", to: "clarify", condition: "ambiguous or missing parameters" },
    { from: "intake", to: "plan", condition: "complex multi-step task identified" },
    { from: "intake", to: "act", condition: "simple deterministic request" },
    { from: "clarify", to: "plan", condition: "user provided clarification" },
    { from: "clarify", to: "intake", condition: "new information changes scope" },
    { from: "plan", to: "act", condition: "plan approved or auto-approved" },
    { from: "plan", to: "clarify", condition: "plan has gaps" },
    { from: "act", to: "verify", condition: "action completed" },
    { from: "act", to: "plan", condition: "unexpected result requires replanning" },
    { from: "verify", to: "handoff", condition: "output confirmed correct" },
    { from: "verify", to: "act", condition: "output needs revision" },
  ];

  getCurrentPhase(): ConversationPhase { return this.currentPhase; }

  canTransitionTo(targetPhase: ConversationPhase): boolean {
    return this.transitions.some((t) => t.from === this.currentPhase && t.to === targetPhase);
  }

  transition(targetPhase: ConversationPhase, note = ""): boolean {
    if (!this.canTransitionTo(targetPhase)) return false;
    const from = this.currentPhase;
    this.currentPhase = targetPhase;
    this.history.push({ phase: targetPhase, timestamp: new Date().toISOString(), note: from + " -> " + targetPhase + (note ? ": " + note : "") });
    return true;
  }

  getHistory(): typeof this.history { return this.history; }
}
