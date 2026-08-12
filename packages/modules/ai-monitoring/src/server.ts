import { prisma } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "ai-monitoring";

export interface MonitorSignals {
  sentiment: number;
  toxicity: number;
  conflict_risk: number;
  engagement_health: number;
}

export interface MonitorInsights {
  topic?: string;
  suggested_expert?: string;
  faq_candidate?: boolean;
}

export interface AnalysisOutput {
  monitorId: string;
  signals: MonitorSignals;
  insights: MonitorInsights;
  actions: string[];
  status: string;
}

export interface ReplySuggestion {
  id: string;
  intent: string;
  tone: string;
  body: string;
  rank: number;
  styleMatch: number;
  knowledgeBased: boolean;
  approvalRequired: boolean;
}

export interface ToxicityResult {
  score: number;
  categories: string[];
  action: string;
  policy: string;
}

export interface ConflictResult {
  riskScore: number;
  severity: string;
  signals: Record<string, number>;
  response: string;
}

export interface EngagementResult {
  messageVelocity: number;
  participationDiversity: number;
  replyLatencySec: number;
  unansweredQuestions: number;
  threadResolutionRate: number;
  activeContributorRatio: number;
  conflictToResolutionRatio: number;
  sentimentTrend: number;
  focusScore: number;
  burnoutRisk: number;
  healthScore: number;
  status: string;
}

export interface InsightResult {
  kind: string;
  title: string;
  summary: string;
  explanation?: string;
  confidence: number;
  supportingThreads: string[];
  topic?: string;
}

export interface FaqCandidate {
  question: string;
  shortAnswer: string;
  sourceThreads: string[];
  sourceMessages: string[];
  frequency: number;
  confidence: number;
}

export interface ExpertCandidate {
  userId: string;
  topic: string;
  confidence: number;
  availability: string | null;
  resolutionRate: number;
  messageCount: number;
}

const POSITIVE_WORDS = [
  "great", "awesome", "love", "thanks", "thank", "appreciate", "perfect", "amazing", "excellent",
  "nice", "good", "helpful", "awesome", "glad", "happy", "awesome", "congrats", "well done",
  "agreed", "works", "fixed", "resolved", "solved", "approved", "looks good", "on track", "done",
  "smooth", "efficient", "fast", "clear", "understood", "sounds good", "perfect", "brilliant",
];

const NEGATIVE_WORDS = [
  "bad", "terrible", "awful", "hate", "frustrated", "annoying", "stupid", "dumb", "broken",
  "fails", "failure", "crash", "bug", "error", "slow", "late", "missed", "wrong", "can't",
  "cannot", "won't", "disagree", "blocked", "stuck", "urgent", "pissed", "angry", "disappointed",
  "unacceptable", "horrible", "worst", "problem", "issue", "tired", "burned out", "overwhelmed",
  "behind", "delayed", "impossible", "useless", "sucks", "waste", "no progress", "regression",
];

const PROFANITY_PATTERNS = [
  /\bfuck(ing|ed|s|ing)?\b/i, /\bshit(t|ty)?\b/i, /\bdamn(ed|it)?\b/i, /\bass(?:hole|hat)?\b/i,
  /\bbitch(es|ing)?\b/i, /\bcunt(s)?\b/i, /\bdick(s)?\b/i, /\bdumbass\b/i, /\bfag(?:got)?\b/i,
];

const HARASSMENT_PATTERNS = [
  /\b(?:you|ur|your)\s+(?:are|r|is)\s+(?:a|an)?\s*(?:idiot|moron|loser|joke|pathetic|worthless)\b/i,
  /\bstupid\s+(?:you|ur|your)\b/i, /\bshut\s*(?:up|the\s+fuck\s+up)\b/i, /\bkys\b/i,
  /\bkill\s+(?:yourself|urself)\b/i, /\bgo\s+(?:die|away)\b/i,
];

const SPAM_PATTERNS = [
  /\b(?:free|buy|cheap|discount|click here|limited time|act now|guaranteed)\b.*\b(?:offer|deal|win|prize|money)\b/i,
  /(?:http|https|www\.)\S+\s*(?:http|https|www\.)\S+/i,
];

const DISAGREEMENT_PATTERNS = [
  /^no\b/i, /^wrong\b/i, /^not true\b/i, /^that['’]s wrong\b/i, /\byou['’]re wrong\b/i,
  /\bdisagree\b/i, /\byou don['’]t (?:understand|get it)\b/i, /\bthat makes no sense\b/i,
  /\bstop (?:saying|arguing|defending)\b/i,
];

const SARCASM_PATTERNS = [
  /\b(?:oh|yeah|sure|right)\s+because\b/i, /\bgreat\s+job\b.*\?/i, /\bnice\s+one\b.*(?:dumb|idiot|joke)/i,
  /\b(?:really|seriously)\?\s*(?:again|still)\b/i, /^of\s+course\s+it['’]s\s+\w+$/i,
];

const INTENT_PATTERNS: Record<string, RegExp[]> = {
  ACKNOWLEDGEMENT: [/^(ok|okay|got it|understood|roger|copy|sounds good|k|kk)\b/i, /^thanks?/i, /\bwill do\b/i],
  SCHEDULING: [/\b(?:schedule|book|reserve|time|meeting|when|available|free|calendar|slot|tomorrow|next week)\b/i],
  STATUS_UPDATE: [/\b(?:status|update|progress|how'?s it going|where are we|any news|checking in)\b/i],
  DECISION_CONFIRMATION: [/\b(?:confirm|approve|agreed?|decision|go ahead|sign off|yes, let'?s|we'?re good)\b/i],
  ACTION_TAKEN: [/\b(?:assign|done|finished|complete|handled|took care of|will (?:do|handle|check|review|send))\b/i],
  QUESTION: [/\b(?:what|how|who|when|where|why|which|can you|could you|do you|does anyone)\b.*\?/i],
  CLARIFICATION: [/\b(?:clarify|clarification|what do you mean|can you rephrase|explain|not sure what)\b/i],
};

const TOPIC_KEYWORDS: Array<{ topic: string; keywords: RegExp[] }> = [
  { topic: "API", keywords: [/\bapi\b/i, /\bendpoint\b/i, /\bgraphql\b/i, /\brest\b/i, /\bwebhook\b/i, /\bhttp\b/i, /\bpayload\b/i] },
  { topic: "Migration", keywords: [/\bmigration\b/i, /\bmigrate\b/i, /\blegacy\b/i, /\bport\s+(?:to|from)\b/i, /\bschema change\b/i, /\bdatabase\s+migration\b/i] },
  { topic: "Design", keywords: [/\bdesign\b/i, /\bui\b/i, /\bux\b/i, /\bfigma\b/i, /\bwireframe\b/i, /\bprototype\b/i, /\bmockup\b/i, /\bbranding\b/i] },
  { topic: "Infrastructure", keywords: [/\bserver\b/i, /\bdeploy\b/i, /\bkubernetes\b/i, /\bdocker\b/i, /\bcloud\b/i, /\baws\b/i, /\bazure\b/i, /\bscaling\b/i, /\bload balanc\w+/i, /\blatency\b/i] },
  { topic: "Security", keywords: [/\bsecurity\b/i, /\bauth\b/i, /\boauth\b/i, /\bpassword\b/i, /\bencrypt\w+\b/i, /\bpermission\b/i, /\baccess control\b/i, /\bvulnerab\w+\b/i] },
  { topic: "Testing", keywords: [/\btest\w*\b/i, /\bqa\b/i, /\bregression\b/i, /\bcoverage\b/i, /\bci\b/i, /\bcd\b/i, /\bjenkins\b/i, /\bsmoke test\b/i] },
  { topic: "Data", keywords: [/\bdata\b/i, /\banalytics\b/i, /\bdashboard\b/i, /\breport\b/i, /\bmetrics\b/i, /\bquery\b/i, /\betl\b/i, /\bwarehouse\b/i] },
  { topic: "Onboarding", keywords: [/\bonboard\w*\b/i, /\bwelcome\b/i, /\bnew hire\b/i, /\bstart\b/i, /\bsetup\b/i, /\binvite\b/i, /\baccount\b/i] },
  { topic: "Billing", keywords: [/\bbill\w*\b/i, /\binvoice\b/i, /\bpayment\b/i, /\bsubscription\b/i, /\bplan\b/i, /\bprice\b/i, /\brefund\b/i, /\bcharge\b/i] },
  { topic: "Support", keywords: [/\bhelp\b/i, /\bissue\b/i, /\bproblem\b/i, /\bbug\b/i, /\bnot working\b/i, /\bfaq\b/i, /\berror\b/i, /\bticket\b/i] },
];

const STYLE_REPLY_MAP: Record<string, string[]> = {
  ACKNOWLEDGEMENT: {
    CONCISE: ["Got it.", "Noted.", "Will do."],
    FRIENDLY: ["Sounds good!", "Thanks for the update!", "Got it — appreciate you."],
    FORMAL: ["Understood. Thank you for the update.", "Noted. I will proceed accordingly."],
    FIRM: ["Understood. I will handle this.", "Noted. Proceeding as agreed."],
  },
  SCHEDULING: {
    CONCISE: ["I'll send a time.", "Works for me."],
    FRIENDLY: ["Happy to schedule — what time works for you?", "I can set that up!"],
    FORMAL: ["I am available to schedule at your convenience.", "Please propose a time and I will confirm."],
    FIRM: ["Let's lock a time now.", "I'll block the slot and confirm."],
  },
  STATUS_UPDATE: {
    CONCISE: ["I'll check and get back.", "Standing by."],
    FRIENDLY: ["Let me check and get right back to you!", "I'll update you as soon as I know."],
    FORMAL: ["I will investigate and report back.", "I will follow up with the current status."],
    FIRM: ["I'll check and get back — no delays.", "I will have an update shortly."],
  },
  DECISION_CONFIRMATION: {
    CONCISE: ["Confirmed.", "Approved."],
    FRIENDLY: ["You're all set — go for it!", "Confirmed, we're good to go!"],
    FORMAL: ["Confirmed. The decision is recorded.", "Approved. Proceeding as discussed."],
    FIRM: ["Confirmed. This is locked in.", "Approved — moving forward."],
  },
  ACTION_TAKEN: {
    CONCISE: ["I'll assign this.", "Handled."],
    FRIENDLY: ["I'll assign this and let you know!", "Done — took care of it."],
    FORMAL: ["I will assign this to the appropriate owner.", "I have taken care of this."],
    FIRM: ["I'll assign this now.", "I'll own this and see it through."],
  },
  QUESTION: {
    CONCISE: ["I'll look into it.", "Let me find out."],
    FRIENDLY: ["Great question — let me find out for you!", "I'll look into it and get back."],
    FORMAL: ["I will research this and provide an answer.", "I will look into it and respond."],
    FIRM: ["I'll find out and give you a clear answer.", "I'll get you a direct answer."],
  },
  CLARIFICATION: {
    CONCISE: ["Can you clarify?", "What do you mean?"],
    FRIENDLY: ["Just to make sure I follow — can you clarify?", "Want to clarify that a bit?"],
    FORMAL: ["Could you please clarify the question?", "I would appreciate further clarification."],
    FIRM: ["Please clarify — I want to give you the right answer.", "Let's be specific here."],
  },
};

const ACTION_AWARE_REPLIES: Record<string, { match: RegExp; reply: string; approvalRequired: boolean }[]> = {
  assign: [{ match: /\bassign\b/i, reply: "I'll assign this now.", approvalRequired: false }],
  check: [{ match: /\b(?:check|look into|investigate|verify|confirm status)\b/i, reply: "I'll check and get back.", approvalRequired: false }],
  schedule: [{ match: /\b(?:schedule|book|block time|set up)\b/i, reply: "I'll set up a time.", approvalRequired: false }],
  send: [{ match: /\b(?:send|email|share|push)\b/i, reply: "I'll send it over.", approvalRequired: false }],
  create: [{ match: /\b(?:create|build|write|draft)\b/i, reply: "I'll draft this.", approvalRequired: false }],
  external: [{ match: /\b(?:post|publish|deploy|release|invoice|charge|refund|submit|ship|announce|notify\s+customer|external)\b/i, reply: "This will affect an external system — requires approval.", approvalRequired: true }],
};

export class AiMonitoringService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for ai-monitoring`);
    }
  }

  // ---------------------------------------------------------------------------
  // Tiered AI governance
  // ---------------------------------------------------------------------------

  async getTier(scope: string): Promise<any> {
    await this.assert("READ");
    let config = await prisma.aiTierConfig.findUnique({
      where: { workspaceId_scope: { workspaceId: this.workspaceId, scope } },
    });
    if (!config) {
      config = await prisma.aiTierConfig.findUnique({
        where: { workspaceId_scope: { workspaceId: this.workspaceId, scope: "workspace" } },
      });
    }
    if (!config) {
      config = await prisma.aiTierConfig.create({
        data: { workspaceId: this.workspaceId, scope, tier: "TIER_0", monitoringEnabled: false },
      });
    }
    return config;
  }

  async configureTier(input: {
    scope: string;
    tier: string;
    monitoringEnabled?: boolean;
    retentionDays?: number;
    roleAwareSeverity?: boolean;
    multilingual?: boolean;
  }) {
    await this.assert("UPDATE");
    return prisma.aiTierConfig.upsert({
      where: { workspaceId_scope: { workspaceId: this.workspaceId, scope: input.scope } },
      create: {
        workspaceId: this.workspaceId, scope: input.scope, tier: input.tier as any,
        monitoringEnabled: input.monitoringEnabled ?? false, retentionDays: input.retentionDays ?? 90,
        roleAwareSeverity: input.roleAwareSeverity ?? false, multilingual: input.multilingual ?? false,
      },
      update: {
        tier: input.tier as any, monitoringEnabled: input.monitoringEnabled,
        retentionDays: input.retentionDays, roleAwareSeverity: input.roleAwareSeverity,
        multilingual: input.multilingual,
      },
    });
  }

  private tierAllows(tier: string, minimumTier: number): boolean {
    const rank: Record<string, number> = { TIER_0: 0, TIER_1: 1, TIER_2: 2, TIER_3: 3, TIER_4: 4 };
    return (rank[tier] ?? 0) >= minimumTier;
  }

  // ---------------------------------------------------------------------------
  // Unified analysis entry point
  // ---------------------------------------------------------------------------

  async analyzeMessage(messageId: string, input?: { channelId?: string; threadId?: string }): Promise<AnalysisOutput> {
    await this.assert("CREATE");
    const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new Error("Message not found");

    const channelId = input?.channelId ?? message.channelId;
    const scope = input?.threadId ? `thread:${input.threadId}` : `room:${channelId}`;
    const tierConfig = await this.getTier(scope);

    const signals = this.computeSignals(message.body);
    const topic = this.detectTopic(message.body);
    const insights: MonitorInsights = { topic };
    const actions: string[] = [];

    if (signals.toxicity > 0.6) {
      const toxicity = await this.applyModeration(message, signals.toxicity, tierConfig);
      actions.push(`moderation:${toxicity.action.toLowerCase()}`);
    }

    const suggestedExpert = topic ? await this.findBestExpert(topic) : undefined;
    if (suggestedExpert) insights.suggested_expert = suggestedExpert.userId;
    if (topic) insights.suggested_expert = insights.suggested_expert ?? undefined;

    const engagement = await this.snapshotEngagement(channelId, input?.threadId);
    signals.engagement_health = engagement.healthScore;
    actions.push("monitor_observed");

    if (this.tierAllows(tierConfig.tier, 1)) {
      const replies = await this.suggestReplies(messageId, { threadId: input?.threadId });
      if (replies.length > 0) actions.push("show_smart_reply");
    }

    const faqCandidate = await this.checkFaqCandidate(message.body);
    if (faqCandidate.frequency >= 2) insights.faq_candidate = true;

    const conflict = await this.detectConflict(channelId, input?.threadId);
    if (conflict && conflict.riskScore > 0.5) {
      actions.push(`conflict:${conflict.response.toLowerCase()}`);
    }

    const monitor = await prisma.conversationMonitor.create({
      data: {
        monitorId: `mon_${Date.now().toString(36)}`,
        scope, workspaceId: this.workspaceId, channelId, threadId: input?.threadId, messageId,
        signals: signals as any,
        insights: insights as any,
        actions,
        status: actions.some(a => a.startsWith("conflict:")) ? "ALERTED" : "OBSERVED",
      },
    });

    await prisma.sentimentRecord.create({
      data: {
        workspaceId: this.workspaceId, channelId, threadId: input?.threadId, messageId,
        senderId: message.createdById, topic, score: signals.sentiment, confidence: 0.7,
      },
    });

    return { monitorId: monitor.monitorId, signals, insights, actions, status: monitor.status };
  }

  // ---------------------------------------------------------------------------
  // Signal computation (lexical heuristics)
  // ---------------------------------------------------------------------------

  private computeSignals(body: string): MonitorSignals {
    const tokens = body.toLowerCase().split(/\s+/);
    const wordCount = tokens.length || 1;
    let pos = 0, neg = 0;
    for (const w of tokens) {
      const clean = w.replace(/[^a-z]/gi, "");
      if (POSITIVE_WORDS.includes(clean)) pos++;
      if (NEGATIVE_WORDS.includes(clean)) neg++;
    }
    let sentiment = (pos - neg) / Math.min(wordCount, 20);
    sentiment = Math.max(-1, Math.min(1, sentiment));

    const toxicity = this.computeToxicity(body);

    const conflict_risk = this.computeConflictRisk(body, sentiment, toxicity);

    return { sentiment, toxicity, conflict_risk, engagement_health: 0.5 };
  }

  private computeToxicity(body: string): number {
    let score = 0;
    for (const p of PROFANITY_PATTERNS) if (p.test(body)) score += 0.35;
    for (const p of HARASSMENT_PATTERNS) if (p.test(body)) score += 0.45;
    for (const p of SPAM_PATTERNS) if (p.test(body)) score += 0.25;
    for (const p of DISAGREEMENT_PATTERNS) if (p.test(body)) score += 0.1;
    return Math.min(1, score);
  }

  private computeConflictRisk(body: string, sentiment: number, toxicity: number): number {
    let risk = toxicity;
    if (sentiment < -0.4) risk += 0.3;
    if (DISAGREEMENT_PATTERNS.some(p => p.test(body))) risk += 0.25;
    if (SARCASM_PATTERNS.some(p => p.test(body))) risk += 0.25;
    if ((body.match(/!/g) ?? []).length >= 2) risk += 0.1;
    return Math.min(1, risk);
  }

  private detectTopic(body: string): string | undefined {
    let best: { topic: string; hits: number } | undefined;
    for (const t of TOPIC_KEYWORDS) {
      const hits = t.keywords.filter(k => k.test(body)).length;
      if (hits > 0 && (!best || hits > best.hits)) best = { topic: t.topic, hits };
    }
    return best?.topic;
  }

  // ---------------------------------------------------------------------------
  // Smart replies
  // ---------------------------------------------------------------------------

  async suggestReplies(messageId: string, options?: { threadId?: string; tone?: string; userStyle?: string[] }): Promise<ReplySuggestion[]> {
    await this.assert("CREATE");
    const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new Error("Message not found");

    const intent = this.detectIntent(message.body);
    const tone = options?.tone ?? (this.tierAllows("TIER_1", 1) ? "CONCISE" : "FRIENDLY");

    const templates = (STYLE_REPLY_MAP as any)[intent] ?? STYLE_REPLY_MAP.ACKNOWLEDGEMENT;
    const variants = [
      { tone: "CONCISE", body: templates.CONCISE[0], styleMatch: 0.9 },
      { tone: "FRIENDLY", body: templates.FRIENDLY[0], styleMatch: 0.8 },
      { tone: "FORMAL", body: templates.FORMAL[0], styleMatch: 0.6 },
      { tone: "FIRM", body: templates.FIRM[0], styleMatch: 0.5 },
    ];

    const actionAware = this.getActionAwareReply(message.body);
    const suggestions: Array<Omit<ReplySuggestion, "id">> = [];
    let rank = 1;

    if (options?.userStyle?.length) {
      const styled = options.userStyle.map(s => ({ ...s as any }));
      const _ = styled;
    }

    variants.forEach(v => {
      suggestions.push({
        intent, tone: v.tone, body: v.body, rank: rank++, styleMatch: v.styleMatch,
        knowledgeBased: false, approvalRequired: false,
      });
    });

    if (actionAware) {
      suggestions.unshift({
        intent, tone, body: actionAware.reply, rank: 0, styleMatch: 1.0,
        knowledgeBased: false, approvalRequired: actionAware.approvalRequired,
      });
    }

    if (options?.threadId) {
      const thread = await prisma.threadMetadata.findUnique({ where: { threadId: options.threadId } });
      if (thread) {
        suggestions.unshift({
          intent: "STATUS_UPDATE", tone, body: `Re: "${thread.title}" — I'll check and get back.`,
          rank: 0, styleMatch: 0.95, knowledgeBased: false, approvalRequired: false,
        });
      }
    }

    const kb = await this.matchKnowledgeBase(message.body);
    if (kb) {
      suggestions.push({
        intent, tone: "FRIENDLY", body: kb.answer, rank: rank++, styleMatch: 0.7,
        knowledgeBased: true, approvalRequired: false,
      });
    }

    const deduped = Array.from(new Map(suggestions.map(s => [s.body, s])).values());
    const top = deduped.slice(0, 5).sort((a, b) => b.styleMatch - a.styleMatch);
    const ranked = top.map((s, i) => ({ ...s, rank: i + 1 }));

    const created: ReplySuggestion[] = [];
    for (const s of ranked) {
      const row = await prisma.smartReplySuggestion.create({
        data: {
          workspaceId: this.workspaceId, messageId, channelId: message.channelId,
          threadId: options?.threadId, intent: s.intent as any, tone: s.tone as any,
          body: s.body, rank: s.rank, styleMatch: s.styleMatch,
          knowledgeBased: s.knowledgeBased, approvalRequired: s.approvalRequired,
          status: "PENDING",
        },
      });
      created.push({ ...s, id: row.id });
    }

    return created;
  }

  private detectIntent(body: string): string {
    for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
      if (patterns.some(p => p.test(body))) return intent;
    }
    if (this.getActionAwareReply(body)) return "ACTION_TAKEN";
    return "ACKNOWLEDGEMENT";
  }

  private getActionAwareReply(body: string): { reply: string; approvalRequired: boolean } | undefined {
    for (const groups of Object.values(ACTION_AWARE_REPLIES)) {
      for (const item of groups) {
        if (item.match.test(body)) return { reply: item.reply, approvalRequired: item.approvalRequired };
      }
    }
    return undefined;
  }

  private async matchKnowledgeBase(body: string): Promise<{ answer: string; source: string } | undefined> {
    const faqs = await prisma.faqEntry.findMany({
      where: { workspaceId: this.workspaceId, status: "PUBLISHED" },
      orderBy: { frequency: "desc" },
      take: 20,
    });
    for (const faq of faqs) {
      const words = faq.question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const hits = words.filter(w => body.toLowerCase().includes(w)).length;
      if (words.length > 0 && hits / words.length >= 0.5) {
        return { answer: faq.shortAnswer, source: faq.question };
      }
    }
    return undefined;
  }

  async acceptSuggestion(id: string): Promise<void> {
    await this.assert("UPDATE");
    await prisma.smartReplySuggestion.update({ where: { id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
  }

  async dismissSuggestion(id: string): Promise<void> {
    await this.assert("UPDATE");
    await prisma.smartReplySuggestion.update({ where: { id }, data: { status: "DISMISSED" } });
  }

  // ---------------------------------------------------------------------------
  // Sentiment monitoring
  // ---------------------------------------------------------------------------

  async getSentiment(scope: string, options?: { channelId?: string; threadId?: string; senderId?: string; topic?: string; since?: string; limit?: number }) {
    await this.assert("READ");
    const where: any = { workspaceId: this.workspaceId };
    if (options?.channelId) where.channelId = options.channelId;
    if (options?.threadId) where.threadId = options.threadId;
    if (options?.senderId) where.senderId = options.senderId;
    if (options?.topic) where.topic = options.topic;
    if (options?.since) where.createdAt = { gte: new Date(options.since) };

    const records = await prisma.sentimentRecord.findMany({
      where, orderBy: { createdAt: "desc" }, take: options?.limit ?? 200,
    });

    const aggregate = this.aggregateSentiment(records);
    const trend = this.computeSentimentTrend(records);
    const burst = this.detectNegativityBurst(records);

    return { scope, records, aggregate, trend, burst };
  }

  private aggregateSentiment(records: any[]): { avg: number; positive: number; neutral: number; negative: number; count: number } {
    if (records.length === 0) return { avg: 0, positive: 0, neutral: 0, negative: 0, count: 0 };
    const sum = records.reduce((acc, r) => acc + r.score, 0);
    return {
      avg: +(sum / records.length).toFixed(3),
      positive: records.filter(r => r.score > 0.15).length,
      neutral: records.filter(r => r.score >= -0.15 && r.score <= 0.15).length,
      negative: records.filter(r => r.score < -0.15).length,
      count: records.length,
    };
  }

  private computeSentimentTrend(records: any[]): { slope: number; direction: "cooling" | "heating" | "stable" } {
    if (records.length < 3) return { slope: 0, direction: "stable" };
    const sorted = [...records].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const half = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, half).reduce((acc, r) => acc + r.score, 0) / half;
    const secondHalf = sorted.slice(half).reduce((acc, r) => acc + r.score, 0) / (sorted.length - half);
    const slope = +(secondHalf - firstHalf).toFixed(3);
    const direction = slope <= -0.15 ? "cooling" : slope >= 0.15 ? "heating" : "stable";
    return { slope, direction };
  }

  private detectNegativityBurst(records: any[]): { active: boolean; windowAvg: number; recentNegative: number } | null {
    if (records.length < 5) return null;
    const sorted = [...records].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const window = sorted.slice(-5);
    const windowAvg = window.reduce((acc, r) => acc + r.score, 0) / window.length;
    const recentNegative = window.filter(r => r.score < -0.25).length;
    if (windowAvg < -0.3 && recentNegative >= 3) return { active: true, windowAvg: +windowAvg.toFixed(3), recentNegative };
    return null;
  }

  async getWeeklySentimentReport(options?: { channelId?: string; threadId?: string }) {
    await this.assert("READ");
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const where: any = { workspaceId: this.workspaceId, createdAt: { gte: since } };
    if (options?.channelId) where.channelId = options.channelId;
    if (options?.threadId) where.threadId = options.threadId;

    const records = await prisma.sentimentRecord.findMany({ where, orderBy: { createdAt: "asc" } });
    const byDay: Record<string, { count: number; sum: number; negatives: number }> = {};
    for (const r of records) {
      const day = r.createdAt.toISOString().slice(0, 10);
      byDay[day] ??= { count: 0, sum: 0, negatives: 0 };
      byDay[day].count++;
      byDay[day].sum += r.score;
      if (r.score < -0.15) byDay[day].negatives++;
    }
    const daily = Object.entries(byDay).map(([date, d]) => ({
      date, avg: +(d.sum / d.count).toFixed(3), count: d.count, negatives: d.negatives,
    }));
    const aggregate = this.aggregateSentiment(records);
    return { since, daily, aggregate };
  }

  // ---------------------------------------------------------------------------
  // Toxicity detection and moderation
  // ---------------------------------------------------------------------------

  private async applyModeration(message: any, toxicityScore: number, tierConfig: any): Promise<ToxicityResult> {
    const categories: string[] = [];
    if (PROFANITY_PATTERNS.some(p => p.test(message.body))) categories.push("PROFANITY");
    if (HARASSMENT_PATTERNS.some(p => p.test(message.body))) categories.push("HARASSMENT");
    if (SPAM_PATTERNS.some(p => p.test(message.body))) categories.push("SPAM");
    if (categories.length === 0) categories.push("OTHER");

    const severity = toxicityScore >= 0.85 ? "CRITICAL" : toxicityScore >= 0.7 ? "HIGH" : toxicityScore >= 0.55 ? "MEDIUM" : "LOW";

    let action = "FLAG";
    let policy = "HUMAN_REVIEW";
    const canAuto = this.tierAllows(tierConfig.tier, 3);
    if (canAuto && severity === "CRITICAL" && toxicityScore >= 0.9) {
      action = "HIDE";
      policy = "AUTO_ENFORCE";
    } else if (this.tierAllows(tierConfig.tier, 2) && severity === "CRITICAL") {
      action = "QUARANTINE";
      policy = "AUTO_ENFORCE";
    } else if (severity === "LOW") {
      action = "SOFT_WARN";
    } else if (severity === "MEDIUM") {
      action = "FLAG";
    } else {
      action = "ESCALATE";
    }

    await prisma.toxicityFlag.create({
      data: {
        workspaceId: this.workspaceId, channelId: message.channelId, messageId: message.id,
        senderId: message.createdById, score: toxicityScore, categories, action: action as any,
        policy: policy as any, status: "PENDING",
      },
    });

    return { score: +toxicityScore.toFixed(3), categories, action, policy };
  }

  async checkMessage(messageId: string): Promise<ToxicityResult> {
    await this.assert("CREATE");
    const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new Error("Message not found");
    const scope = `room:${message.channelId}`;
    const tierConfig = await this.getTier(scope);
    const score = this.computeToxicity(message.body);
    if (score <= 0.5) {
      return { score: +score.toFixed(3), categories: [], action: "ALLOW", policy: "AUTO_ENFORCE" };
    }
    return this.applyModeration(message, score, tierConfig);
  }

  async getModerationQueue(status?: string, options?: { channelId?: string; limit?: number }) {
    await this.assert("READ");
    const where: any = { workspaceId: this.workspaceId };
    if (status) where.status = status;
    else where.status = { in: ["PENDING", "IN_REVIEW"] };
    if (options?.channelId) where.channelId = options.channelId;

    return prisma.toxicityFlag.findMany({
      where, orderBy: { score: "desc" }, take: options?.limit ?? 50,
    });
  }

  async reviewFlag(flagId: string, decision: "APPROVED" | "REJECTED", actorId: string, reason?: string) {
    await this.assert("UPDATE");
    const flag = await prisma.toxicityFlag.findUnique({ where: { id: flagId } });
    if (!flag) throw new Error("Flag not found");

    await prisma.toxicityFlag.update({
      where: { id: flagId },
      data: { status: decision as any, reviewedBy: actorId, reviewedAt: new Date() },
    });

    await prisma.moderationAuditLog.create({
      data: {
        workspaceId: this.workspaceId, flagId, action: decision === "APPROVED" ? flag.action : "ALLOW",
        actorId, reason: reason ?? (decision === "APPROVED" ? "Approved in review" : "Rejected in review"),
      },
    });

    if (decision === "APPROVED" && (flag.action === "HIDE" || flag.action === "QUARANTINE" || flag.action === "MASK") && flag.messageId) {
      await prisma.chatMessage.update({ where: { id: flag.messageId }, data: { deletedAt: flag.action === "HIDE" ? new Date() : undefined } }).catch(() => {});
    }

    return prisma.moderationAuditLog.findFirst({ where: { flagId }, orderBy: { createdAt: "desc" } });
  }

  async lockThread(threadId: string, durationMin: number, reason: string) {
    await this.assert("UPDATE");
    const frozenUntil = new Date(Date.now() + durationMin * 60 * 1000);
    return prisma.threadMetadata.update({
      where: { threadId },
      data: { status: "LOCKED" as any, frozenUntil },
    });
  }

  // ---------------------------------------------------------------------------
  // Conflict detection
  // ---------------------------------------------------------------------------

  async detectConflict(channelId: string, threadId?: string): Promise<ConflictResult | null> {
    await this.assert("READ");
    const where: any = { channelId, deletedAt: null };
    const messages = await prisma.chatMessage.findMany({
      where, orderBy: { createdAt: "asc" }, take: 60,
    });

    if (messages.length < 4) return null;

    const signals: Record<string, number> = {};
    const sentiment = this.computeSignals(messages.map(m => m.body).join(" "));
    signals.rising_negative = Math.max(0, -sentiment.sentiment);

    const recent = messages.slice(-6);
    const rapidExchange = this.countRapidExchange(recent);
    signals.reply_burst = Math.min(1, rapidExchange / 4);

    const disagreement = messages.filter(m => DISAGREEMENT_PATTERNS.some(p => p.test(m.body))).length;
    signals.disagreement = Math.min(1, disagreement / messages.length);

    const mentions = messages.filter(m => (m.body.match(/@\w+/g) ?? []).length > 0).length;
    signals.mentions = Math.min(1, mentions / messages.length);

    const sarcasm = messages.filter(m => SARCASM_PATTERNS.some(p => p.test(m.body))).length;
    signals.sarcasm = Math.min(1, sarcasm / messages.length);

    const authors = new Set(messages.map(m => m.createdById));
    signals.participation_imbalance = authors.size <= 1 ? 1 : Math.min(1, Math.abs(messages.length - messages.length / authors.size) / messages.length);

    const riskScore = 0.25 * signals.rising_negative + 0.2 * signals.reply_burst + 0.2 * signals.disagreement +
      0.1 * signals.mentions + 0.15 * signals.sarcasm + 0.1 * signals.participation_imbalance;

    let response = "BANNER";
    let severity: string = "LOW";
    if (riskScore >= 0.75) { severity = "CRITICAL"; response = "FREEZE_THREAD"; }
    else if (riskScore >= 0.6) { severity = "HIGH"; response = "MODERATOR_INTERVENTION"; }
    else if (riskScore >= 0.45) { severity = "MEDIUM"; response = "SUGGEST_HUDDLE"; }
    else if (riskScore >= 0.3) { severity = "LOW"; response = "PRIVATE_NUDGE"; }

    if (riskScore >= 0.45) {
      await prisma.conflictAlert.create({
        data: {
          workspaceId: this.workspaceId, channelId, threadId, riskScore,
          severity: severity as any, signals: signals as any, response: response as any,
          status: riskScore >= 0.6 ? "OPEN" : "ACKNOWLEDGED",
          frozenUntil: response === "FREEZE_THREAD" ? new Date(Date.now() + 60 * 60 * 1000) : null,
        },
      });
    }

    return { riskScore: +riskScore.toFixed(3), severity, signals, response };
  }

  private countRapidExchange(messages: any[]): number {
    let count = 0;
    for (let i = 1; i < messages.length; i++) {
      const diff = new Date(messages[i].createdAt).getTime() - new Date(messages[i - 1].createdAt).getTime();
      if (diff < 2 * 60 * 1000 && messages[i].createdById !== messages[i - 1].createdById) count++;
    }
    return count;
  }

  async getConflictAlerts(options?: { status?: string; channelId?: string; limit?: number }) {
    await this.assert("READ");
    const where: any = { workspaceId: this.workspaceId };
    if (options?.status) where.status = options.status;
    if (options?.channelId) where.channelId = options.channelId;
    return prisma.conflictAlert.findMany({
      where, orderBy: [{ riskScore: "desc" }, { createdAt: "desc" }], take: options?.limit ?? 50,
    });
  }

  async resolveConflict(id: string, resolvedBy: string): Promise<void> {
    await this.assert("UPDATE");
    await prisma.conflictAlert.update({ where: { id }, data: { status: "RESOLVED", resolvedBy, resolvedAt: new Date() } });
  }

  // ---------------------------------------------------------------------------
  // Engagement health
  // ---------------------------------------------------------------------------

  async snapshotEngagement(channelId: string, threadId?: string, windowMs = 24 * 60 * 60 * 1000): Promise<EngagementResult> {
    await this.assert("CREATE");
    const since = new Date(Date.now() - windowMs);
    const where: any = { channelId, deletedAt: null };
    if (threadId) where.parentId = threadId;

    const messages = await prisma.chatMessage.findMany({ where: { ...where, createdAt: { gte: since } }, orderBy: { createdAt: "asc" } });

    const messageVelocity = messages.length;
    const authors = new Set(messages.map(m => m.createdById));
    const participationDiversity = authors.size === 0 ? 0 : Math.min(1, authors.size / Math.max(3, messages.length / 2));

    let replyLatencySec = 0, latencyCount = 0;
    for (let i = 1; i < messages.length; i++) {
      if (messages[i].createdById !== messages[i - 1].createdById) {
        replyLatencySec += (new Date(messages[i].createdAt).getTime() - new Date(messages[i - 1].createdAt).getTime()) / 1000;
        latencyCount++;
      }
    }
    replyLatencySec = latencyCount ? replyLatencySec / latencyCount : 0;

    const questionMsgs = messages.filter(m => INTENT_PATTERNS.QUESTION.some(p => p.test(m.body)));
    const unansweredQuestions = questionMsgs.filter(q => !messages.some(m => m.parentId === q.id && m.createdById !== q.createdById)).length;

    const threadRows = await prisma.threadMetadata.findMany({ where: { channelId } });
    const resolvedThreads = threadRows.filter(t => (t.status as string) === "RESOLVED").length;
    const threadResolutionRate = threadRows.length ? resolvedThreads / threadRows.length : 0;

    const activeContributorRatio = authors.size === 0 ? 0 : Math.min(1, messages.filter(m => authors.has(m.createdById)).length / messages.length);

    const conflicts = await prisma.conflictAlert.count({ where: { workspaceId: this.workspaceId, channelId } });
    const resolutions = await prisma.conflictAlert.count({ where: { workspaceId: this.workspaceId, channelId, status: "RESOLVED" } });
    const conflictToResolutionRatio = conflicts ? resolutions / conflicts : 1;

    const sentimentRecords = await prisma.sentimentRecord.findMany({
      where: { workspaceId: this.workspaceId, channelId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
    });
    const sentimentTrend = this.computeSentimentTrend(sentimentRecords).slope;

    const focusScore = Math.max(0, Math.min(1, 1 - (unansweredQuestions / Math.max(1, questionMsgs.length)) - (conflictToResolutionRatio < 0.5 ? 0.1 : 0)));

    const burnoutRisk = Math.max(0, Math.min(1, (messageVelocity > 60 ? 0.4 : 0) + (authors.size >= 2 && replyLatencySec < 60 ? 0.2 : 0) + (sentimentRecords.length && this.aggregateSentiment(sentimentRecords).avg < -0.2 ? 0.4 : 0)));

    const healthScore = Math.max(0, Math.min(1,
      0.25 * Math.min(1, messageVelocity / 50) +
      0.2 * participationDiversity +
      0.15 * Math.max(0, 1 - replyLatencySec / 3600) +
      0.15 * threadResolutionRate +
      0.1 * focusScore +
      0.15 * Math.max(0, sentimentTrend + 0.5),
    ));

    let status = "HEALTHY";
    if (messageVelocity === 0) status = "STALE";
    else if (sentimentTrend < -0.2 && healthScore < 0.4) status = "CONFLICT_RISK";
    else if (burnoutRisk > 0.5) status = "BURNOUT";
    else if (messageVelocity > 50) status = "OVERLOADED";
    else if (unansweredQuestions > 3) status = "BLOCKED";

    await prisma.engagementSnapshot.create({
      data: {
        workspaceId: this.workspaceId, channelId, threadId,
        scope: threadId ? `thread:${threadId}` : `room:${channelId}`,
        messageVelocity, participationDiversity, replyLatencySec, unansweredQuestions,
        threadResolutionRate, activeContributorRatio, conflictToResolutionRatio,
        sentimentTrend, focusScore, burnoutRisk, healthScore, status: status as any,
        windowStart: since, windowEnd: new Date(),
      },
    });

    return {
      messageVelocity, participationDiversity, replyLatencySec: +replyLatencySec.toFixed(1),
      unansweredQuestions, threadResolutionRate: +threadResolutionRate.toFixed(3),
      activeContributorRatio: +activeContributorRatio.toFixed(3),
      conflictToResolutionRatio: +conflictToResolutionRatio.toFixed(3),
      sentimentTrend, focusScore: +focusScore.toFixed(3), burnoutRisk: +burnoutRisk.toFixed(3),
      healthScore: +healthScore.toFixed(3), status,
    };
  }

  async getEngagementHistory(channelId: string, limit = 30) {
    await this.assert("READ");
    return prisma.engagementSnapshot.findMany({
      where: { workspaceId: this.workspaceId, channelId },
      orderBy: { createdAt: "desc" }, take: limit,
    });
  }

  // ---------------------------------------------------------------------------
  // Conversation insights
  // ---------------------------------------------------------------------------

  async generateInsights(options?: { channelId?: string; since?: string }): Promise<InsightResult[]> {
    await this.assert("CREATE");
    const since = options?.since ? new Date(options.since) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const where: any = { workspaceId: this.workspaceId, createdAt: { gte: since } };
    if (options?.channelId) where.channelId = options.channelId;

    const messages = await prisma.chatMessage.findMany({ where: { channelId: options?.channelId, deletedAt: null, createdAt: { gte: since } } });
    const insights: InsightResult[] = [];

    const topics: Record<string, number> = {};
    for (const m of messages) {
      const topic = this.detectTopic(m.body);
      if (topic) topics[topic] = (topics[topic] ?? 0) + 1;
    }
    const topTopics = Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topTopics.length) {
      const [topic, count] = topTopics[0]!;
      insights.push({
        kind: "TOP_TOPIC", title: `${topic} is the top topic`, summary: `${count} messages mention ${topic} in the last 30 days.`,
        explanation: `${topic} related terms spiked ${count} times — investigate workload or recurring concerns.`,
        confidence: Math.min(0.9, count / 50), supportingThreads: [], topic,
      });
    }

    const questionMsgs = messages.filter(m => INTENT_PATTERNS.QUESTION.some(p => p.test(m.body)));
    const questionCounts: Record<string, number> = {};
    for (const q of questionMsgs) {
      const key = q.body.toLowerCase().slice(0, 80).replace(/[?.,!]/g, "");
      questionCounts[key] = (questionCounts[key] ?? 0) + 1;
    }
    const recurring = Object.entries(questionCounts).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]);
    if (recurring.length) {
      const [q, c] = recurring[0]!;
      insights.push({
        kind: "RECURRING_QUESTION", title: "Recurring question detected", summary: `"${q.slice(0, 60)}..." asked ${c} times.`,
        explanation: "This repeats enough to warrant an FAQ or docs update.", confidence: Math.min(0.95, c / 5),
        supportingThreads: [], topic: this.detectTopic(q),
      });
    }

    const blockerMsgs = messages.filter(m => /(?:blocked|stuck|can't|cannot|blocker|waiting on|dependency|no access)/i.test(m.body));
    if (blockerMsgs.length) {
      insights.push({
        kind: "FREQUENT_BLOCKER", title: `${blockerMsgs.length} messages mention blockers`, summary: "Team repeatedly reports being blocked or stuck.",
        explanation: "Blocked language correlates with lower sentiment — review dependencies.", confidence: Math.min(0.9, blockerMsgs.length / 10),
        supportingThreads: [],
      });
    }

    const decisionMsgs = messages.filter(m => INTENT_PATTERNS.DECISION_CONFIRMATION.some(p => p.test(m.body)));
    if (decisionMsgs.length) {
      insights.push({
        kind: "DECISION_CLUSTER", title: `${decisionMsgs.length} decisions confirmed`, summary: "Decisions cluster around confirmations and sign-offs.",
        explanation: "Most decisions are confirmed in chat — consider formalizing in decision log.", confidence: Math.min(0.85, decisionMsgs.length / 20),
        supportingThreads: [],
      });
    }

    const objectionMsgs = messages.filter(m => /(?:too expensive|doesn'?t work|not worth|waste|against|objection|pushback|concern|risk)/i.test(m.body));
    if (objectionMsgs.length) {
      insights.push({
        kind: "COMMON_OBJECTION", title: `${objectionMsgs.length} objections raised`, summary: "Common objections appear around cost and effort.",
        explanation: "Address these proactively in comms.", confidence: Math.min(0.8, objectionMsgs.length / 5),
        supportingThreads: [],
      });
    }

    const unresolved = messages.filter(m => /(?:unresolved|still open|not solved|pending|awaiting|todo)/i.test(m.body));
    if (unresolved.length) {
      insights.push({
        kind: "UNRESOLVED_ISSUE", title: `${unresolved.length} unresolved references`, summary: "Items marked pending or unresolved remain in chat.",
        explanation: "Follow up on open threads to close the loop.", confidence: Math.min(0.8, unresolved.length / 5),
        supportingThreads: [],
      });
    }

    const byDay: Record<string, number> = {};
    for (const m of messages) {
      const day = m.createdAt.toISOString().slice(0, 10);
      byDay[day] = (byDay[day] ?? 0) + 1;
    }
    const responsePattern = this.computeResponsePattern(messages);
    insights.push({
      kind: "RESPONSIVENESS_PATTERN", title: "Responsiveness varies by time of day", summary: responsePattern,
      explanation: "Peak activity window identified from message timestamps.", confidence: 0.7, supportingThreads: [],
    });

    const sentimentByTopic = await this.sentimentByTopic(since, options?.channelId);
    if (sentimentByTopic.length) {
      insights.push({
        kind: "SENTIMENT_BY_TOPIC", title: "Sentiment differs by topic", summary: sentimentByTopic.map(s => `${s.topic}: ${s.avg}`).join(", "),
        explanation: "Some topics carry consistently negative tone.", confidence: 0.75, supportingThreads: [], topic: sentimentByTopic[0]?.topic,
      });
    }

    for (const insight of insights) {
      await prisma.conversationInsight.create({
        data: {
          workspaceId: this.workspaceId, channelId: options?.channelId,
          kind: insight.kind as any, title: insight.title, summary: insight.summary,
          explanation: insight.explanation, confidence: insight.confidence,
          supportingThreads: insight.supportingThreads, topic: insight.topic,
        },
      });
    }

    return insights;
  }

  private computeResponsePattern(messages: any[]): string {
    const byHour: Record<number, number> = {};
    for (const m of messages) byHour[new Date(m.createdAt).getHours()] = (byHour[new Date(m.createdAt).getHours()] ?? 0) + 1;
    const peak = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0];
    return peak ? `Peak activity around ${peak[0]}:00 (${peak[1]} messages).` : "Insufficient data.";
  }

  private async sentimentByTopic(since: Date, channelId?: string): Promise<Array<{ topic: string; avg: number; count: number }>> {
    const records = await prisma.sentimentRecord.findMany({
      where: { workspaceId: this.workspaceId, createdAt: { gte: since }, ...(channelId ? { channelId } : {}), topic: { not: null } },
    });
    const byTopic: Record<string, { sum: number; count: number }> = {};
    for (const r of records) {
      if (!r.topic) continue;
      byTopic[r.topic] ??= { sum: 0, count: 0 };
      byTopic[r.topic]!.sum += r.score;
      byTopic[r.topic]!.count++;
    }
    return Object.entries(byTopic).map(([topic, d]) => ({ topic, avg: +(d.sum / d.count).toFixed(3), count: d.count }));
  }

  async getInsights(options?: { channelId?: string; kind?: string; limit?: number }) {
    await this.assert("READ");
    const where: any = { workspaceId: this.workspaceId };
    if (options?.channelId) where.channelId = options.channelId;
    if (options?.kind) where.kind = options.kind;
    return prisma.conversationInsight.findMany({
      where, orderBy: [{ confidence: "desc" }, { createdAt: "desc" }], take: options?.limit ?? 50,
    });
  }

  async exportInsightsCSV(options?: { channelId?: string; kind?: string }): Promise<string> {
    await this.assert("READ");
    const insights = await this.getInsights(options);
    const header = "kind,title,summary,explanation,confidence,topic,createdAt";
    const rows = insights.map(i => [
      i.kind, `"${i.title.replace(/"/g, '""')}"`, `"${i.summary.replace(/"/g, '""')}"`,
      `"${(i.explanation ?? "").replace(/"/g, '""')}"`, i.confidence, i.topic ?? "", i.createdAt.toISOString(),
    ].join(","));
    return [header, ...rows].join("\n");
  }

  // ---------------------------------------------------------------------------
  // Auto-FAQ generation
  // ---------------------------------------------------------------------------

  private async checkFaqCandidate(body: string): Promise<{ question: string; frequency: number }> {
    const questionMsgs = await prisma.chatMessage.findMany({
      where: { workspaceId: this.workspaceId, deletedAt: null },
      orderBy: { createdAt: "desc" }, take: 200,
    });
    const normalized = body.toLowerCase().replace(/[?.,!]/g, "").slice(0, 80);
    const frequency = questionMsgs.filter(m => m.body.toLowerCase().replace(/[?.,!]/g, "").startsWith(normalized.slice(0, 40))).length;
    return { question: body, frequency };
  }

  async detectFaqCandidates(options?: { channelId?: string; minFrequency?: number }): Promise<FaqCandidate[]> {
    await this.assert("CREATE");
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const messages = await prisma.chatMessage.findMany({
      where: { workspaceId: this.workspaceId, channelId: options?.channelId, deletedAt: null, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" }, take: 500,
    });

    const questions = messages.filter(m => INTENT_PATTERNS.QUESTION.some(p => p.test(m.body)));
    const clusters: Record<string, { question: string; ids: string[]; threadIds: string[]; channelIds: string[] }> = {};

    for (const q of questions) {
      const key = q.body.toLowerCase().replace(/[?.,!]/g, "").split(/\s+/).filter(w => w.length > 3).slice(0, 5).join(" ");
      if (!key) continue;
      let matched: string | undefined;
      for (const existing of Object.keys(clusters)) {
        if (this.similarity(key, existing) >= 0.5) { matched = existing; break; }
      }
      const target = matched ?? key;
      clusters[target] ??= { question: q.body, ids: [], threadIds: [], channelIds: [] };
      clusters[target]!.ids.push(q.id);
      if (q.parentId && !clusters[target]!.threadIds.includes(q.parentId)) clusters[target]!.threadIds.push(q.parentId);
      if (!clusters[target]!.channelIds.includes(q.channelId)) clusters[target]!.channelIds.push(q.channelId);
    }

    const candidates: FaqCandidate[] = [];
    const minFreq = options?.minFrequency ?? 2;

    for (const cluster of Object.values(clusters)) {
      if (cluster.ids.length < minFreq) continue;
      const answer = await this.extractAnswer(cluster.question, cluster.ids);
      const confidence = Math.min(0.95, cluster.ids.length / 5 + (answer ? 0.3 : 0));

      await prisma.faqEntry.upsert({
        where: { id: `faq_${cluster.question.slice(0, 40).replace(/\W+/g, "_")}_${this.workspaceId}` },
        create: {
          workspaceId: this.workspaceId, question: cluster.question.slice(0, 200), shortAnswer: answer ?? "Pending review.",
          sourceThreads: cluster.threadIds, sourceMessages: cluster.ids, frequency: cluster.ids.length,
          confidence, status: "CANDIDATE",
        },
        update: { frequency: cluster.ids.length, confidence, status: "CANDIDATE", sourceThreads: cluster.threadIds },
      });

      candidates.push({
        question: cluster.question.slice(0, 200), shortAnswer: answer ?? "Pending review.",
        sourceThreads: cluster.threadIds, sourceMessages: cluster.ids,
        frequency: cluster.ids.length, confidence,
      });
    }

    return candidates.sort((a, b) => b.frequency - a.frequency);
  }

  private similarity(a: string, b: string): number {
    const aw = new Set(a.split(/\s+/));
    const bw = new Set(b.split(/\s+/));
    if (aw.size === 0 || bw.size === 0) return 0;
    let intersection = 0;
    for (const w of aw) if (bw.has(w)) intersection++;
    return intersection / Math.min(aw.size, bw.size);
  }

  private async extractAnswer(question: string, sourceMessageIds: string[]): Promise<string | undefined> {
    const threadIds = await prisma.chatMessage.findMany({
      where: { id: { in: sourceMessageIds }, parentId: { not: null } },
      select: { parentId: true },
    });
    const parentIds = [...new Set(threadIds.map(t => t.parentId as string))];
    const parentMessages = parentIds.length ? await prisma.chatMessage.findMany({
      where: { id: { in: parentIds } }, select: { body: true }, take: 10,
    }) : [];

    for (const m of parentMessages) {
      const body = m.body;
      if (/^(yes|no|ok|sure|done|fixed|look at|use|try|check|make sure|it's|it is)/i.test(body) && body.length > 20) {
        return body.slice(0, 200);
      }
    }

    const followUps = await prisma.chatMessage.findMany({
      where: { parentId: { in: sourceMessageIds }, deletedAt: null },
      select: { body: true }, take: 10,
    });
    for (const m of followUps) {
      if (m.body.length > 30 && !INTENT_PATTERNS.QUESTION.some(p => p.test(m.body))) return m.body.slice(0, 200);
    }
    return undefined;
  }

  async getFaqs(options?: { status?: string; limit?: number }) {
    await this.assert("READ");
    const where: any = { workspaceId: this.workspaceId };
    if (options?.status) where.status = options.status;
    return prisma.faqEntry.findMany({
      where, orderBy: [{ frequency: "desc" }, { updatedAt: "desc" }], take: options?.limit ?? 100,
    });
  }

  async reviewFaq(id: string, decision: "DRAFT" | "PUBLISHED" | "REJECTED", ownerId: string) {
    await this.assert("UPDATE");
    return prisma.faqEntry.update({
      where: { id },
      data: { status: decision as any, ownerId, lastUpdated: new Date() },
    });
  }

  async regenerateFaq(id: string): Promise<FaqCandidate | null> {
    await this.assert("UPDATE");
    const faq = await prisma.faqEntry.findUnique({ where: { id } });
    if (!faq) throw new Error("FAQ not found");
    const answer = await this.extractAnswer(faq.question, faq.sourceMessages);
    if (answer) {
      await prisma.faqEntry.update({ where: { id }, data: { shortAnswer: answer, lastUpdated: new Date() } });
    }
    return {
      question: faq.question, shortAnswer: answer ?? faq.shortAnswer,
      sourceThreads: faq.sourceThreads, sourceMessages: faq.sourceMessages,
      frequency: faq.frequency, confidence: faq.confidence,
    };
  }

  // ---------------------------------------------------------------------------
  // Expert identification
  // ---------------------------------------------------------------------------

  private async findBestExpert(topic: string): Promise<ExpertCandidate | undefined> {
    const experts = await this.identifyExperts(topic);
    return experts[0];
  }

  async identifyExperts(topic: string): Promise<ExpertCandidate[]> {
    await this.assert("READ");
    const messages = await prisma.chatMessage.findMany({
      where: { workspaceId: this.workspaceId, deletedAt: null },
      orderBy: { createdAt: "desc" }, take: 500,
    });

    const topicMessages = messages.filter(m => this.detectTopic(m.body) === topic);
    const byUser: Record<string, { count: number; vocab: string[]; firstResponse: number[] }> = {};

    for (const m of topicMessages) {
      byUser[m.createdById] ??= { count: 0, vocab: [], firstResponse: [] };
      byUser[m.createdById]!.count++;
      byUser[m.createdById]!.vocab.push(...m.body.toLowerCase().split(/\s+/));
    }

    const endorsements = await prisma.chatMessage.findMany({
      where: { workspaceId: this.workspaceId, body: { contains: `@` } },
      select: { body: true, createdAt: true, createdById: true },
      take: 300,
    });

    for (const userId of Object.keys(byUser)) {
      const profile = await prisma.expertProfile.findUnique({
        where: { workspaceId_userId_topic: { workspaceId: this.workspaceId, userId, topic } },
      });
      if (!profile) {
        await prisma.expertProfile.create({
          data: { workspaceId: this.workspaceId, userId, topic, messageCount: byUser[userId]!.count },
        });
      } else {
        await prisma.expertProfile.update({
          where: { id: profile.id },
          data: { messageCount: byUser[userId]!.count, resolutionRate: profile.resolutionRate },
        });
      }
    }

    const profiles = await prisma.expertProfile.findMany({ where: { workspaceId: this.workspaceId, topic } });

    const candidates: ExpertCandidate[] = profiles.map(p => {
      const stats = byUser[p.userId];
      const domainVocabScore = stats ? Math.min(1, stats.vocab.filter(w => w.length > 5 && !["because", "really", "about", "their", "there"].includes(w)).length / 50) : p.domainVocabScore;
      const endorsementCount = endorsements.filter(e => e.body.includes(`@${p.userId}`)).length;
      const confidence = Math.min(0.98,
        0.4 * Math.min(1, (stats?.count ?? p.messageCount) / 10) +
        0.25 * (p.resolutionRate ?? 0) +
        0.15 * Math.min(1, endorsementCount / 5) +
        0.2 * domainVocabScore,
      );
      return {
        userId: p.userId, topic, confidence: +confidence.toFixed(3),
        availability: p.availability, resolutionRate: p.resolutionRate, messageCount: stats?.count ?? p.messageCount,
      };
    });

    return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  async recordExpertResolution(userId: string, topic: string, success: boolean): Promise<void> {
    await this.assert("UPDATE");
    const profile = await prisma.expertProfile.findUnique({
      where: { workspaceId_userId_topic: { workspaceId: this.workspaceId, userId, topic } },
    });
    if (!profile) return;
    const resolutionRate = success ? Math.min(1, profile.resolutionRate + 0.1) : Math.max(0, profile.resolutionRate - 0.05);
    await prisma.expertProfile.update({ where: { id: profile.id }, data: { resolutionRate } });
  }

  async suggestExpertsForQuestion(question: string): Promise<ExpertCandidate[]> {
    await this.assert("READ");
    const topic = this.detectTopic(question);
    if (!topic) return [];
    return this.identifyExperts(topic);
  }

  async getAuditLog(options?: { limit?: number }) {
    await this.assert("READ");
    return prisma.moderationAuditLog.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { createdAt: "desc" }, take: options?.limit ?? 50,
    });
  }
}