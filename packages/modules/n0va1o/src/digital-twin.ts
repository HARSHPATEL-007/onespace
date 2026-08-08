/**
 * N0VA1O Digital Twin Integration — virtual replicas for real-time intelligence (spec §32).
 *
 * Creates and maintains digital twins of processes, assets, organizations, customers,
 * and supply chains. Twins sync state from source systems via N0VA1O integrations
 * and provide simulation, optimization, and predictive capabilities.
 */

export type TwinType = "process" | "asset" | "organization" | "customer" | "supply_chain" | "quantum" | "neural" | "ecosystem";

export type TwinStatus = "synced" | "syncing" | "stale" | "error";

export interface TwinMetadata {
  id: string;
  type: TwinType;
  name: string;
  description: string;
  workspaceId: string;
  status: TwinStatus;
  fidelity: number;
  syncFrequency: "realtime" | "batch" | "manual" | "event";
  lastSyncAt: string;
  nextSyncAt?: string;
  sourceSystems: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TwinState {
  twinId: string;
  timestamp: string;
  variables: Record<string, unknown>;
  metrics: Record<string, number>;
  health: number;
  version: string;
}

export interface TwinEvent {
  id: string;
  twinId: string;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
  severity: "info" | "warning" | "critical";
}

export interface SimulationResult {
  simulationId: string;
  twinId: string;
  scenario: string;
  startTime: string;
  endTime: string;
  predictedState: TwinState;
  confidence: number;
  sideEffects: string[];
  riskScore: number;
}

export interface OptimizationResult {
  twinId: string;
  metric: string;
  current: number;
  optimized: number;
  improvement: number;
  recommendations: string[];
  confidence: number;
}

/**
 * Create a new digital twin configuration.
 */
export function createTwin(config: {
  type: TwinType;
  name: string;
  description: string;
  workspaceId: string;
  sourceSystems: string[];
  syncFrequency: TwinMetadata["syncFrequency"];
  tags?: string[];
}): TwinMetadata {
  const now = new Date().toISOString();
  return {
    id: `twin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    type: config.type,
    name: config.name,
    description: config.description,
    workspaceId: config.workspaceId,
    status: "syncing",
    fidelity: 0,
    syncFrequency: config.syncFrequency,
    lastSyncAt: now,
    sourceSystems: config.sourceSystems,
    tags: config.tags ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Sync a twin's state from its source systems via N0VA1O integrations.
 */
export function syncTwin(twin: TwinMetadata, state: Record<string, unknown>): { twin: TwinMetadata; syncedState: TwinState } {
  const now = new Date().toISOString();
  const metrics = extractMetrics(state);
  const health = computeTwinHealth(metrics);
  const fidelity = computeFidelity(twin, metrics);

  const syncedState: TwinState = {
    twinId: twin.id,
    timestamp: now,
    variables: state,
    metrics,
    health,
    version: `v${Date.now().toString(36)}`,
  };

  TWIN_STATES.set(twin.id, syncedState);
  TWIN_STATES_BY_TWIN.set(twin.id, syncedState);

  const updated: TwinMetadata = {
    ...twin,
    status: "synced",
    fidelity,
    lastSyncAt: now,
    nextSyncAt: computeNextSync(now, twin.syncFrequency),
    updatedAt: now,
  };

  TWIN_REGISTRY.set(twin.id, updated);

  return { twin: updated, syncedState };
}

/**
 * Simulate what-if scenarios on a twin's state.
 */
export function simulateScenario(
  twin: TwinMetadata,
  scenario: string,
  modifications: Record<string, unknown>,
): SimulationResult {
  const currentState = TWIN_STATES_BY_TWIN.get(twin.id) ?? defaultTwinState(twin);

  const simulatedState: TwinState = {
    ...currentState,
    twinId: twin.id,
    timestamp: new Date().toISOString(),
    variables: { ...currentState.variables, ...modifications },
    version: `sim_${Date.now().toString(36)}`,
  };

  const predictedMetrics = extractMetrics(simulatedState.variables);
  const confidence = twin.fidelity * 0.8 + 0.1;
  const riskScore = computeSimulationRisk(twin, modifications);

  return {
    simulationId: `sim_${Date.now().toString(36)}`,
    twinId: twin.id,
    scenario,
    startTime: simulatedState.timestamp,
    endTime: simulatedState.timestamp,
    predictedState: {
      ...simulatedState,
      metrics: predictedMetrics,
      health: computeTwinHealth(predictedMetrics),
    },
    confidence,
    sideEffects: [],
    riskScore,
  };
}

/**
 * Optimize twin state for a specific metric.
 */
export function optimizeTwin(
  twin: TwinMetadata,
  metric: string,
  target: number,
): OptimizationResult {
  const currentState = TWIN_STATES_BY_TWIN.get(twin.id) ?? defaultTwinState(twin);
  const current = currentState.metrics[metric] ?? 0;

  const delta = target - current;
  const optimized = current + delta * 0.85;
  const improvement = ((optimized - current) / Math.abs(current || 1)) * 100;

  return {
    twinId: twin.id,
    metric,
    current,
    optimized,
    improvement,
    recommendations: [
      `Adjust ${metric} by ${delta.toFixed(2)} to approach target`,
      `Current: ${current.toFixed(2)}, Optimized: ${optimized.toFixed(2)}`,
    ],
    confidence: twin.fidelity * 0.75 + 0.2,
  };
}

/**
 * Record an event for a twin (used for anomaly detection and alerting).
 */
export function recordTwinEvent(event: Omit<TwinEvent, "id">): TwinEvent {
  const fullEvent: TwinEvent = { ...event, id: `evt_${Date.now().toString(36)}` };
  const events = TWIN_EVENTS.get(event.twinId) ?? [];
  events.push(fullEvent);
  TWIN_EVENTS.set(event.twinId, events);
  return fullEvent;
}

/**
 * Get events for a twin.
 */
export function getTwinEvents(twinId: string, limit = 50): TwinEvent[] {
  return (TWIN_EVENTS.get(twinId) ?? []).slice(-limit);
}

/**
 * Get the current state of a twin.
 */
export function getTwinState(twinId: string): TwinState | null {
  return TWIN_STATES_BY_TWIN.get(twinId) ?? null;
}

/**
 * Get a twin by ID.
 */
export function getTwin(twinId: string): TwinMetadata | null {
  return TWIN_REGISTRY.get(twinId) ?? null;
}

/**
 * List all twins for a workspace.
 */
export function listTwins(workspaceId: string): TwinMetadata[] {
  return [...TWIN_REGISTRY.values()].filter((t) => t.workspaceId === workspaceId);
}

/**
 * Check twin sync health.
 */
export function checkTwinSync(twin: TwinMetadata): { healthy: boolean; issues: string[] } {
  const issues: string[] = [];
  const state = TWIN_STATES_BY_TWIN.get(twin.id);

  if (!state) {
    issues.push("Twin has no synced state");
    return { healthy: false, issues };
  }

  if (twin.status === "error") {
    issues.push("Twin is in error state");
  }

  const staleness = Date.now() - Date.parse(twin.lastSyncAt);
  const maxAge = twin.syncFrequency === "realtime" ? 60_000 : twin.syncFrequency === "batch" ? 3_600_000 : 86_400_000;
  if (staleness > maxAge) {
    issues.push(`Twin state is stale (${Math.floor(staleness / 1000)}s old)`);
  }

  if (twin.fidelity < 0.8) {
    issues.push(`Low fidelity (${twin.fidelity.toFixed(2)})`);
  }

  return { healthy: issues.length === 0, issues };
}

function extractMetrics(state: Record<string, unknown>): Record<string, number> {
  const metrics: Record<string, number> = {};
  for (const [key, value] of Object.entries(state)) {
    if (typeof value === "number") {
      metrics[key] = value;
    } else if (typeof value === "object" && value !== null && "value" in value && typeof (value as { value: unknown }).value === "number") {
      metrics[key] = (value as { value: number }).value;
    }
  }
  return metrics;
}

function computeTwinHealth(metrics: Record<string, number>): number {
  const values = Object.values(metrics);
  if (values.length === 0) return 0.5;
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.max(0, Math.min(1, avg));
}

function computeFidelity(twin: TwinMetadata, metrics: Record<string, number>): number {
  const metricCount = Object.keys(metrics).length;
  const expectedMetrics = Math.max(1, twin.sourceSystems.length * 3);
  return Math.min(1, metricCount / expectedMetrics);
}

function computeNextSync(lastSync: string, freq: TwinMetadata["syncFrequency"]): string {
  const delta = freq === "realtime" ? 30_000 : freq === "batch" ? 300_000 : 3_600_000;
  return new Date(Date.parse(lastSync) + delta).toISOString();
}

function computeSimulationRisk(twin: TwinMetadata, modifications: Record<string, unknown>): number {
  const modKeys = Object.keys(modifications).length;
  return Math.min(1, (modKeys * 0.1 + (1 - twin.fidelity) * 0.5));
}

function defaultTwinState(twin: TwinMetadata): TwinState {
  return {
    twinId: twin.id,
    timestamp: new Date().toISOString(),
    variables: {},
    metrics: {},
    health: 0.5,
    version: "default",
  };
}

const TWIN_REGISTRY = new Map<string, TwinMetadata>();
const TWIN_STATES_BY_TWIN = new Map<string, TwinState>();
const TWIN_STATES = new Map<string, TwinState>();
const TWIN_EVENTS = new Map<string, TwinEvent[]>();
