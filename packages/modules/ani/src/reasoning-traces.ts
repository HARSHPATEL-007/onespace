export interface ReasoningStep {
  id: string;
  stepNumber: number;
  type: "observation" | "inference" | "decision" | "action" | "verification";
  content: string;
  confidence: number;
  timestamp: string;
  parentStep?: string;
  metadata: Record<string, unknown>;
}

export interface ReasoningTrace {
  id: string;
  sessionId: string;
  goalId?: string;
  steps: ReasoningStep[];
  finalAnswer?: string;
  compactRepresentation: string;
  createdAt: string;
}

export class ReasoningTraceLogger {
  private traces: Map<string, ReasoningTrace> = new Map();
  private stepCounter = 0;

  startTrace(sessionId: string, goalId?: string): ReasoningTrace {
    const trace: ReasoningTrace = {
      id: "trace_" + Date.now().toString(36),
      sessionId, goalId, steps: [],
      compactRepresentation: "", createdAt: new Date().toISOString(),
    };
    this.traces.set(trace.id, trace);
    this.stepCounter = 0;
    return trace;
  }

  addStep(traceId: string, type: ReasoningStep["type"], content: string, confidence: number, metadata: Record<string, unknown> = {}): ReasoningStep | null {
    const trace = this.traces.get(traceId);
    if (!trace) return null;
    this.stepCounter++;
    const step: ReasoningStep = {
      id: "step_" + this.stepCounter, stepNumber: this.stepCounter,
      type, content, confidence, timestamp: new Date().toISOString(),
      metadata,
    };
    trace.steps.push(step);
    trace.compactRepresentation = this._compactRepr(trace.steps);
    return step;
  }

  finalize(traceId: string, finalAnswer: string): ReasoningTrace | null {
    const trace = this.traces.get(traceId);
    if (!trace) return null;
    trace.finalAnswer = finalAnswer;
    return trace;
  }

  getTrace(traceId: string): ReasoningTrace | null {
    return this.traces.get(traceId) ?? null;
  }

  getAuditTrail(traceId: string): string[] {
    const trace = this.traces.get(traceId);
    if (!trace) return [];
    return trace.steps.map((s) => "[" + s.type.toUpperCase() + "][" + s.confidence.toFixed(2) + "] " + s.content);
  }

  private _compactRepr(steps: ReasoningStep[]): string {
    return steps.map((s) => (s.type[0] ?? "").toUpperCase() + ":" + s.content.slice(0, 40)).join(" -> ");
  }
}
