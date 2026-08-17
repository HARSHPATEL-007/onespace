"use server";

import { NeuralService } from "@n0va/modules-neural-chat";
import { requireActionContext } from "@/lib/action-context";

export interface NeuralInput {
  op:
    | "status" | "tier" | "setTier"
    | "consents" | "setConsent" | "revokeConsent" | "revokeAll" | "renewConsent"
    | "ingest" | "recentState" | "flow" | "correctFlow" | "selfReport"
    | "attentionWeights"
    | "publishState" | "listShares" | "revokeShare" | "visibleShares"
    | "decode" | "listCommands" | "confirmCommand" | "cancelCommand" | "executeCommand"
    | "createHuddle" | "startHuddle" | "endHuddle" | "joinHuddle" | "setHuddleState"
    | "raiseHand" | "signalPause" | "sendHuddleCommand" | "approveHuddleCommand"
    | "huddleTranscript" | "huddleStatus" | "activeHuddles"
    | "accessLog" | "research";
  tier?: number;
  feature?: string;
  recipient?: string;
  duration?: string;
  expiresHours?: number;
  state?: string;
  confidence?: number;
  audience?: string;
  personIds?: string[];
  roomId?: string;
  durationMin?: number;
  text?: string;
  commandId?: string;
  sessionId?: string;
  title?: string;
  messageText?: string;
  channelId?: string;
  flowProb?: number;
  cognitiveLoad?: number;
  limit?: number;
  raw?: Record<string, unknown>;
}

export async function neuralAction(input: NeuralInput) {
  const { workspaceId, userId, role } = await requireActionContext();
  const svc = new NeuralService(workspaceId, userId, role as never);
  switch (input.op) {
    case "status": return svc.neuralStatus();
    case "tier": return svc.getTier();
    case "setTier": return svc.setTier(input.tier ?? 0);
    case "consents": return svc.consentSummary();
    case "setConsent": return svc.setConsent({
      feature: input.feature as never, recipient: input.recipient as never,
      duration: (input.duration as never) ?? "SESSION", privacyMode: "LOCAL_ONLY",
    });
    case "revokeConsent": return svc.revokeConsent(input.feature as never, input.recipient as never);
    case "revokeAll": return svc.revokeAllConsent();
    case "renewConsent": return svc.renewConsent(input.feature as never, input.recipient as never, input.expiresHours ?? 24);
    case "ingest": return svc.ingestState({
      source: "WEARABLE", modality: "EEG",
      attention: Number(input.raw?.attention ?? 0), stress: Number(input.raw?.stress ?? 0),
      cognitiveLoad: Number(input.raw?.cognitiveLoad ?? 0), flowProb: Number(input.raw?.flowProb ?? 0),
      embedding: {}, provenanceHash: `sandbox:${Date.now()}`,
    });
    case "recentState": return svc.getRecentState(input.limit ?? 10);
    case "flow": return svc.flowStatus();
    case "correctFlow": return svc.correctFlowState(input.state ?? "neutral");
    case "selfReport": return svc.reportSelfState(input.flowProb ?? 0.5, input.cognitiveLoad ?? 0.5);
    case "attentionWeights": return svc.attentionWeights();
    case "publishState": return svc.publishState({ state: input.state ?? "available", audience: input.audience as never, personIds: input.personIds, roomId: input.roomId, durationMin: input.durationMin });
    case "listShares": return svc.listShares();
    case "revokeShare": return svc.revokeShare(input.roomId ?? input.commandId ?? "");
    case "visibleShares": return svc.visibleShares();
    case "decode": return svc.decodeAndRecord(input.text ?? "", { threshold: 0.7 });
    case "listCommands": return svc.listCommands(input.limit ?? 20);
    case "confirmCommand": return svc.confirmCommand(input.commandId!);
    case "cancelCommand": return svc.cancelCommand(input.commandId!);
    case "executeCommand": return svc.executeCommand(input.commandId!, { channelId: input.channelId, messageText: input.messageText });
    case "createHuddle": return svc.createHuddle({ title: input.title ?? "Neural huddle" });
    case "startHuddle": return svc.startHuddle(input.sessionId!);
    case "endHuddle": return svc.endHuddle(input.sessionId!);
    case "joinHuddle": return svc.joinHuddleWithConsent(input.sessionId!, userId);
    case "setHuddleState": return svc.setHuddleState(input.sessionId!, input.state ?? "available", input.confidence);
    case "raiseHand": return svc.setHandRaised(input.sessionId!, Boolean(input.raw?.raised));
    case "signalPause": return svc.setSignalPaused(input.sessionId!, Boolean(input.raw?.paused));
    case "sendHuddleCommand": return svc.sendHuddleCommand(input.sessionId!, input.text ?? "");
    case "approveHuddleCommand": return svc.approveHuddleCommand(input.commandId!);
    case "huddleTranscript": return svc.huddleTranscript(input.sessionId!, input.limit ?? 50);
    case "huddleStatus": return svc.huddleStatus(input.sessionId!);
    case "activeHuddles": return svc.getActiveHuddles();
    case "accessLog": return svc.getAccessLog(input.limit ?? 25);
    case "research": return svc.researchStats();
    default:
      throw new Error("Unknown neural op");
  }
}
