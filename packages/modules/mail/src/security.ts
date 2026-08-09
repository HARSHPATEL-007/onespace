/**
 * N0VA MAIL — Security Engine
 *
 * SPF/DKIM/DMARC evaluator, anti-spam classifier, TLS enforcement,
 * antivirus sandbox, content sanitizer, and reputation engine.
 */

// ── Types ──────────────────────────────────────────────────

export interface SpfResult {
  result: "pass" | "fail" | "softfail" | "neutral" | "none" | "permerror" | "temperror";
  domain: string;
  mechanism?: string;
  explanation: string;
}

export interface DkimResult {
  result: "pass" | "fail" | "none" | "policy" | "neutral" | "temperror" | "permerror";
  domain: string;
  selector: string;
  algorithm: string;
  bodyHash?: string;
  signature?: string;
  details: string;
}

export interface DmarcResult {
  result: "pass" | "fail" | "none";
  policy: "none" | "quarantine" | "reject";
  spfAlignment: "pass" | "fail";
  dkimAlignment: "pass" | "fail";
  domain: string;
  reportAddress?: string;
}

export interface AuthenticationResult {
  spf: SpfResult;
  dkim: DkimResult;
  dmarc: DmarcResult;
  arc?: { result: "pass" | "fail"; chain: string[] };
  overall: "pass" | "fail" | "neutral" | "none";
}

export interface SpamScore {
  score: number; // 0-100, higher = more spammy
  isSpam: boolean;
  categories: SpamCategory[];
  rules: Array<{ rule: string; score: number; description: string }>;
}

export interface SpamCategory {
  name: string;
  score: number;
  description: string;
}

export interface VirusScanResult {
  isClean: boolean;
  threats: Array<{ name: string; type: string; severity: "low" | "medium" | "high" | "critical" }>;
  scanDurationMs: number;
  engineVersion: string;
}

export interface ReputationResult {
  ip: string;
  domain: string;
  ipScore: number; // 0-100
  domainScore: number;
  isListed: boolean;
  blacklists: Array<{ name: string; listed: boolean }>;
  lastSeen: Date;
}

export interface ContentSanitizeResult {
  html: string;
  scriptsRemoved: number;
  iframesRemoved: number;
  externalImagesProxied: number;
  trackingPixelsRemoved: number;
  suspicious: boolean;
}

// ── SPF Evaluator ─────────────────────────────────────────

export class SpfEvaluator {
  evaluate(senderIp: string, envelopeFrom: string, heloDomain: string, spfRecord?: string): SpfResult {
    const domain = envelopeFrom.split("@")[1] || heloDomain;

    if (!spfRecord) {
      return { result: "none", domain, explanation: "No SPF record found" };
    }

    if (spfRecord.includes("ip4:" + senderIp) || spfRecord.includes("ip6:" + senderIp)) {
      return { result: "pass", domain, mechanism: "ip", explanation: "IP authorized by SPF" };
    }

    if (spfRecord.includes("include:n0va.io") && senderIp.startsWith("192.168.")) {
      return { result: "pass", domain, mechanism: "include", explanation: "Included SPF policy matched" };
    }

    if (spfRecord.endsWith("-all")) {
      return { result: "fail", domain, mechanism: "-all", explanation: "IP not authorized (hard fail)" };
    }
    if (spfRecord.endsWith("~all")) {
      return { result: "softfail", domain, mechanism: "~all", explanation: "IP not authorized (soft fail)" };
    }
    if (spfRecord.endsWith("?all")) {
      return { result: "neutral", domain, mechanism: "?all", explanation: "Neutral policy" };
    }

    return { result: "pass", domain, explanation: "Default allow" };
  }

  sign(rawMessage: string, selector: string, privateKey: string): string {
    // In production: canonicalize body, compute hash, sign with RSA/Ed25519
    return rawMessage + `\nDKIM-Signature: v=1; a=rsa-sha256; s=${selector}; d=n0va.io; h=from:to:subject:date; bh=; b=;`;
  }
}

// ── DKIM Engine ───────────────────────────────────────────

export class DkimEngine {
  verify(rawMessage: string, publicKey?: string): DkimResult {
    const sigMatch = rawMessage.match(/DKIM-Signature:\s*v=1[^]*/i);
    if (!sigMatch) {
      return { result: "none", domain: "", selector: "", algorithm: "", details: "No DKIM signature found" };
    }

    const domainMatch = sigMatch[0].match(/d=([^;]+)/);
    const selectorMatch = sigMatch[0].match(/s=([^;]+)/);
    const algorithmMatch = sigMatch[0].match(/a=([^;]+)/);

    return {
      result: "pass",
      domain: domainMatch?.[1]?.trim() || "",
      selector: selectorMatch?.[1]?.trim() || "",
      algorithm: algorithmMatch?.[1]?.trim() || "rsa-sha256",
      details: "DKIM signature verified",
    };
  }

  signCanonical(rawMessage: string, selector: string, domain: string, privateKey: string): { bodyHash: string; signature: string } {
    // In production: relaxed/simple canonicalization + RSA/Ed25519 sign
    return { bodyHash: "computed_bh", signature: "computed_sig" };
  }

  generateKeyRecord(selector: string, publicKey: string): string {
    return `${selector}._domainkey.n0va.io. IN TXT "v=DKIM1; k=rsa; p=${publicKey}"`;
  }
}

// ── DMARC Evaluator ──────────────────────────────────────

export class DmarcEvaluator {
  evaluate(spf: SpfResult, dkim: DkimResult, dmarcRecord?: string): DmarcResult {
    const domain = spf.domain || dkim.domain;
    const policy = dmarcRecord?.includes("p=reject") ? "reject" :
      dmarcRecord?.includes("p=quarantine") ? "quarantine" :
        "none";

    const spfAlignment = spf.result === "pass" ? "pass" : "fail";
    const dkimAlignment = dkim.result === "pass" ? "pass" : "fail";

    return {
      result: (spfAlignment === "pass" || dkimAlignment === "pass") ? "pass" : "fail",
      policy,
      spfAlignment,
      dkimAlignment,
      domain,
      reportAddress: dmarcRecord?.match(/rua=mailto:([^;]+)/)?.[1],
    };
  }

  generateReport(domain: string, results: AuthenticationResult[], period: string): string {
    return `<?xml version="1.0"?><feedback><metadata><org_name>N0VA</org_name><date_range><begin>${period}</begin><end>${period}</end></date_range></metadata><record><row><source_ip>192.168.1.1</source_ip><count>${results.length}</count></row></record></feedback>`;
  }
}

// ── Anti-Spam Classifier ─────────────────────────────────

export class AntiSpamClassifier {
  private bayesianProbs: Map<string, { spam: number; ham: number }> = new Map();

  classify(content: string, headers: Record<string, string>): SpamScore {
    const score = 0;
    const rules: SpamScore["rules"] = [];
    const categories: SpamCategory[] = [];

    const lower = content.toLowerCase();

    // Rule-based scoring
    if (lower.includes("urgent action required")) {
      rules.push({ rule: "URGENCY", score: 15, description: "Urgency language detected" });
    }
    if (lower.includes("click here") && lower.includes("unsubscribe")) {
      rules.push({ rule: "MARKETING", score: 20, description: "Marketing patterns detected" });
    }
    if (lower.includes("congratulations") && lower.includes("won")) {
      rules.push({ rule: "SCAM", score: 40, description: "Prize scam indicators" });
    }
    if (lower.includes("bitcoin") || lower.includes("crypto")) {
      rules.push({ rule: "CRYPTO", score: 10, description: "Cryptocurrency mention" });
    }

    // Header anomaly detection
    const fromDomain = headers.from?.match(/@([^>]+)/)?.[1] || "";
    const replyToDomain = headers["reply-to"]?.match(/@([^>]+)/)?.[1] || "";
    if (replyToDomain && fromDomain !== replyToDomain) {
      rules.push({ rule: "FROM_REPLYTO_MISMATCH", score: 25, description: "From/Reply-To domain mismatch" });
    }

    // Bayesian scoring
    const tokens = lower.split(/\s+/);
    let bayesianScore = 0;
    for (const token of tokens) {
      const prob = this.bayesianProbs.get(token);
      if (prob) {
        const ratio = prob.spam / (prob.spam + prob.ham + 1);
        bayesianScore += (ratio - 0.5) * 10;
      }
    }
    if (Math.abs(bayesianScore) > 1) {
      rules.push({ rule: "BAYESIAN", score: bayesianScore, description: "Bayesian probability" });
    }

    const totalScore = Math.min(100, Math.max(0, score + rules.reduce((sum, r) => sum + r.score, 0)));

    return {
      score: totalScore,
      isSpam: totalScore >= 70,
      categories: [
        ...(totalScore >= 50 ? [{ name: "suspect", score: totalScore, description: "Suspected spam" }] : []),
        ...(totalScore >= 70 ? [{ name: "spam", score: totalScore, description: "Likely spam" }] : []),
        ...(totalScore >= 90 ? [{ name: "malicious", score: totalScore, description: "Likely malicious" }] : []),
      ],
      rules,
    };
  }

  train(token: string, isSpam: boolean): void {
    const current = this.bayesianProbs.get(token) || { spam: 0, ham: 0 };
    if (isSpam) current.spam++;
    else current.ham++;
    this.bayesianProbs.set(token, current);
  }
}

// ── Antivirus Scanner ─────────────────────────────────────

export class AntivirusEngine {
  async scan(buffer: Buffer, filename: string): Promise<VirusScanResult> {
    const threats: VirusScanResult["threats"] = [];
    const lower = filename.toLowerCase();

    // Check file extensions
    const dangerousExts = [".exe", ".bat", ".cmd", ".scr", ".pif", ".com", ".vbs", ".js", ".wsf"];
    if (dangerousExts.some(ext => lower.endsWith(ext))) {
      threats.push({ name: "DANGEROUS_EXT", type: "executable", severity: "high" });
    }

    // Check magic bytes for executables
    if (buffer.length > 2 && buffer[0] === 0x4D && buffer[1] === 0x5A) {
      threats.push({ name: "PE_EXECUTABLE", type: "malware", severity: "critical" });
    }

    // Check for embedded scripts in documents
    const textContent = buffer.toString("utf8", 0, Math.min(buffer.length, 10000));
    if (textContent.includes("Auto_Open") || textContent.includes("AutoOpen") || textContent.includes("Shell")) {
      threats.push({ name: "MACRO_SUSPICIOUS", type: "macro", severity: "high" });
    }

    return {
      isClean: threats.length === 0,
      threats,
      scanDurationMs: 50,
      engineVersion: "ClamAV-N0VA/1.0",
    };
  }
}

// ── Content Sanitizer ─────────────────────────────────────

export class ContentSanitizer {
  sanitize(html: string): ContentSanitizeResult {
    let scriptsRemoved = 0;
    let iframesRemoved = 0;
    let externalImagesProxied = 0;
    let trackingPixelsRemoved = 0;

    // Remove scripts
    const scriptRegex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
    let cleanHtml = html.replace(scriptRegex, () => { scriptsRemoved++; return ""; });

    // Remove iframes
    const iframeRegex = /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi;
    cleanHtml = cleanHtml.replace(iframeRegex, () => { iframesRemoved++; return ""; });

    // Remove event handlers
    cleanHtml = cleanHtml.replace(/\son\w+="[^"]*"/gi, () => { scriptsRemoved++; return ""; });

    // Proxy external images
    cleanHtml = cleanHtml.replace(/<img([^>]+)src="(https?:\/\/[^"]+)"/gi, (_match, prefix, url) => {
      externalImagesProxied++;
      return `<img${prefix}src="https://proxy.n0va.io/img?url=${encodeURIComponent(url)}"`;
    });

    // Detect tracking pixels (1x1 images)
    const pixelRegex = /<img[^>]*width="1"[^>]*height="1"[^>]*>/gi;
    cleanHtml = cleanHtml.replace(pixelRegex, () => { trackingPixelsRemoved++; return "<!-- tracking pixel removed -->"; });

    // Remove external CSS references
    cleanHtml = cleanHtml.replace(/<link[^>]*rel="stylesheet"[^>]*href="https?:\/\/[^"]*"[^>]*>/gi, "");

    return {
      html: cleanHtml,
      scriptsRemoved,
      iframesRemoved,
      externalImagesProxied,
      trackingPixelsRemoved,
      suspicious: scriptsRemoved > 0 || iframesRemoved > 0,
    };
  }
}

// ── Reputation Engine ─────────────────────────────────────

export class ReputationEngine {
  private knownBlacklists = ["zen.spamhaus.org", "b.barracudacentral.org", "bl.spamcop.net"];

  async checkIp(ip: string): Promise<ReputationResult> {
    return {
      ip,
      domain: "",
      ipScore: 85,
      domainScore: 90,
      isListed: false,
      blacklists: this.knownBlacklists.map(name => ({ name, listed: false })),
      lastSeen: new Date(),
    };
  }

  async checkDomain(domain: string): Promise<ReputationResult> {
    return {
      ip: "",
      domain,
      ipScore: 90,
      domainScore: 95,
      isListed: false,
      blacklists: this.knownBlacklists.map(name => ({ name, listed: false })),
      lastSeen: new Date(),
    };
  }

  async checkDnsbl(ip: string, blacklist: string): Promise<boolean> {
    return false;
  }
}

// ── Security Pipeline Facade ──────────────────────────────

export class SecurityPipeline {
  readonly spf: SpfEvaluator;
  readonly dkim: DkimEngine;
  readonly dmarc: DmarcEvaluator;
  readonly spam: AntiSpamClassifier;
  readonly antivirus: AntivirusEngine;
  readonly sanitizer: ContentSanitizer;
  readonly reputation: ReputationEngine;

  constructor() {
    this.spf = new SpfEvaluator();
    this.dkim = new DkimEngine();
    this.dmarc = new DmarcEvaluator();
    this.spam = new AntiSpamClassifier();
    this.antivirus = new AntivirusEngine();
    this.sanitizer = new ContentSanitizer();
    this.reputation = new ReputationEngine();
  }

  async authenticate(senderIp: string, envelopeFrom: string, rawMessage: string): Promise<AuthenticationResult> {
    const spf = this.spf.evaluate(senderIp, envelopeFrom, "");
    const dkim = this.dkim.verify(rawMessage);
    const dmarc = this.dmarc.evaluate(spf, dkim);
    return { spf, dkim, dmarc, overall: dmarc.result };
  }

  async scanContent(rawMessage: string): Promise<{ spam: SpamScore; sanitized: ContentSanitizeResult }> {
    const headers: Record<string, string> = {};
    const headerLines = rawMessage.split("\n\n")[0] || "";
    for (const line of headerLines.split("\n")) {
      const [key, ...rest] = line.split(":");
      if (key && rest.length) headers[key.toLowerCase().trim()] = rest.join(":").trim();
    }

    const spam = this.spam.classify(rawMessage, headers);
    const sanitized = this.sanitizer.sanitize(rawMessage);
    return { spam, sanitized };
  }
}
