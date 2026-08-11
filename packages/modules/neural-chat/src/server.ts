import { prisma } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "neural";

export type NeuralFeature = "FLOW_DETECTION" | "SUBVOCAL_DECODING" | "SHARED_ATTENTION" | "NEURAL_STATE_SHARING" | "TEAM_DASHBOARD";
export type NeuralRecipient = "SELF_ONLY" | "TEAM" | "ROLE_BASED" | "WORKSPACE";
export type ConsentDuration = "ONE_OFF" | "SESSION" | "PERSISTENT";
export type PrivacyMode = "LOCAL_ONLY" | "AGGREGATE_ONLY" | "FULL";
export type NeuralSource = "WEARABLE" | "IMPLANTED" | "PERIPHERAL";
export type NeuralModality = "EEG" | "EMG" | "INTRACORTICAL";
export type FlowState = "IDLE" | "FOCUS" | "FLOW" | "CRISIS" | "DISTRACTED";
export type FlowTrigger = "NEURAL_SIGNAL" | "USER_ACTION" | "CALENDAR" | "SYSTEM" | "TIMEOUT";
export type HuddleStatus = "SCHEDULED" | "LIVE" | "ENDED";
export type StreamEndpointType = "NEURAL_STATE" | "SUBVOCAL" | "AUDIO" | "VIDEO";
export type ContextType = "MESSAGE" | "THREAD" | "DOC" | "NOTIFICATION" | "TASK";

export interface NeuralStateInput {
  source: NeuralSource;
  modality: NeuralModality;
  samplingRate?: number;
  attention?: number;
  stress?: number;
  cognitiveLoad?: number;
  flowProb?: number;
  blinkRate?: number;
  heartRate?: number;
  embedding: Record<string, number>;
  provenanceHash: string;
}

export interface ConsentInput {
  feature: NeuralFeature;
  recipient: NeuralRecipient;
  duration: ConsentDuration;
  privacyMode?: PrivacyMode;
  retentionDays?: number;
  epsilon?: number;
}

export interface FlowPolicy {
  state: FlowState;
  flowProb: number;
  uiMode: "normal" | "focus" | "flow" | "crisis";
  notificationsMuted: boolean;
  digestDeferred: boolean;
  subvocalReady: boolean;
  rationale: string;
}

export class NeuralService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for neural features`);
    }
  }

  // ── Consent Management ─────────────────────────────────────────────

  async setConsent(input: ConsentInput) {
    await this.assert("UPDATE");
    return prisma.neuralConsentScope.upsert({
      where: {
        userId_workspaceId_feature_recipient: {
          userId: this.userId,
          workspaceId: this.workspaceId,
          feature: input.feature,
          recipient: input.recipient,
        },
      },
      create: {
        userId: this.userId,
        workspaceId: this.workspaceId,
        feature: input.feature,
        recipient: input.recipient,
        duration: input.duration,
        privacyMode: input.privacyMode ?? "LOCAL_ONLY",
        retentionDays: input.retentionDays ?? 30,
        epsilon: input.epsilon ?? 1.0,
        enabled: true,
      },
      update: {
        duration: input.duration,
        privacyMode: input.privacyMode ?? "LOCAL_ONLY",
        retentionDays: input.retentionDays ?? 30,
        epsilon: input.epsilon ?? 1.0,
        enabled: true,
        lastConfirmedAt: new Date(),
      },
    });
  }

  async revokeConsent(feature: NeuralFeature, recipient: NeuralRecipient) {
    await this.assert("UPDATE");
    return prisma.neuralConsentScope.updateMany({
      where: {
        userId: this.userId,
        workspaceId: this.workspaceId,
        feature,
        recipient,
      },
      data: {
        enabled: false,
        revokedAt: new Date(),
      },
    });
  }

  async getConsents() {
    await this.assert("READ");
    return prisma.neuralConsentScope.findMany({
      where: { userId: this.userId, workspaceId: this.workspaceId },
      orderBy: { feature: "asc" },
    });
  }

  async checkConsent(feature: NeuralFeature, recipient: NeuralRecipient): Promise<{
    allowed: boolean;
    privacyMode: PrivacyMode;
    epsilon: number;
  }> {
    const scope = await prisma.neuralConsentScope.findUnique({
      where: {
        userId_workspaceId_feature_recipient: {
          userId: this.userId,
          workspaceId: this.workspaceId,
          feature,
          recipient,
        },
      },
    });

    if (!scope || !scope.enabled || scope.revokedAt) {
      return { allowed: false, privacyMode: "LOCAL_ONLY", epsilon: 1.0 };
    }

    return { allowed: true, privacyMode: scope.privacyMode, epsilon: scope.epsilon };
  }

  // ── State Ingestion ────────────────────────────────────────────────

  async ingestState(input: NeuralStateInput) {
    await this.assert("CREATE");

    const consent = await this.checkConsent("FLOW_DETECTION", "SELF_ONLY");
    const localOnly = consent.privacyMode === "LOCAL_ONLY" || !consent.allowed;

    const embedding = localOnly ? input.embedding : this.applyDifferentialPrivacy(input.embedding, consent.epsilon);

    return prisma.neuralStateRecord.create({
      data: {
        userId: this.userId,
        workspaceId: this.workspaceId,
        source: input.source,
        modality: input.modality,
        samplingRate: input.samplingRate ?? 250,
        attention: input.attention ?? 0,
        stress: input.stress ?? 0,
        cognitiveLoad: input.cognitiveLoad ?? 0,
        flowProb: input.flowProb ?? 0,
        blinkRate: input.blinkRate ?? 0,
        heartRate: input.heartRate ?? null,
        embedding: embedding as any,
        provenanceHash: input.provenanceHash,
        localOnly,
      },
    });
  }

  async getRecentState(limit = 100) {
    await this.assert("READ");
    return prisma.neuralStateRecord.findMany({
      where: { userId: this.userId, workspaceId: this.workspaceId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  // ── Flow Detection & Policy ────────────────────────────────────────

  async evaluateFlowPolicy(): Promise<FlowPolicy> {
    await this.assert("READ");

    const recent = await prisma.neuralStateRecord.findMany({
      where: { userId: this.userId, workspaceId: this.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (recent.length === 0) {
      return {
        state: "IDLE",
        flowProb: 0,
        uiMode: "normal",
        notificationsMuted: false,
        digestDeferred: false,
        subvocalReady: false,
        rationale: "No neural data available. Using default state.",
      };
    }

    const avgFlow = recent.reduce((sum, r) => sum + r.flowProb, 0) / recent.length;
    const avgCognitiveLoad = recent.reduce((sum, r) => sum + r.cognitiveLoad, 0) / recent.length;
    const avgStress = recent.reduce((sum, r) => sum + r.stress, 0) / recent.length;

    let state: FlowState = "IDLE";
    let uiMode: FlowPolicy["uiMode"] = "normal";
    let notificationsMuted = false;
    let digestDeferred = false;
    let subvocalReady = false;
    let rationale = "";

    if (avgFlow >= 0.8 && avgCognitiveLoad < 0.6) {
      state = "FLOW";
      uiMode = "flow";
      notificationsMuted = true;
      digestDeferred = true;
      subvocalReady = true;
      rationale = `Flow detected (flow_prob=${avgFlow.toFixed(2)}). Notifications muted, minimal UI active.`;
    } else if (avgFlow >= 0.5) {
      state = "FOCUS";
      uiMode = "focus";
      digestDeferred = true;
      subvocalReady = true;
      rationale = `Focus detected (flow_prob=${avgFlow.toFixed(2)}). Non-urgent notifications deferred.`;
    } else if (avgStress > 0.7 || avgCognitiveLoad > 0.85) {
      state = "CRISIS";
      uiMode = "crisis";
      notificationsMuted = true;
      rationale = `High stress/load detected (stress=${avgStress.toFixed(2)}, load=${avgCognitiveLoad.toFixed(2)}). Crisis mode: only critical alerts.`;
    } else if (avgFlow < 0.2) {
      state = "DISTRACTED";
      uiMode = "normal";
      rationale = `Low engagement (flow_prob=${avgFlow.toFixed(2)}). Normal UI mode.`;
    } else {
      state = "IDLE";
      uiMode = "normal";
      rationale = `Normal state (flow_prob=${avgFlow.toFixed(2)}).`;
    }

    const lastEvent = await prisma.flowStateEvent.findFirst({
      where: { userId: this.userId, workspaceId: this.workspaceId },
      orderBy: { createdAt: "desc" },
    });

    if (lastEvent?.toState !== state) {
      await prisma.flowStateEvent.create({
        data: {
          userId: this.userId,
          workspaceId: this.workspaceId,
          fromState: lastEvent?.toState ?? "IDLE",
          toState: state,
          flowProb: avgFlow,
          trigger: "NEURAL_SIGNAL",
          actionTaken: rationale,
        },
      });
    }

    return { state, flowProb: avgFlow, uiMode, notificationsMuted, digestDeferred, subvocalReady, rationale };
  }

  // ── Attention Fusion ───────────────────────────────────────────────

  async getAttentionMap(contextId: string, contextType: ContextType) {
    await this.assert("READ");
    return prisma.attentionMap.findFirst({
      where: { contextId, contextType, workspaceId: this.workspaceId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createAttentionMap(data: {
    contextId: string;
    contextType: ContextType;
    tokenPositions?: number[];
    modelAttentionWeights?: number[];
    neuralAttentionCorr?: number[];
    relevanceScore?: number;
  }) {
    await this.assert("CREATE");
    return prisma.attentionMap.create({
      data: {
        contextId: data.contextId,
        contextType: data.contextType,
        workspaceId: this.workspaceId,
        userId: this.userId,
        tokenPositions: data.tokenPositions ?? [],
        modelAttentionWeights: data.modelAttentionWeights ?? [],
        neuralAttentionCorr: data.neuralAttentionCorr ?? [],
        relevanceScore: data.relevanceScore ?? 0,
      },
    });
  }

  // ── Huddle Management ──────────────────────────────────────────────

  async createHuddle(input: {
    title: string;
    roomId?: string;
    subvocalEnabled?: boolean;
    neuralStreamEnabled?: boolean;
    latencyTargetMs?: number;
  }) {
    await this.assert("CREATE");
    return prisma.neuralHuddleSession.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        roomId: input.roomId,
        title: input.title,
        subvocalEnabled: input.subvocalEnabled ?? false,
        neuralStreamEnabled: input.neuralStreamEnabled ?? false,
        latencyTargetMs: input.latencyTargetMs ?? 25,
        status: "SCHEDULED",
        eventStreamTopic: `n0va:neural:huddle:${this.workspaceId}:${Date.now()}`,
      },
    });
  }

  async startHuddle(sessionId: string) {
    await this.assert("UPDATE");
    return prisma.neuralHuddleSession.update({
      where: { id: sessionId },
      data: { status: "LIVE", startedAt: new Date() },
    });
  }

  async endHuddle(sessionId: string) {
    await this.assert("UPDATE");
    return prisma.neuralHuddleSession.update({
      where: { id: sessionId },
      data: { status: "ENDED", endedAt: new Date() },
    });
  }

  async joinHuddle(sessionId: string, participantUserId: string) {
    await this.assert("CREATE");
    return prisma.neuralHuddleParticipant.upsert({
      where: {
        sessionId_userId: { sessionId, userId: participantUserId },
      },
      create: { sessionId, userId: participantUserId },
      update: { leftAt: null },
    });
  }

  async getActiveHuddles() {
    await this.assert("READ");
    return prisma.neuralHuddleSession.findMany({
      where: { workspaceId: this.workspaceId, status: "LIVE" },
      include: {
        participants: { include: { user: true } },
        streams: true,
      },
    });
  }

  // ── Sub-vocal Commands ─────────────────────────────────────────────

  async recordSubVocalCommand(data: {
    rawText: string;
    command?: string;
    confidence: number;
    latencyMs: number;
    sessionId?: string;
    executed?: boolean;
    fallbackUsed?: boolean;
  }) {
    await this.assert("CREATE");
    return prisma.subVocalCommand.create({
      data: {
        userId: this.userId,
        workspaceId: this.workspaceId,
        sessionId: data.sessionId,
        rawText: data.rawText,
        command: data.command,
        confidence: data.confidence,
        latencyMs: data.latencyMs,
        executed: data.executed ?? false,
        fallbackUsed: data.fallbackUsed ?? false,
      },
    });
  }

  // ── Team Dashboard (anonymized aggregate) ──────────────────────────

  async getTeamFlowSummary() {
    await this.assert("READ");

    const recentRecords = await prisma.neuralStateRecord.findMany({
      where: {
        workspaceId: this.workspaceId,
        localOnly: false,
        createdAt: { gte: new Date(Date.now() - 3600000) },
      },
      select: { attention: true, flowProb: true, stress: true, cognitiveLoad: true },
    });

    if (recentRecords.length === 0) {
      return {
        participantCount: 0,
        avgFlowProb: 0,
        avgAttention: 0,
        avgStress: 0,
        inFlowCount: 0,
        inFocusCount: 0,
      };
    }

    return {
      participantCount: recentRecords.length,
      avgFlowProb: recentRecords.reduce((s, r) => s + r.flowProb, 0) / recentRecords.length,
      avgAttention: recentRecords.reduce((s, r) => s + r.attention, 0) / recentRecords.length,
      avgStress: recentRecords.reduce((s, r) => s + r.stress, 0) / recentRecords.length,
      inFlowCount: recentRecords.filter(r => r.flowProb >= 0.8).length,
      inFocusCount: recentRecords.filter(r => r.flowProb >= 0.5 && r.flowProb < 0.8).length,
    };
  }

  // ── Privacy Utilities ──────────────────────────────────────────────

  private applyDifferentialPrivacy(embedding: Record<string, number>, epsilon: number): Record<string, number> {
    const sigma = 1.0 / epsilon;
    const noisy: Record<string, number> = {};
    for (const [key, value] of Object.entries(embedding)) {
      const noise = this.gaussianRandom(0, sigma);
      noisy[key] = Math.max(0, Math.min(1, value + noise));
    }
    return noisy;
  }

  private gaussianRandom(mean: number, std: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * std;
  }
}
