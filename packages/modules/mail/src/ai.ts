/**
 * N0VA MAIL — Intelligent & AI Services Engine
 *
 * Thread summarization, smart reply, semantic search,
 * phishing detection, and content analysis.
 */

import { callLlm, composeFallbackReply } from "@n0va/modules-ani/providers";

// ── Types ──────────────────────────────────────────────────

export interface ThreadSummary {
  summary: string;
  decisions: string[];
  actionItems: string[];
  participants: string[];
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  wordCount: number;
  duration: string;
  keyTopics: string[];
}

export interface SmartReply {
  id: string;
  label: string;
  text: string;
  tone: string;
  confidence: number;
}

export interface SemanticSearchResult {
  messageId: string;
  threadId: string;
  subject: string;
  snippet: string;
  score: number;
  folder: string;
  date: Date;
}

export interface PhishingAnalysis {
  isPhishing: boolean;
  confidence: number;
  indicators: Array<{ type: string; description: string; severity: "low" | "medium" | "high" }>;
  recommendedAction: "allow" | "warn" | "block";
}

export interface ContentAnalysis {
  language: string;
  languageConfidence: number;
  topics: string[];
  entities: Array<{ type: string; value: string }>;
  sentiment: { score: number; label: string };
  urgency: { score: number; label: string };
  category: string;
}

export interface AutocompleteSuggestion {
  text: string;
  type: "phrase" | "contact" | "template";
  confidence: number;
}

// ── Thread Summarizer ─────────────────────────────────────

export class ThreadSummarizer {
  async summarize(messages: Array<{ from: string; body: string; subject: string; direction: string }>, workspaceId: string): Promise<ThreadSummary> {
    const threadText = messages.map(m => `[${m.direction === "IN" ? "FROM" : "TO"}] ${m.from}: ${m.subject}\n${m.body.slice(0, 300)}`).join("\n\n");
    const participants = [...new Set(messages.map(m => m.from))];
    const wordCount = threadText.split(/\s+/).length;

    const prompt = `Analyze this email thread. Return JSON with: summary (3-5 bullet points), decisions (array), actionItems (array), sentiment (positive/negative/neutral/mixed), keyTopics (array of 3-5 topics).\n\nThread:\n${threadText.slice(0, 4000)}\n\nJSON:`;

    try {
      const integration = await this._resolveIntegration();
      if (integration) {
        const cfg = integration.config as Record<string, unknown>;
        const result = await callLlm(cfg.provider as string, cfg.model as string, cfg, [{ role: "user", content: prompt }], []);
        const parsed = JSON.parse(result.content);
        return {
          summary: Array.isArray(parsed.summary) ? parsed.summary.join("\n") : String(parsed.summary || ""),
          decisions: Array.isArray(parsed.decisions) ? parsed.decisions.map(String) : [],
          actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.map(String) : [],
          participants,
          sentiment: parsed.sentiment || "neutral",
          wordCount,
          duration: this._calculateDuration(messages),
          keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics.map(String) : [],
        };
      }
    } catch { /* fall through */ }

    return {
      summary: composeFallbackReply("summarize thread", "summary"),
      decisions: [],
      actionItems: [],
      participants,
      sentiment: "neutral",
      wordCount,
      duration: this._calculateDuration(messages),
      keyTopics: [],
    };
  }

  private _calculateDuration(messages: Array<{ from: string }>): string {
    return `${messages.length} messages`;
  }

  private async _resolveIntegration() {
    try {
      const { prisma } = await import("@n0va/db");
      const candidate = await prisma.integration.findFirst({
        where: { provider: { in: ["openai", "anthropic", "gemini"] }, enabled: true },
        orderBy: { createdAt: "desc" },
      });
      if (candidate?.config) return candidate;
      if (process.env["OPENAI_API_KEY"] || process.env["ANTHROPIC_API_KEY"] || process.env["GOOGLE_API_KEY"]) {
        const provider = process.env["OPENAI_API_KEY"] ? "openai" : process.env["ANTHROPIC_API_KEY"] ? "anthropic" : "gemini";
        const token = process.env["OPENAI_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? process.env["GOOGLE_API_KEY"];
        return { id: "env-llm", provider, name: "LLM (env)", enabled: true, config: { provider, token, model: provider === "openai" ? "gpt-4o-mini" : provider === "anthropic" ? "claude-3-5-sonnet-20241022" : "gemini-1.5-flash" } };
      }
    } catch { /* no integration */ }
    return null;
  }
}

// ── Smart Reply Engine ────────────────────────────────────

export class SmartReplyEngine {
  async generateReplies(message: { from: string; subject: string; body: string; direction: string }, context?: string): Promise<SmartReply[]> {
    const prompt = `Generate 3 contextual reply options for this email from ${message.from}. Return JSON array of {id, label, text, tone}. Labels: 2-3 words. Text: 1-2 sentences.\n\nSubject: ${message.subject}\nBody: ${message.body.slice(0, 500)}\n${context ? `Context: ${context}` : ""}\n\nJSON:`;

    try {
      const integration = await this._resolveIntegration();
      if (integration) {
        const cfg = integration.config as Record<string, unknown>;
        const result = await callLlm(cfg.provider as string, cfg.model as string, cfg, [{ role: "user", content: prompt }], []);
        const parsed = JSON.parse(result.content);
        if (Array.isArray(parsed)) {
          return parsed.map((r: { id?: string; label: string; text: string; tone?: string }, i: number) => ({
            id: r.id || `reply_${i}`,
            label: r.label,
            text: r.text,
            tone: r.tone || "neutral",
            confidence: 0.85,
          }));
        }
      }
    } catch { /* fall through */ }

    // Context-aware fallbacks
    const lower = message.body.toLowerCase();
    if (lower.includes("meeting") || lower.includes("schedule") || lower.includes("call")) {
      return [
        { id: "accept", label: "✓ I'll join", text: "Thanks — I'll be there.", tone: "positive", confidence: 0.9 },
        { id: "reschedule", label: "↻ Reschedule", text: "That time doesn't work — can we find another slot?", tone: "neutral", confidence: 0.8 },
        { id: "decline", label: "✕ Can't make it", text: "Thanks, but I won't be able to attend.", tone: "neutral", confidence: 0.85 },
      ];
    }
    return [
      { id: "thanks", label: "👍 Thanks!", text: "Thanks for the update!", tone: "positive", confidence: 0.9 },
      { id: "got_it", label: "✓ Got it", text: "Got it, thanks for letting me know.", tone: "neutral", confidence: 0.85 },
      { id: "will_do", label: "✅ Will do", text: "Understood — I'll take care of it.", tone: "positive", confidence: 0.8 },
    ];
  }

  private async _resolveIntegration() {
    try {
      const { prisma } = await import("@n0va/db");
      const candidate = await prisma.integration.findFirst({
        where: { provider: { in: ["openai", "anthropic", "gemini"] }, enabled: true },
        orderBy: { createdAt: "desc" },
      });
      if (candidate?.config) return candidate;
    } catch { /* no integration */ }
    return null;
  }
}

// ── Phishing Detector ─────────────────────────────────────

export class PhishingDetector {
  analyze(subject: string, body: string, headers: Record<string, string>): PhishingAnalysis {
    const indicators: PhishingAnalysis["indicators"] = [];

    // Check for urgency language
    const urgencyWords = ["urgent", "immediate", "action required", "verify now", "suspended", "locked", "expire"];
    const bodyLower = body.toLowerCase();
    for (const word of urgencyWords) {
      if (bodyLower.includes(word)) {
        indicators.push({ type: "urgency", description: `Urgency language: "${word}"`, severity: "medium" });
      }
    }

    // Check for suspicious links
    const linkMatches = body.match(/href="(https?:\/\/[^"]+)"/gi) || [];
    for (const link of linkMatches) {
      const url = link.replace(/href="/i, "").replace(/"/, "");
      if (url.includes("bit.ly") || url.includes("tinyurl") || url.includes("t.co")) {
        indicators.push({ type: "shortened_url", description: `Shortened URL: ${url}`, severity: "medium" });
      }
      if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(url)) {
        indicators.push({ type: "ip_url", description: `IP-based URL: ${url}`, severity: "high" });
      }
    }

    // Check From/Reply-To mismatch
    const fromDomain = headers.from?.match(/@([^>]+)/)?.[1] || "";
    const replyToDomain = headers["reply-to"]?.match(/@([^>]+)/)?.[1] || "";
    if (replyToDomain && fromDomain !== replyToDomain) {
      indicators.push({ type: "from_replyto_mismatch", description: `From domain (${fromDomain}) ≠ Reply-To (${replyToDomain})`, severity: "high" });
    }

    // Check for credential requests
    if (bodyLower.includes("password") || bodyLower.includes("credit card") || bodyLower.includes("ssn") || bodyLower.includes("social security")) {
      indicators.push({ type: "credential_request", description: "Message requests sensitive credentials", severity: "high" });
    }

    // Check for brand impersonation
    const brands = ["paypal", "apple", "google", "microsoft", "amazon", "netflix"];
    for (const brand of brands) {
      if (bodyLower.includes(brand) && !fromDomain.includes(brand)) {
        indicators.push({ type: "brand_impersonation", description: `Possible ${brand} impersonation from ${fromDomain}`, severity: "high" });
      }
    }

    const score = indicators.reduce((sum, i) => sum + (i.severity === "high" ? 30 : i.severity === "medium" ? 15 : 5), 0);
    const confidence = Math.min(1, score / 100);

    return {
      isPhishing: score >= 50,
      confidence,
      indicators,
      recommendedAction: score >= 70 ? "block" : score >= 40 ? "warn" : "allow",
    };
  }
}

// ── Semantic Search Engine ────────────────────────────────

export class SemanticSearchEngine {
  private embeddings: Map<string, number[]> = new Map();

  async search(query: string, documents: Array<{ id: string; subject: string; body: string; threadId: string; folder: string; date: Date }>, limit: number = 10): Promise<SemanticSearchResult[]> {
    // In production: generate embeddings via API, compute cosine similarity
    // For now: use keyword matching with relevance scoring
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/);

    const scored = documents.map(doc => {
      const text = `${doc.subject} ${doc.body}`.toLowerCase();
      let score = 0;
      for (const term of queryTerms) {
        if (text.includes(term)) score += 1;
        if (doc.subject.toLowerCase().includes(term)) score += 2;
      }
      return { doc, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => ({
        messageId: s.doc.id,
        threadId: s.doc.threadId,
        subject: s.doc.subject,
        snippet: s.doc.body.slice(0, 150) + "...",
        score: Math.min(1, s.score / (queryTerms.length * 2)),
        folder: s.doc.folder,
        date: s.doc.date,
      }));
  }

  async embed(text: string): Promise<number[]> {
    // In production: call embedding API
    return [];
  }
}

// ── Content Analyzer ──────────────────────────────────────

export class ContentAnalyzer {
  analyze(text: string): ContentAnalysis {
    const lower = text.toLowerCase();

    // Topic detection
    const topics: string[] = [];
    if (lower.includes("meeting") || lower.includes("calendar")) topics.push("scheduling");
    if (lower.includes("invoice") || lower.includes("payment") || lower.includes("billing")) topics.push("finance");
    if (lower.includes("project") || lower.includes("deadline") || lower.includes("deliverable")) topics.push("project");
    if (lower.includes("review") || lower.includes("feedback")) topics.push("review");

    // Sentiment
    const positive = ["thank", "great", "excellent", "good", "happy", "pleased"].filter(w => lower.includes(w)).length;
    const negative = ["sorry", "issue", "problem", "error", "fail", "wrong"].filter(w => lower.includes(w)).length;
    const sentimentScore = positive - negative;

    // Urgency
    const urgencyWords = ["urgent", "asap", "immediately", "deadline", "today", "now"];
    const urgencyCount = urgencyWords.filter(w => lower.includes(w)).length;

    return {
      language: "en",
      languageConfidence: 0.95,
      topics,
      entities: this._extractEntities(text),
      sentiment: { score: sentimentScore, label: sentimentScore > 0 ? "positive" : sentimentScore < 0 ? "negative" : "neutral" },
      urgency: { score: urgencyCount, label: urgencyCount >= 2 ? "high" : urgencyCount >= 1 ? "medium" : "low" },
      category: topics[0] || "general",
    };
  }

  private _extractEntities(text: string): Array<{ type: string; value: string }> {
    const entities: Array<{ type: string; value: string }> = [];
    const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
    const emails = text.match(emailRegex) || [];
    emails.forEach(e => entities.push({ type: "email", value: e }));

    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlRegex) || [];
    urls.forEach(u => entities.push({ type: "url", value: u }));

    return entities;
  }
}

// ── AI Engine Facade ──────────────────────────────────────

export class AiEngine {
  readonly summarizer: ThreadSummarizer;
  readonly smartReply: SmartReplyEngine;
  readonly phishingDetector: PhishingDetector;
  readonly semanticSearch: SemanticSearchEngine;
  readonly contentAnalyzer: ContentAnalyzer;

  constructor() {
    this.summarizer = new ThreadSummarizer();
    this.smartReply = new SmartReplyEngine();
    this.phishingDetector = new PhishingDetector();
    this.semanticSearch = new SemanticSearchEngine();
    this.contentAnalyzer = new ContentAnalyzer();
  }

  async processInbound(message: { from: string; subject: string; body: string; headers: Record<string, string> }): Promise<{
    phishing: PhishingAnalysis;
    content: ContentAnalysis;
  }> {
    return {
      phishing: this.phishingDetector.analyze(message.subject, message.body, message.headers),
      content: this.contentAnalyzer.analyze(message.body),
    };
  }
}
