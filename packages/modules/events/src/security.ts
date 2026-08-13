/**
 * Event governance — permission-aware visibility & payload redaction.
 *
 * Rule: CONFIDENTIAL events never leak full payloads into low-trust surfaces
 * (list APIs, analytics, external topics). Prefer references over content:
 * id/ref/key/type/status fields survive; content strings are redacted.
 */
import type { CanonicalEvent, EventVisibility } from "./envelope";

/** Keys that are safe references (ids, refs, types, statuses) — kept intact. */
const REF_PATTERN = /^(id|ids|ref|refs|key|type|kind|status|source|version|eventType|workflowId|sagaType|decision|previous|next|count|total|attempts)$/i;

function isReferenceKey(key: string): boolean {
  if (REF_PATTERN.test(key)) return true;
  const lower = key.toLowerCase();
  return (
    lower.endsWith("id") ||
    lower.endsWith("ids") ||
    lower.endsWith("ref") ||
    lower.endsWith("refs") ||
    lower.endsWith("key") ||
    lower.endsWith("type") ||
    lower.endsWith("kind") ||
    lower.endsWith("status") ||
    lower.endsWith("version")
  );
}

/** Redact a payload for a CONFIDENTIAL event: content → "[redacted]", refs stay. */
export function redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) {
      out[key] = value;
    } else if (typeof value === "string") {
      out[key] = isReferenceKey(key) ? value : "[redacted]";
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.map((v) => (typeof v === "object" && v !== null ? redactPayload(v as Record<string, unknown>) : typeof v === "string" ? (isReferenceKey(key) ? v : "[redacted]") : v));
    } else if (typeof value === "object") {
      out[key] = redactPayload(value as Record<string, unknown>);
    } else {
      out[key] = "[redacted]";
    }
  }
  return out;
}

/** True when an event's content must not leave internal surfaces verbatim. */
export function isSensitive(ev: Pick<CanonicalEvent, "visibility" | "eventType">): boolean {
  return ev.visibility === "CONFIDENTIAL" || ev.eventType.endsWith(".failed") || ev.eventType.startsWith("command.");
}

/** Return a view-safe COPY of an event; full payload only for privileged viewers. */
export function redactForViewer(ev: CanonicalEvent, viewerRank: number): CanonicalEvent {
  if (!isSensitive(ev)) return ev;
  if (viewerRank >= 3) return ev;
  return { ...ev, payload: redactPayload(ev.payload) };
}

export type { EventVisibility };