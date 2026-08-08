import type {
  CollaborationState,
  ParticipantSignal,
} from "./collaboration-intel";
import type { CausalNode, CausalEdge, CounterfactualResult } from "./causal";
import type { ModelTier, ModelRoute } from "./model-portfolio";
import type { SituationType, ToneProfile } from "./tone-engine";
import type { IntegrationHealth } from "./tool-sentinel";
import type { PerformanceSnapshot } from "./self-optimization";
import type {
  ContextGraph3D,
  ContextNode3D,
  ContextEdge3D,
} from "./remaining-capabilities";
import type { TaskProgress } from "./remaining-capabilities";
import type { ReasoningDepth } from "./deep-think";
import type { UserIntent, WorkspaceContext } from "./engine";

export interface MeetingIntelligenceState {
  meetingId: string;
  startTime: string;
  participants: ParticipantInsight[];
  agenda: AgendaItem[];
  currentTopic: string;
  sentiment: number;
  engagement: number;
  talkTimeDistribution: Record<string, number>;
  decisions: MeetingDecision[];
  actionItems: MeetingActionItem[];
  status: "pre_meeting" | "in_progress" | "wrapping_up" | "ended";
}

export interface ParticipantInsight {
  id: string;
  name: string;
  talkTimePercent: number;
  sentiment: number;
  engagement: number;
  lastSpoke: string;
  contributions: number;
  questions: number;
  interruptions: number;
}

export interface AgendaItem {
  id: string;
  title: string;
  duration: number;
  status: "pending" | "active" | "completed" | "deferred";
  notes: string;
}

export interface MeetingDecision {
  id: string;
  topic: string;
  decision: string;
  madeBy: string;
  timestamp: string;
  dissenters: string[];
}

export interface MeetingActionItem {
  id: string;
  description: string;
  assignee: string;
  deadline?: string;
  status: "pending" | "accepted" | "declined";
}

export interface GraphLayout3D {
  nodes: Array<
    ContextNode3D & {
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      vz: number;
    }
  >;
  edges: ContextEdge3D[];
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
}

export function layoutForceDirected3D(
  graph: ContextGraph3D,
  iterations: number = 100,
): GraphLayout3D {
  const width = 800;
  const height = 600;
  const depth = 400;

  const positioned = graph.nodes.map((n) => ({
    ...n,
    x: (Math.random() - 0.5) * width,
    y: (Math.random() - 0.5) * height,
    z: (Math.random() - 0.5) * depth,
    vx: 0,
    vy: 0,
    vz: 0,
  }));

  const nodeMap = new Map(positioned.map((n) => [n.id, n]));
  const repulsion = 5000;
  const attraction = 0.01;
  const damping = 0.9;
  const idealEdgeLength = 150;

  for (let iter = 0; iter < iterations; iter++) {
    for (const node of positioned) {
      for (const other of positioned) {
        if (node.id === other.id) continue;
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        const dz = node.z - other.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const force = repulsion / (dist * dist);
        node.vx += (dx / dist) * force;
        node.vy += (dy / dist) * force;
        node.vz += (dz / dist) * force;
      }
    }

    for (const edge of graph.edges) {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dz = target.z - source.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const force = (dist - idealEdgeLength) * attraction * edge.weight;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const fz = (dz / dist) * force;
      source.vx += fx;
      source.vy += fy;
      source.vz += fz;
      target.vx -= fx;
      target.vy -= fy;
      target.vz -= fz;
    }

    for (const node of positioned) {
      node.vx *= damping;
      node.vy *= damping;
      node.vz *= damping;
      node.x += node.vx;
      node.y += node.vy;
      node.z += node.vz;
      node.x = Math.max(-width / 2, Math.min(width / 2, node.x));
      node.y = Math.max(-height / 2, Math.min(height / 2, node.y));
      node.z = Math.max(-depth / 2, Math.min(depth / 2, node.z));
    }
  }

  const xs = positioned.map((n) => n.x);
  const ys = positioned.map((n) => n.y);
  const zs = positioned.map((n) => n.z);

  return {
    nodes: positioned,
    edges: graph.edges,
    bounds: {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    },
  };
}

export function project3Dto2D(
  x: number,
  y: number,
  z: number,
  bounds: GraphLayout3D["bounds"],
  canvasWidth: number,
  canvasHeight: number,
  rotationY: number = 0.4,
  rotationX: number = 0.2,
): { sx: number; sy: number; scale: number } {
  const cosY = Math.cos(rotationY);
  const sinY = Math.sin(rotationY);
  const cosX = Math.cos(rotationX);
  const sinX = Math.sin(rotationX);

  const rx = x * cosY - z * sinY;
  const rz = x * sinY + z * cosY;
  const ry = y * cosX - rz * sinX;
  const rz2 = y * sinX + rz * cosX;

  const perspective = 1000;
  const scale = perspective / (perspective + rz2);
  const rangeX = bounds.maxX - bounds.minX || 1;
  const rangeY = bounds.maxY - bounds.minY || 1;
  const normalizedX = (rx - bounds.minX) / rangeX - 0.5;
  const normalizedY = (ry - bounds.minY) / rangeY - 0.5;

  return {
    sx: canvasWidth / 2 + normalizedX * canvasWidth * 0.8 * scale,
    sy: canvasHeight / 2 + normalizedY * canvasHeight * 0.8 * scale,
    scale,
  };
}

export function initializeMeetingIntelligence(
  meetingId: string,
  participants: string[],
): MeetingIntelligenceState {
  return {
    meetingId,
    startTime: new Date().toISOString(),
    participants: participants.map((name, i) => ({
      id: `p_${i}`,
      name,
      talkTimePercent: 0,
      sentiment: 0.5,
      engagement: 0.5,
      lastSpoke: new Date().toISOString(),
      contributions: 0,
      questions: 0,
      interruptions: 0,
    })),
    agenda: [],
    currentTopic: "",
    sentiment: 0.5,
    engagement: 0.5,
    talkTimeDistribution: {},
    decisions: [],
    actionItems: [],
    status: "in_progress",
  };
}

export function updateMeetingWithTranscript(
  state: MeetingIntelligenceState,
  speaker: string,
  text: string,
): MeetingIntelligenceState {
  const participants = state.participants.map((p) => {
    if (p.name !== speaker) return p;
    const isQuestion = text.includes("?");
    const wordCount = text.split(/\s+/).length;
    return {
      ...p,
      lastSpoke: new Date().toISOString(),
      contributions: p.contributions + 1,
      questions: p.questions + (isQuestion ? 1 : 0),
      talkTimePercent: p.talkTimePercent + wordCount,
    };
  });

  const totalWords =
    participants.reduce((a, p) => a + p.talkTimePercent, 0) || 1;
  for (const p of participants) {
    p.talkTimePercent = Math.round((p.talkTimePercent / totalWords) * 100);
  }

  const decisions: MeetingDecision[] = [...state.decisions];
  const decisionPatterns = [
    /(?:we(?:'ve|\s+have)\s+decided|agreed\s+to|let['']s\s+go\s+with|final\s+decision)\s+([^.!?]+)/gi,
  ];
  for (const pattern of decisionPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      decisions.push({
        id: `dec_${Date.now()}_${decisions.length}`,
        topic: state.currentTopic,
        decision: match[1]!.trim(),
        madeBy: speaker,
        timestamp: new Date().toISOString(),
        dissenters: [],
      });
    }
  }

  const actionItems: MeetingActionItem[] = [...state.actionItems];
  const actionPatterns = [
    /(?:action\s+item|@(\w+)\s+(?:will|should|to\s+do))\s*([^.!?]+)/gi,
    /(?:TODO|follow\s+up)\s*:\s*([^.!?]+)/gi,
  ];
  for (const pattern of actionPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const assignee = match[1] ?? "unassigned";
      const desc = match[2] ?? match[1] ?? "";
      actionItems.push({
        id: `ai_${Date.now()}_${actionItems.length}`,
        description: desc.trim(),
        assignee,
        status: "pending",
      });
    }
  }

  return { ...state, participants, decisions, actionItems };
}

export function selectOptimalModel(
  intent: UserIntent,
  depth: ReasoningDepth,
  providers: Array<{
    id: string;
    tier: ModelTier;
    modelName: string;
    costPerToken: number;
    maxContext: number;
    speedMs: number;
    available: boolean;
  }>,
): ModelRoute | null {
  const available = providers.filter((p) => p.available);
  if (available.length === 0) return null;

  const tierPriority: Record<ModelTier, number> = {
    small: 0,
    medium: 1,
    frontier: 2,
  };
  const requiredTier: ModelTier =
    depth === "research" || depth === "deep"
      ? "frontier"
      : depth === "balanced"
        ? "medium"
        : "small";

  const candidates = available.filter(
    (p) => tierPriority[p.tier] >= tierPriority[requiredTier],
  );
  const pool = candidates.length > 0 ? candidates : available;

  let best: ModelRoute | null = null;
  let bestScore = -1;

  for (const p of pool) {
    let score = 0;
    score += tierPriority[p.tier] * 10;
    score -= p.speedMs / 100;
    score -= p.costPerToken * 1000;
    if (
      intent.riskLevel === "high" &&
      tierPriority[p.tier] >= tierPriority.medium
    )
      score += 5;
    if (
      intent.riskLevel === "critical" &&
      tierPriority[p.tier] >= tierPriority.frontier
    )
      score += 10;
    if (depth === "fast" && p.speedMs < 100) score += 8;
    if (bestScore < score) {
      bestScore = score;
      best = {
        tier: p.tier,
        modelName: p.modelName,
        costPerToken: p.costPerToken,
        maxContext: p.maxContext,
        speedMs: p.speedMs,
      };
    }
  }

  return best;
}

export function buildCausalChain(
  nodes: CausalNode[],
  edges: CausalEdge[],
  targetId: string,
  maxDepth: number = 5,
): { chain: CausalNode[]; strength: number; gaps: string[] } {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const incomingEdges = new Map<string, CausalEdge[]>();
  for (const e of edges) {
    const list = incomingEdges.get(e.target) ?? [];
    list.push(e);
    incomingEdges.set(e.target, list);
  }

  const chain: CausalNode[] = [];
  const gaps: string[] = [];
  let currentId: string | undefined = targetId;
  let strength = 1;

  for (let depth = 0; depth < maxDepth; depth++) {
    if (!currentId) break;
    const node = nodeMap.get(currentId);
    if (!node) {
      gaps.push(`Missing node: ${currentId}`);
      break;
    }
    chain.push(node);
    const incoming: CausalEdge[] = incomingEdges.get(currentId) ?? [];
    if (incoming.length === 0) {
      gaps.push(`Root cause reached: ${node.name}`);
      break;
    }
    const strongest = incoming.reduce((a: CausalEdge, b: CausalEdge) =>
      a.strength > b.strength ? a : b,
    );
    strength *= strongest.strength;
    currentId = strongest.source;
  }

  return { chain, strength, gaps };
}

export function monitorToolHealth(
  integrations: Array<{
    id: string;
    name: string;
    provider: string;
    lastCall: string;
    errorRate: number;
    latencyP95: number;
    authStatus: string;
  }>,
): IntegrationHealth[] {
  return integrations.map((i) => ({
    integrationId: i.id,
    name: i.name,
    uptime: Math.max(0, 1 - i.errorRate),
    errorRate: i.errorRate,
    latencyP95: i.latencyP95,
    authStatus: i.authStatus as IntegrationHealth["authStatus"],
    lastCheck: new Date().toISOString(),
  }));
}

export function adaptToneForContext(
  baseProfile: ToneProfile,
  stress: number,
  engagement: number,
): ToneProfile {
  const adapted = { ...baseProfile };
  if (stress > 0.6) {
    if (adapted.verbosity === "detailed") adapted.verbosity = "concise";
    if (adapted.verbosity === "balanced") adapted.verbosity = "concise";
    adapted.empathy = "high";
    adapted.pace = "fast";
  }
  if (engagement < 0.3) {
    adapted.empathy = "high";
    if (adapted.verbosity === "detailed") adapted.verbosity = "concise";
  }
  return adapted;
}

export function runSelfOptimizationCheck(
  snapshots: PerformanceSnapshot[],
  currentSettings: {
    temperature: number;
    maxTokens: number;
    contextWindow: number;
  },
): {
  temperature: number;
  maxTokens: number;
  contextWindow: number;
  changes: string[];
} {
  if (snapshots.length < 3) return { ...currentSettings, changes: [] };

  const recent = snapshots.slice(-5);
  const avgLatency =
    recent.reduce((a, s) => a + s.latencyMs, 0) / recent.length;
  const avgCost = recent.reduce((a, s) => a + s.costUsd, 0) / recent.length;
  const changes: string[] = [];

  let { temperature, maxTokens, contextWindow } = currentSettings;

  if (avgLatency > 3000) {
    maxTokens = Math.max(1024, Math.floor(maxTokens * 0.8));
    changes.push("Reduced maxTokens to improve latency");
  }
  if (avgCost > 0.01) {
    maxTokens = Math.max(1024, Math.floor(maxTokens * 0.7));
    changes.push("Reduced maxTokens to lower cost");
  }
  if (avgLatency < 1500 && recent.every((s) => s.hallucinationRate < 0.03)) {
    maxTokens = Math.min(8192, Math.floor(maxTokens * 1.15));
    changes.push("Increased maxTokens for better quality");
  }

  return { temperature, maxTokens, contextWindow, changes };
}
