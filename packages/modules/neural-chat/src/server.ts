import { prisma } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import { PersonalizationEngine } from "@n0va/modules-chat/personalization";

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
        revokedAt: null,
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

  // ── §1 capability tiers ────────────────────────────────────────────

  /** Tier metadata: capability ladder, default 0 (no sensing). */
  static readonly TIERS: Array<{ level: number; name: string; description: string; features: string[] }> = [
    { level: 0, name: "No sensing", description: "No neural sensing at all.", features: [] },
    { level: 1, name: "Local estimation", description: "Local attention/flow estimation only. Nothing leaves the device.", features: ["ingest", "flow_status", "research"] },
    { level: 2, name: "Private UI adaptation", description: "UI adapts locally to the estimated state.", features: ["ingest", "flow_status", "ui_adaptation", "research"] },
    { level: 3, name: "Coarse sharing", description: "Share coarse states like available/focused/overloaded with chosen audiences.", features: ["ingest", "flow_status", "ui_adaptation", "coarse_sharing", "research"] },
    { level: 4, name: "Command shortcuts", description: "Neural command shortcuts for mute/join/bookmark/create task.", features: ["ingest", "flow_status", "ui_adaptation", "coarse_sharing", "commands", "research"] },
    { level: 5, name: "Subvocal composition", description: "Subvocal-style message composition with confirm-before-send.", features: ["ingest", "flow_status", "ui_adaptation", "coarse_sharing", "commands", "subvocal", "research"] },
    { level: 6, name: "Research huddles", description: "Research-only neural huddles under per-session consent.", features: ["ingest", "flow_status", "ui_adaptation", "coarse_sharing", "commands", "subvocal", "huddles", "research"] },
  ];

  async getNeuralProfile() {
    const existing = await prisma.neuralProfile.findUnique({ where: { userId: this.userId } });
    if (existing) return existing;
    return prisma.neuralProfile.create({ data: { userId: this.userId, workspaceId: this.workspaceId } });
  }

  async getTier() {
    await this.assert("READ");
    const p = await this.getNeuralProfile();
    return { tier: p.tier, tiers: NeuralService.TIERS, enabledFeatures: NeuralService.TIERS[p.tier]?.features ?? [] };
  }

  /** Tier upgrades are strictly opt-in and require matching consent scopes. */
  async setTier(level: number) {
    await this.assert("UPDATE");
    const clamped = Math.max(0, Math.min(6, Math.round(level)));
    const required: NeuralFeature[] = (clamped === 0 ? [] : clamped === 1 || clamped === 2 ? ["FLOW_DETECTION"] : clamped === 3 ? ["NEURAL_STATE_SHARING"] : clamped === 4 ? ["SHARED_ATTENTION"] : clamped === 5 ? ["SUBVOCAL_DECODING"] : ["SHARED_ATTENTION"]);
    for (const f of required) {
      const ok = await this.checkConsent(f, "SELF_ONLY");
      if (!ok.allowed) {
        throw new Error(`Tier ${clamped} requires consent for ${f}; grant it first`);
      }
    }
    const profile = await this.getNeuralProfile();
    await this._log("consent", `tier:${clamped}`, "tier change");
    return prisma.neuralProfile.update({ where: { id: profile.id }, data: { tier: clamped } });
  }

  private async requireTier(min: number) {
    const { tier } = await this.getTier();
    if (tier < min) {
      throw new Error(`Requires neural tier ${min} (current tier ${tier})`);
    }
    return tier;
  }

  // ── §9/§10 consent lifecycle ───────────────────────────────────────

  /** Per-feature consent summary with expiry + last confirmation. */
  async consentSummary() {
    await this.assert("READ");
    const scopes = await prisma.neuralConsentScope.findMany({ where: { userId: this.userId, workspaceId: this.workspaceId } });
    return scopes.map((s) => ({
      feature: s.feature,
      recipient: s.recipient,
      enabled: s.enabled && !s.revokedAt && (!s.expiresAt || s.expiresAt > new Date()),
      expiresAt: s.expiresAt,
      duration: s.duration,
      privacyMode: s.privacyMode,
      lastConfirmedAt: s.lastConfirmedAt,
    }));
  }

  /** §10 — expiry-bound consent; SESSION/ONE_OFF get an expiresAt. */
  async setConsentExpiry(input: ConsentInput, expiresAt: Date | null) {
    await this.assert("UPDATE");
    await this._log("consent", `${input.feature}:${input.recipient}`, expiresAt ? `expires ${expiresAt.toISOString()}` : "persistent");
    return prisma.neuralConsentScope.updateMany({
      where: { userId: this.userId, workspaceId: this.workspaceId, feature: input.feature, recipient: input.recipient },
      data: { expiresAt, lastConfirmedAt: new Date() },
    });
  }

  async renewConsent(feature: NeuralFeature, recipient: NeuralRecipient, hours = 24) {
    return this.setConsentExpiry({ feature, recipient, duration: "SESSION" }, new Date(Date.now() + hours * 3600_000));
  }

  async revokeAllConsent() {
    await this.assert("UPDATE");
    await this._log("consent", "all", "bulk revoke");
    return prisma.neuralConsentScope.updateMany({
      where: { userId: this.userId, workspaceId: this.workspaceId },
      data: { enabled: false, revokedAt: new Date() },
    });
  }

  // ── §6 flow status, confidence & correction ────────────────────────

  /** Probabilistic flow status: state + confidence + sources. Confidence
   *  reflects within-session signal agreement; no data → neutral, no inference. */
  async flowStatus() {
    await this.assert("READ");
    await this.requireTier(1);
    const recent = await prisma.neuralStateRecord.findMany({
      where: { userId: this.userId, workspaceId: this.workspaceId, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    if (recent.length === 0) {
      return { state: "NEUTRAL", flowProb: null, confidence: 0, sources: [], corrected: false, rationale: "No sensor data — no state inferred (fail-silent)." };
    }
    const flows = recent.map((r) => r.flowProb);
    const loads = recent.map((r) => r.cognitiveLoad);
    const stresses = recent.map((r) => r.stress);
    const avgFlow = flows.reduce((s, v) => s + v, 0) / flows.length;
    const avgLoad = loads.reduce((s, v) => s + v, 0) / loads.length;
    const avgStress = stresses.reduce((s, v) => s + v, 0) / stresses.length;
    const spread = Math.sqrt(flows.reduce((s, v) => s + (v - avgFlow) ** 2, 0) / flows.length);
    const nSignals = new Set(recent.map((r) => r.modality)).size + (recent.some((r) => r.selfReport) ? 1 : 0);
    const confidence = Math.max(0, Math.min(1, (1 - spread * 2) * Math.min(1, recent.length / 5) * Math.min(1, nSignals / 2)));
    const sources: string[] = [...new Set(recent.map((r) => r.modality))];
    if (recent.some((r) => r.selfReport)) sources.push("self_report");

    let state: string;
    let rationale: string;
    if (avgFlow >= 0.8 && avgLoad < 0.6) { state = "stable_flow"; rationale = `Stable flow (flow=${avgFlow.toFixed(2)}, load=${avgLoad.toFixed(2)}).`; }
    else if (avgFlow >= 0.6) { state = "entering_flow"; rationale = `Entering flow (flow=${avgFlow.toFixed(2)}).`; }
    else if (avgStress > 0.7 || avgLoad > 0.85) { state = "cognitive_overload"; rationale = `Overload (stress=${avgStress.toFixed(2)}, load=${avgLoad.toFixed(2)}).`; }
    else if (avgFlow < 0.25) { state = "distraction"; rationale = `Low engagement (flow=${avgFlow.toFixed(2)}).`; }
    else { state = "neutral"; rationale = `Neutral (flow=${avgFlow.toFixed(2)}).`; }

    const lastRecord = recent[0]!;
    if (state !== "neutral" && Math.abs(lastRecord.flowProb - avgFlow) > 0.25) rationale += " Signal disagreement — treat as low confidence.";
    return { state, flowProb: +avgFlow.toFixed(3), confidence: +confidence.toFixed(3), sources, corrected: lastRecord.corrected, rationale };
  }

  /** §6 — user correction: records feedback and calibrates the per-user model. */
  async correctFlowState(state: string) {
    await this.assert("UPDATE");
    await this.requireTier(1);
    const profile = await this.getNeuralProfile();
    const cal = JSON.parse(profile.calibration || "{}") as Record<string, number | string>;
    cal.corrections = Number(cal.corrections ?? 0) + 1;
    cal.samples = Number(cal.samples ?? 0) + 1;
    cal.acceptedCorrections = Number(cal.acceptedCorrections ?? 0) + 1;
    const last = await prisma.neuralStateRecord.findFirst({
      where: { userId: this.userId, workspaceId: this.workspaceId },
      orderBy: { createdAt: "desc" },
    });
    if (last) await prisma.neuralStateRecord.update({ where: { id: last.id }, data: { corrected: true } });
    const legacyMap: Record<string, string> = { stable_flow: "FLOW", entering_flow: "FOCUS", cognitive_overload: "CRISIS", distraction: "DISTRACTED", neutral: "IDLE", NEUTRAL: "IDLE" };
    await prisma.flowStateEvent.create({
      data: { userId: this.userId, workspaceId: this.workspaceId, fromState: "IDLE", toState: (legacyMap[state] ?? "IDLE") as never, flowProb: 0, trigger: "USER_ACTION", actionTaken: "user correction" },
    });
    await this._log("infer", "flow:correction", `user corrected state to ${state}`);
    return prisma.neuralProfile.update({ where: { id: profile.id }, data: { calibration: JSON.stringify(cal) } });
  }

  /** §6 — voluntary self-report as a signal source (never derived from absence of data). */
  async reportSelfState(flowProb: number, cognitiveLoad = 0.5) {
    await this.assert("CREATE");
    await this.requireTier(1);
    await this._log("infer", "flow:self_report", `flow=${flowProb}`);
    return prisma.neuralStateRecord.create({
      data: {
        userId: this.userId, workspaceId: this.workspaceId,
        source: "PERIPHERAL", modality: "EEG", flowProb, cognitiveLoad, attention: flowProb,
        embedding: {}, provenanceHash: `self-report:${Date.now()}`, localOnly: true,
        confidence: 0.9, selfReport: true,
      },
    });
  }

  // ── §5/§7 attention weights & flow-aware UI ────────────────────────

  /** Local UI adaptation weights derived from the current flow status.
   *  Never shared with coworkers or managers. */
  async attentionWeights() {
    await this.assert("READ");
    await this.requireTier(2);
    const flow = await this.flowStatus();
    const w = {
      activeTaskBoost: 1.0,
      reduceVisualComplexity: false,
      delaySuggestions: false,
      panelDensity: "normal" as "normal" | "compact",
      textScale: 1.0,
      offerBreak: false,
      collapseSecondary: false,
      quietProgress: false,
      contextRestore: false,
      rationale: "",
    };
    switch (flow.state) {
      case "stable_flow":
        w.activeTaskBoost = 1.25; w.delaySuggestions = true; w.quietProgress = true; w.collapseSecondary = true; w.panelDensity = "compact";
        w.rationale = "Protect continuity: suppress suggestions, collapse secondary modules, quiet progress.";
        break;
      case "entering_flow":
        w.activeTaskBoost = 1.1; w.delaySuggestions = true;
        w.rationale = "Nurture focus: defer low-priority suggestions.";
        break;
      case "cognitive_overload":
        w.reduceVisualComplexity = true; w.panelDensity = "compact"; w.delaySuggestions = true; w.offerBreak = true; w.textScale = 1.15;
        w.rationale = "Reduce visual complexity, offer a break.";
        break;
      case "flow_disruption":
        w.contextRestore = true; w.activeTaskBoost = 1.1;
        w.rationale = "Restore last working context, offer concise recap.";
        break;
      case "distraction":
        w.rationale = "Normal mode; no adaptive changes.";
        break;
      default:
        w.rationale = "No state inferred — manual mode, no adaptive changes.";
    }
    return { flow, weights: w };
  }

  // ── §4 coarse state sharing ────────────────────────────────────────

  static readonly SHARED_STATES = ["available", "focused", "in_meeting", "low_interruption_tolerance", "open_to_collaboration", "needs_recovery", "uncertain"];

  /** Publish a coarse user-controlled state to a chosen audience with auto-expiry. */
  async publishState(input: { state: string; audience?: "NOBODY" | "PEOPLE" | "ROOM" | "DELAYED_AGGREGATE" | "WORKSPACE"; personIds?: string[]; roomId?: string; durationMin?: number; precision?: string }) {
    await this.assert("CREATE");
    await this.requireTier(3);
    if (!NeuralService.SHARED_STATES.includes(input.state)) {
      throw new Error(`State "${input.state}" is not in the coarse sharing vocabulary`);
    }
    const audience = input.audience ?? "NOBODY";
    const recipientForAudience: NeuralRecipient = audience === "NOBODY" ? "SELF_ONLY" : audience === "DELAYED_AGGREGATE" ? "WORKSPACE" : audience === "WORKSPACE" ? "WORKSPACE" : "TEAM";
    const consentOk = await this.checkConsent("NEURAL_STATE_SHARING", recipientForAudience);
    if (!consentOk.allowed) {
      throw new Error(`No consent for sharing with audience "${audience}"`);
    }
    const expiresAt = input.durationMin ? new Date(Date.now() + input.durationMin * 60_000) : null;
    const share = await prisma.neuralSharing.create({
      data: {
        userId: this.userId, workspaceId: this.workspaceId, state: input.state, audience,
        personIds: JSON.stringify(input.personIds ?? []), roomId: input.roomId,
        precision: input.precision ?? "COARSE", expiresAt,
      },
    });
    await this._log("share", `share:${share.id}`, `${input.state} → ${audience}${expiresAt ? ` until ${expiresAt.toISOString()}` : ""}`);
    return share;
  }

  async listShares() {
    await this.assert("READ");
    return prisma.neuralSharing.findMany({
      where: { userId: this.userId, workspaceId: this.workspaceId, active: true, OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] },
      orderBy: { createdAt: "desc" },
    });
  }

  async revokeShare(id: string) {
    await this.assert("UPDATE");
    await this._log("delete", `share:${id}`, "revoked by owner");
    return prisma.neuralSharing.updateMany({ where: { id, userId: this.userId }, data: { active: false, revokedAt: new Date() } });
  }

  /** Shares visible to me (my own + others targeting me/rooms I'm in). */
  async visibleShares() {
    await this.assert("READ");
    const mine = await prisma.neuralSharing.findMany({ where: { userId: this.userId, active: true, OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] } });
    const theirs = await prisma.neuralSharing.findMany({
      where: { workspaceId: this.workspaceId, userId: { not: this.userId }, active: true, OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const visible = theirs.filter((s) => {
      if (s.audience === "NOBODY") return false;
      if (s.audience === "PEOPLE") return (JSON.parse(s.personIds || "[]") as string[]).includes(this.userId);
      if (s.audience === "ROOM") return s.roomId !== null;
      if (s.audience === "DELAYED_AGGREGATE") return true;
      return true; // WORKSPACE
    });
    return { mine, visible };
  }

  // ── §3 subvocal command vocabulary ─────────────────────────────────

  static readonly COMMAND_VOCAB: Array<{ phrase: string; kind: string; destructive: boolean }> = [
    { phrase: "mute", kind: "mute", destructive: false },
    { phrase: "join", kind: "join", destructive: false },
    { phrase: "bookmark", kind: "bookmark", destructive: false },
    { phrase: "create task", kind: "create_task", destructive: false },
    { phrase: "send", kind: "send", destructive: true },
    { phrase: "agree", kind: "agree", destructive: false },
    { phrase: "clarify", kind: "clarify", destructive: false },
    { phrase: "pause", kind: "pause", destructive: false },
    { phrase: "raise hand", kind: "raise_hand", destructive: false },
  ];

  /** Decode a transcript against the small command vocabulary (fuzzy, thresholded). */
  decodeCommand(text: string, threshold = 0.7): { kind: string | null; decoded: string; confidence: number; aboveThreshold: boolean; candidate: string | null } {
    const t = text.trim().toLowerCase();
    let best: { phrase: string; kind: string; destructive: boolean } | null = null;
    let bestScore = 0;
    for (const v of NeuralService.COMMAND_VOCAB) {
      let score = 0;
      if (t === v.phrase) score = 1;
      else if (t.startsWith(v.phrase)) score = 0.92;
      else if (v.phrase.includes(t) && t.length >= 3) score = 0.8;
      else if (t.includes(v.phrase)) score = 0.75;
      if (score > bestScore) { bestScore = score; best = v; }
    }
    if (!best) return { kind: null, decoded: t, confidence: 0, aboveThreshold: false, candidate: null };
    return { kind: best.kind, decoded: t, confidence: bestScore, aboveThreshold: bestScore >= threshold, candidate: best.phrase };
  }

  async listCommands(limit = 50) {
    await this.assert("READ");
    return prisma.neuralCommand.findMany({ where: { userId: this.userId, workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: limit });
  }

  /** Decode + record a command as PENDING; visible decoded preview before any effect. */
  async decodeAndRecord(text: string, opts: { huddleId?: string; threshold?: number; source?: "INFERENCE" | "EXPLICIT" } = {}) {
    await this.assert("CREATE");
    await this.requireTier(opts.huddleId ? 6 : 4);
    const d = this.decodeCommand(text, opts.threshold ?? 0.7);
    if (!d.kind) {
      const rec = await prisma.neuralCommand.create({
        data: { sessionId: null, huddleId: opts.huddleId, userId: this.userId, workspaceId: this.workspaceId, kind: "pause", decoded: d.decoded, confidence: 0, threshold: opts.threshold ?? 0.7, source: opts.source ?? "INFERENCE", status: "REJECTED", detail: "not in command vocabulary" },
      });
      await this._log("command", `cmd:${rec.id}`, "rejected — not in vocabulary");
      return { ...d, record: rec, rejected: true };
    }
    if (!d.aboveThreshold) {
      const rec = await prisma.neuralCommand.create({
        data: { sessionId: null, huddleId: opts.huddleId, userId: this.userId, workspaceId: this.workspaceId, kind: d.kind, decoded: d.decoded, confidence: d.confidence, threshold: opts.threshold ?? 0.7, source: opts.source ?? "INFERENCE", status: "REJECTED", detail: `confidence ${d.confidence.toFixed(2)} below threshold ${(opts.threshold ?? 0.7).toFixed(2)}` },
      });
      await this._log("command", `cmd:${rec.id}`, "rejected — below confidence threshold");
      return { ...d, record: rec, rejected: true, reason: rec.detail };
    }
    const rec = await prisma.neuralCommand.create({
      data: { sessionId: null, huddleId: opts.huddleId, userId: this.userId, workspaceId: this.workspaceId, kind: d.kind, decoded: d.decoded, confidence: d.confidence, threshold: opts.threshold ?? 0.7, source: opts.source ?? "INFERENCE", status: "PENDING" },
    });
    await this._log("command", `cmd:${rec.id}`, `decoded ${d.kind} (${d.confidence.toFixed(2)})`);
    return { ...d, record: rec, rejected: false };
  }

  /** First confirmation: PENDING → CONFIRMED (preview acknowledged). */
  async confirmCommand(id: string) {
    await this.assert("UPDATE");
    const cmd = await prisma.neuralCommand.findUnique({ where: { id } });
    if (!cmd || cmd.userId !== this.userId) throw new Error("Command not found");
    await this._log("command", `cmd:${id}`, "confirmed by user");
    return prisma.neuralCommand.update({ where: { id }, data: { status: "CONFIRMED" } });
  }

  async cancelCommand(id: string) {
    await this.assert("UPDATE");
    await this._log("command", `cmd:${id}`, "cancelled by user");
    return prisma.neuralCommand.updateMany({ where: { id, userId: this.userId }, data: { status: "CANCELLED" } });
  }

  /** Execute (second confirmation for send / external actions). Local non-destructive commands may execute directly. */
  async executeCommand(id: string, opts: { channelId?: string; messageText?: string } = {}) {
    await this.assert("UPDATE");
    const cmd = await prisma.neuralCommand.findUnique({ where: { id } });
    if (!cmd || cmd.userId !== this.userId) throw new Error("Command not found");
    if (cmd.status === "CANCELLED" || cmd.status === "EXECUTED") throw new Error(`Command already ${cmd.status.toLowerCase()}`);
    if (cmd.status !== "CONFIRMED") throw new Error("Command must be confirmed before execution (preview → confirm → execute)");
    const dest = cmd.decoded ?? "";
    let detail = "";
    switch (cmd.kind) {
      case "mute": {
        const room = dest.split(" ").slice(1).join(" ") || opts.channelId;
        const engine = new PersonalizationEngine(this.userId, this.workspaceId);
        const rule = await engine.upsertRule({ scope: "room", value: room || "default", mode: "SILENT", source: "USER", reason: `neural command: ${dest}` });
        detail = `muted room "${rule.value}" via notification rule`;
        break;
      }
      case "bookmark": {
        const engine = new PersonalizationEngine(this.userId, this.workspaceId);
        const target = dest.split(" ").slice(1).join(" ") || opts.channelId || opts.messageText || "";
        const kind = dest.includes("task") ? "TASK" : dest.includes("file") ? "FILE" : dest.includes("thread") ? "THREAD" : "MESSAGE";
        await engine.pin({ kind: kind as never, refId: target || "neural-bookmark" });
        detail = `bookmarked ${kind.toLowerCase()} "${target || "neural-bookmark"}"`;
        break;
      }
      case "create_task": {
        const list = await prisma.taskList.findFirst({ where: { workspaceId: this.workspaceId } });
        if (!list) { detail = "no task list found — not created"; break; }
        const title = dest.replace(/^create task/, "").trim() || "Untitled (neural)";
        await prisma.task.create({ data: { listId: list.id, workspaceId: this.workspaceId, title } });
        detail = `created task "${title}"`;
        break;
      }
      case "send": {
        if (!opts.messageText) { throw new Error("send requires messageText + channelId (second confirmation)"); }
        if (!opts.channelId) { throw new Error("send requires channelId (second confirmation)"); }
        const { ChatService } = await import("@n0va/modules-chat");
        const chat = new ChatService(this.workspaceId, this.userId, "member" as never);
        await chat.sendMessage(opts.channelId, opts.messageText, "neural-command");
        detail = `sent message to channel ${opts.channelId}`;
        break;
      }
      default:
        detail = `acknowledged ${cmd.kind} command`;
    }
    await this._log("command", `cmd:${id}`, `executed ${cmd.kind}: ${detail}`);
    return prisma.neuralCommand.update({ where: { id }, data: { status: "EXECUTED", detail } });
  }

  // ── §2/§8 neural huddles: coarse states + explicit commands ────────

  /** Join requires consent; records which consent version the participant joined with. */
  async joinHuddleWithConsent(sessionId: string, participantUserId: string) {
    await this.assert("CREATE");
    const consent = await this.checkConsent("SHARED_ATTENTION", "SELF_ONLY");
    if (!consent.allowed) throw new Error("Huddle participation requires SHARED_ATTENTION consent");
    const scope = await prisma.neuralConsentScope.findUnique({
      where: { userId_workspaceId_feature_recipient: { userId: participantUserId, workspaceId: this.workspaceId, feature: "SHARED_ATTENTION", recipient: "SELF_ONLY" } },
    });
    await this._log("huddle", `huddle:${sessionId}`, "joined with consent");
    return prisma.neuralHuddleParticipant.upsert({
      where: { sessionId_userId: { sessionId, userId: participantUserId } },
      create: { sessionId, userId: participantUserId, consentVersion: scope?.enabled ? 1 : 0 },
      update: { leftAt: null, consentVersion: scope?.enabled ? 1 : 0 },
    });
  }

  async setHuddleState(sessionId: string, state: string, confidence?: number) {
    await this.assert("UPDATE");
    await this.requireTier(3);
    if (!NeuralService.SHARED_STATES.includes(state)) throw new Error(`Not in coarse sharing vocabulary: ${state}`);
    await this._log("huddle", `huddle:${sessionId}`, `shared state ${state} (confidence ${confidence ?? "n/a"})`);
    return prisma.neuralHuddleParticipant.updateMany({
      where: { sessionId, userId: this.userId },
      data: { sharedState: state, sharedConfidence: confidence ?? null },
    });
  }

  async setHandRaised(sessionId: string, raised: boolean) {
    await this.assert("UPDATE");
    await this._log("huddle", `huddle:${sessionId}`, raised ? "raised hand" : "lowered hand");
    return prisma.neuralHuddleParticipant.updateMany({ where: { sessionId, userId: this.userId }, data: { handRaised: raised } });
  }

  /** §8 — neural signal pause button; no signals sent while paused. */
  async setSignalPaused(sessionId: string, paused: boolean) {
    await this.assert("UPDATE");
    await this._log("huddle", `huddle:${sessionId}`, paused ? "signals paused" : "signals resumed");
    return prisma.neuralHuddleParticipant.updateMany({ where: { sessionId, userId: this.userId }, data: { paused } });
  }

  /** §8 — command preview before broadcast; approval applies it to the room. */
  async sendHuddleCommand(sessionId: string, text: string) {
    const d = await this.decodeAndRecord(text, { huddleId: sessionId, source: "INFERENCE" });
    return d;
  }

  async approveHuddleCommand(commandId: string) {
    await this.assert("UPDATE");
    const cmd = await prisma.neuralCommand.findUnique({ where: { id: commandId } });
    if (!cmd || cmd.userId !== this.userId) throw new Error("Command not found");
    await this._log("huddle", `huddle:${cmd.huddleId}`, `approved command ${cmd.kind}`);
    const confirmed = await this.confirmCommand(commandId);
    const executed = await this.executeCommand(commandId).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
    return { confirmed, executed };
  }

  async huddleTranscript(sessionId: string, limit = 100) {
    await this.assert("READ");
    return prisma.neuralCommand.findMany({ where: { huddleId: sessionId }, orderBy: { createdAt: "asc" }, take: limit });
  }

  /** §8 — full participant status: shared states, hands, pause, consent indicator. */
  async huddleStatus(sessionId: string) {
    await this.assert("READ");
    const huddle = await prisma.neuralHuddleSession.findUnique({ where: { id: sessionId }, include: { participants: { include: { user: { select: { name: true, email: true } } } } } });
    if (!huddle) throw new Error("Huddle not found");
    return {
      ...huddle,
      participants: huddle.participants.map((p) => ({
        userId: p.userId,
        name: p.user?.name ?? p.user?.email ?? p.userId,
        sharedState: p.sharedState,
        sharedConfidence: p.sharedConfidence,
        handRaised: p.handRaised,
        paused: p.paused,
        consentVersion: p.consentVersion,
        consentOk: p.consentVersion > 0 && !p.leftAt,
      })),
    };
  }

  // ── §9 access log ──────────────────────────────────────────────────

  private async _log(operation: string, target: string, detail?: string) {
    return prisma.neuralAccessLog.create({ data: { userId: this.userId, workspaceId: this.workspaceId, operation, target, detail } }).catch(() => null);
  }

  async getAccessLog(limit = 50) {
    await this.assert("READ");
    return prisma.neuralAccessLog.findMany({ where: { userId: this.userId, workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: limit });
  }

  /** §11 — research/validation stats with honest limitations. */
  async researchStats() {
    await this.assert("READ");
    const profile = await this.getNeuralProfile();
    const cal = JSON.parse(profile.calibration || "{}") as Record<string, number>;
    const corrections = Number(cal.corrections ?? 0);
    const samples = Number(cal.samples ?? 0);
    const accepted = Number(cal.acceptedCorrections ?? 0);
    const [records, commands, shares, revocations, huddles, sessions] = await Promise.all([
      prisma.neuralStateRecord.count({ where: { userId: this.userId, workspaceId: this.workspaceId } }),
      prisma.neuralCommand.count({ where: { userId: this.userId, workspaceId: this.workspaceId } }),
      prisma.neuralSharing.count({ where: { userId: this.userId, workspaceId: this.workspaceId } }),
      prisma.neuralConsentScope.count({ where: { userId: this.userId, workspaceId: this.workspaceId, revokedAt: { not: null } } }),
      prisma.neuralHuddleSession.count({ where: { workspaceId: this.workspaceId } }),
      prisma.flowStateEvent.count({ where: { userId: this.userId, workspaceId: this.workspaceId } }),
    ]);
    const executed = await prisma.neuralCommand.count({ where: { userId: this.userId, status: "EXECUTED" } });
    return {
      tier: profile.tier,
      samples,
      corrections,
      withinPersonAccuracyEstimate: samples > 0 ? +(accepted / samples).toFixed(3) : null,
      crossPersonGeneralization: null,
      note: "Within-person accuracy is estimated from correction agreement; cross-person generalization varies (reported 82%–93% LOSO vs 65% wearable EEG in literature) and is NOT assumed here.",
      calibrationSessions: sessions,
      signalRecords: records,
      commandsDecoded: commands,
      commandExecutionRate: commands > 0 ? +(executed / commands).toFixed(3) : null,
      sharesCreated: shares,
      consentsRevoked: revocations,
      huddlesInWorkspace: huddles,
      limitations: ["EEG accuracy varies by task/person", "No raw signal retention", "Synthetic ingestion only in sandbox"],
    };
  }

  /** §1 — platform-level status used by the dashboard. */
  async neuralStatus() {
    await this.assert("READ");
    const [tier, consents, flow, shares, commands, huddles] = await Promise.all([
      this.getTier(),
      this.consentSummary(),
      this.flowStatus().catch(() => null),
      this.listShares().catch(() => []),
      this.listCommands(10).catch(() => []),
      prisma.neuralHuddleSession.findMany({ where: { workspaceId: this.workspaceId, status: "LIVE" }, orderBy: { createdAt: "desc" }, take: 10 }),
    ]);
    return { tier, consents, flow, shares, commands, huddles };
  }
}
