/**
 * N0VA CHAT Workspace-Adaptive UI — persistence + live-signal inference.
 *
 * All pure policy logic (mode table, state resolution, notification
 * decisions, module surfaces, AI behavior, signal voting) lives in
 * ./adaptive-policy — a prisma-free module that client components can
 * import safely. This file adds prisma-backed persistence and the
 * server-side signal gather.
 */

import { prisma } from "@n0va/db";
export * from "./adaptive-policy";
import {
  storedToState,
  resolveEffectiveState,
  inferMode,
  DEFAULT_MODE,
  type StoredAdaptiveState,
  type WorkspaceModeValue,
  type ModeSource,
  type ModeOverrides,
  type EffectiveState,
  type InferenceResult,
} from "./adaptive-policy";

// ── Persistence ──────────────────────────────────────────────────────────

export async function getStoredState(userId: string, workspaceId: string): Promise<StoredAdaptiveState> {
  const row = await prisma.adaptivePaneState.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  return storedToState(row as unknown as Record<string, unknown>);
}

export async function getEffectiveState(userId: string, workspaceId: string, now: Date = new Date()): Promise<EffectiveState> {
  return resolveEffectiveState(await getStoredState(userId, workspaceId), now);
}

export async function setExplicitMode(
  userId: string,
  workspaceId: string,
  mode: WorkspaceModeValue,
  opts: { source?: ModeSource; expiresAt?: Date | null; overrides?: ModeOverrides } = {},
): Promise<StoredAdaptiveState> {
  const now = new Date();
  const row = await prisma.adaptivePaneState.upsert({
    where: { userId_workspaceId: { userId, workspaceId } },
    create: {
      userId, workspaceId,
      currentMode: mode,
      stateSource: opts.source ?? "manual",
      stateConfidence: opts.source === "inferred" ? 0.6 : 1,
      expiresAt: opts.expiresAt ?? null,
      modeOverrides: (opts.overrides ?? {}) as never,
      lastSwitchAt: now,
    },
    update: {
      currentMode: mode,
      stateSource: opts.source ?? "manual",
      stateConfidence: opts.source === "inferred" ? 0.6 : 1,
      expiresAt: opts.expiresAt ?? null,
      modeOverrides: (opts.overrides ?? {}) as never,
      lastSwitchAt: now,
    },
  });
  return storedToState(row as unknown as Record<string, unknown>);
}

export async function recordInference(
  userId: string,
  workspaceId: string,
  inference: InferenceResult,
  now: Date = new Date(),
): Promise<void> {
  await prisma.adaptivePaneState.upsert({
    where: { userId_workspaceId: { userId, workspaceId } },
    create: {
      userId, workspaceId,
      inferredMode: inference.mode,
      inferredConfidence: inference.confidence,
      inferredAt: now,
    },
    update: {
      inferredMode: inference.mode,
      inferredConfidence: inference.confidence,
      inferredAt: now,
    },
  });
}

export async function storeSuggestion(
  userId: string,
  workspaceId: string,
  suggestion: InferenceResult,
  now: Date = new Date(),
): Promise<void> {
  await prisma.adaptivePaneState.upsert({
    where: { userId_workspaceId: { userId, workspaceId } },
    create: {
      userId, workspaceId,
      suggestedMode: suggestion.mode,
      suggestedConfidence: suggestion.confidence,
      suggestedAt: now,
      suggestedReasons: suggestion.reasons as never,
    },
    update: {
      suggestedMode: suggestion.mode,
      suggestedConfidence: suggestion.confidence,
      suggestedAt: now,
      suggestedReasons: suggestion.reasons as never,
    },
  });
}

/** One-click revert: drop explicit choice, fall back to inferred. */
export async function revertToInferred(userId: string, workspaceId: string, now: Date = new Date()): Promise<StoredAdaptiveState> {
  const stored = await getStoredState(userId, workspaceId);
  const fallback = stored.inferredMode && stored.inferredConfidence >= 0.5 ? stored.inferredMode : DEFAULT_MODE;
  const row = await prisma.adaptivePaneState.update({
    where: { userId_workspaceId: { userId, workspaceId } },
    data: {
      currentMode: fallback,
      stateSource: stored.inferredMode ? "inferred" : "default",
      stateConfidence: stored.inferredConfidence || 1,
      expiresAt: null,
      modeOverrides: {},
      lastSwitchAt: now,
    },
  });
  return storedToState(row as unknown as Record<string, unknown>);
}

// ── Server-side inference from live workspace signals ────────────────────

export interface SignalQueryOptions {
  userId: string;
  workspaceId: string;
  now?: Date;
}

/**
 * Gathers inference signals from the workspace (calendar, conversation load,
 * huddles, incidents, optional neural state) and returns a suggestion.
 * Inference is supportive, never authoritative: it only ever suggests.
 */
export async function suggestFromWorkspace(opts: SignalQueryOptions): Promise<InferenceResult> {
  const now = opts.now ?? new Date();
  const { workspaceId, userId } = opts;
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [calendar, mentions, recentMessages, huddles, incidents, neural] = await Promise.all([
    prisma.calendarEvent.findFirst({
      where: {
        workspaceId,
        startAt: { lte: now },
        endAt: { gte: now },
        OR: [{ createdById: userId }, { attendees: { has: userId } }],
      },
      orderBy: { startAt: "desc" },
    }),
    prisma.notification.count({ where: { workspaceId, userId, readAt: null, type: "chat_mention" } }),
    prisma.chatMessage.count({ where: { workspaceId, createdAt: { gte: hourAgo } } }),
    prisma.huddleSession.count({ where: { workspaceId, status: "LIVE", endedAt: null } }),
    prisma.incident.findMany({ where: { workspaceId, status: { not: "RESOLVED" } }, select: { severity: true } }),
    prisma.neuralStateRecord.findFirst({ where: { workspaceId, userId }, orderBy: { createdAt: "desc" } }),
  ]);

  const lateHour = now.getHours() >= 22 || now.getHours() < 5;
  return inferMode({
    now,
    busyCalendar: !!calendar,
    calendarLabel: calendar?.title ?? undefined,
    unreadMentions: mentions,
    messageRatePerMin: recentMessages / 60,
    huddleActive: huddles > 0,
    activeIncidents: incidents.length,
    incidentSeverity: incidents[0]?.severity ?? undefined,
    neuralFlowProb: neural?.flowProb ?? undefined,
    neuralStress: neural?.stress ?? undefined,
    lateNight: lateHour,
  });
}