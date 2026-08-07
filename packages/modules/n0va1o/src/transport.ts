/**
 * N0VA1O Transport Fallback Logic — routing layer (spec §6.2).
 *
 * Automatic failover among stdio, HTTP SSE, and WebSocket transports when the
 * preferred channel is unavailable. Fallback preserves session continuity.
 */

export type TransportType = "stdio" | "http_sse" | "websocket";

export interface TransportStatus {
  type: TransportType;
  available: boolean;
  latencyMs?: number;
  lastError?: string;
}

export interface FallbackResult {
  selected: TransportType;
  attempted: TransportType[];
  reason: string;
  sessionPreserved: boolean;
}

export const TRANSPORT_PRIORITY: TransportType[] = ["stdio", "websocket", "http_sse"];

/**
 * Select the best available transport with automatic failover. Tries transports
 * in priority order, falling back when the preferred channel is unavailable.
 */
export function selectTransport(opts: {
  preferred: TransportType;
  statuses: TransportType[];
  availability: Record<TransportType, boolean>;
}): FallbackResult {
  const attempted: TransportType[] = [];
  const ordered = buildPriorityOrder(opts.preferred);

  for (const transport of ordered) {
    if (!opts.statuses.includes(transport)) continue;
    attempted.push(transport);
    if (opts.availability[transport]) {
      const isPreferred = transport === opts.preferred;
      return {
        selected: transport,
        attempted,
        reason: isPreferred ? "Preferred transport available" : `Fallback from ${opts.preferred} to ${transport}`,
        sessionPreserved: isPreferred || transport !== "stdio",
      };
    }
  }

  return {
    selected: opts.preferred,
    attempted,
    reason: "No transport available — using preferred as last resort",
    sessionPreserved: false,
  };
}

function buildPriorityOrder(preferred: TransportType): TransportType[] {
  const order: TransportType[] = [preferred];
  for (const t of TRANSPORT_PRIORITY) {
    if (!order.includes(t)) order.push(t);
  }
  return order;
}

/** Whether a session can be preserved across a transport switch. */
export function canPreserveSession(from: TransportType, to: TransportType): boolean {
  if (from === to) return true;
  // stdio is local-process-bound and cannot migrate; others can.
  return from !== "stdio" && to !== "stdio";
}
