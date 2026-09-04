/**
 * Quality-control checks — pure, dependency-free, deterministic.
 * Duplicates, contradictions, citations, reading level, bias, cultural,
 * accessibility, rights, safety, freshness, publication decisions.
 * Dimensions are never collapsed into one opaque score.
 */

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u0900-\u097F\u4E00-\u9FFF ]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(s: string): string[] {
  return norm(s).split(" ").filter((t) => t.length > 2);
}

/** Token Jaccard similarity (capped inputs for performance). */
export function jaccard(a: string, b: string): number {
  const ta = new Set(tokens(a).slice(0, 400));
  const tb = new Set(tokens(b).slice(0, 400));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return Math.round((inter / (ta.size + tb.size - inter)) * 100) / 100;
}

/** Normalized similarity 0..1 (length-capped Levenshtein on normalized text). */
export function textSimilarity(a: string, b: string): number {
  const x = norm(a).slice(0, 500);
  const y = norm(b).slice(0, 500);
  if (x === y) return 1;
  if (!x || !y) return 0;
  const jac = jaccard(x, y);
  const lev = 1 - levenshtein(x, y) / Math.max(x.length, y.length);
  return Math.round(((jac * 0.6 + lev * 0.4)) * 100) / 100;
}

function levenshtein(x: string, y: string): number {
  const m = x.length, n = y.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur as number[];
  }
  return prev[n]!;
}

export type DuplicateKind = "exact" | "near" | "semantic" | "structural" | "leakage" | "source_duplication";

/** Classify a content pair (hashes + types + concepts supplied by caller). */
export function classifyDuplicate(args: {
  hashEqual?: boolean; similarity: number; sameType?: boolean;
  sharedConcepts: number; gradedVsPractice?: boolean; sameClaimDiffVersion?: boolean;
}): { kind: DuplicateKind | null; action: string } {
  if (args.hashEqual) return { kind: "exact", action: "merge_or_retain_authoritative" };
  if (args.gradedVsPractice && args.similarity >= 0.5) {
    return { kind: "leakage", action: "block_practice_release_pending_review" };
  }
  if (args.sameClaimDiffVersion) return { kind: "source_duplication", action: "dedupe_to_canonical_edition" };
  if (args.similarity >= 0.85) return { kind: "near", action: "merge_or_differentiate_purpose" };
  if (args.similarity >= 0.6) return { kind: "semantic", action: "differentiate_recall_vs_application_or_merge" };
  if ((args.sameType ?? false) && args.sharedConcepts >= 2 && args.similarity >= 0.4) {
    return { kind: "structural", action: "vary_sequence_or_flag_repetitive_set" };
  }
  return { kind: null, action: "no_action" };
}

// ---------------------------------------------------------------------------
// Proposition-level contradiction detection.
// ---------------------------------------------------------------------------

export type ContradictionKind =
  | "factual" | "numerical" | "definitional" | "causal" | "temporal"
  | "scope" | "methodological" | "normative" | "translation" | "outdated";

/** Extract countable propositions ("three stages", "four steps", years). */
export function extractPropositions(text: string): { subject: string; value: string; span: string }[] {
  const out: { subject: string; value: string; span: string }[] = [];
  const numWords: Record<string, string> = {
    one: "1", two: "2", three: "3", four: "4", five: "5",
    six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  };
  for (const m of text.matchAll(/(\b\w+(?:\s+\w+){0,3})\s+has\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(\w+)/gi)) {
    out.push({ subject: m[1]!.toLowerCase(), value: numWords[m[2]!.toLowerCase()] ?? m[2]!, span: m[0].slice(0, 120) });
  }
  for (const m of text.matchAll(/\b(causes?|caused by|due to)\b[^.!?]{0,80}/gi)) {
    out.push({ subject: "causal", value: m[0].slice(0, 80).toLowerCase(), span: m[0].slice(0, 120) });
  }
  return out;
}

export function detectContradiction(a: string, b: string): { kind: ContradictionKind; detail: string } | null {
  const pa = extractPropositions(a);
  const pb = extractPropositions(b);
  for (const x of pa) {
    for (const y of pb) {
      if (x.subject === y.subject && x.value !== y.value) {
        return { kind: /^\d+$/.test(x.value) ? "numerical" : "factual", detail: `“${x.span}” vs “${y.span}”` };
      }
    }
  }
  if (/\b(should|must|ought to|is right|is wrong)\b/i.test(a) && /\b(should|must|ought to|is right|is wrong)\b/i.test(b)
    && jaccard(a, b) > 0.3 && jaccard(a, b) < 0.8) {
    return { kind: "normative", detail: "competing ought-claims over shared topic" };
  }
  if (/\b(defined as|is defined|means that|refers to)\b/i.test(a + " " + b) && jaccard(a, b) < 0.5) {
    return { kind: "definitional", detail: "different definitional framings" };
  }
  const years = (t: string) => new Set(t.match(/\b(19|20)\d{2}\b/g) ?? []);
  const ya = years(a), yb = years(b);
  if (ya.size > 0 && yb.size > 0 && ![...ya].some((y) => yb.has(y))) {
    return { kind: "temporal", detail: "different time anchoring" };
  }
  if ((/\ball\b|\balways\b|\bnever\b/.test(a) && /\b(some|often|sometimes)\b/.test(b))
    || (/\ball\b|\balways\b|\bnever\b/.test(b) && /\b(some|often|sometimes)\b/.test(a))) {
    return { kind: "scope", detail: "absolute vs qualified scope" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Citation completeness audit with severity.
// ---------------------------------------------------------------------------

export interface CitationFinding {
  claim: string; cited: boolean; severity: "critical" | "major" | "moderate" | "minor" | null;
}

export function auditCitations(
  claims: { text: string; cited: boolean; supported: boolean; highStakes?: boolean; central?: boolean }[],
): { total: number; cited: number; supported: number; missing: number; findings: CitationFinding[]; status: string } {
  const findings: CitationFinding[] = claims.map((c) => {
    if (c.cited && c.supported) return { claim: c.text.slice(0, 120), cited: true, severity: null };
    if (!c.cited) {
      const severity = c.highStakes ? "critical" : c.central ? "major" : /example|statistic|compar/i.test(c.text) ? "moderate" : "minor";
      return { claim: c.text.slice(0, 120), cited: false, severity };
    }
    return { claim: c.text.slice(0, 120), cited: true, severity: "moderate" };
  });
  const missing = findings.filter((f) => !f.cited).length;
  const supported = findings.filter((f) => f.cited && !f.severity).length;
  const critical = findings.filter((f) => f.severity === "critical").length;
  return {
    total: claims.length, cited: claims.length - missing, supported, missing, findings,
    status: critical > 0 ? "blocked" : missing > 0 ? "review_required" : "passed",
  };
}

// ---------------------------------------------------------------------------
// Reading-level analysis (measure / suggest / adapt inputs — never ability).
// ---------------------------------------------------------------------------

export interface ReadingProfile {
  avgSentenceLen: number; longWordRate: number; technicalDensity: number;
  passiveRate: number; paragraphLen: number; symbolBurden: number;
  band: "age_11_13" | "age_13_15" | "age_16_17" | "adult";
  actions: string[];
}

export function readingProfile(text: string, target: string): ReadingProfile {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter(Boolean);
  const avgSentenceLen = sentences.length ? words.length / sentences.length : 0;
  const longWords = words.filter((w) => w.length > 10).length;
  const longWordRate = words.length ? longWords / words.length : 0;
  const technical = words.filter((w) => /[A-Z]{2,}|[0-9]|[$€₹£%^_=<>]/.test(w) || w.length > 12).length;
  const technicalDensity = words.length ? technical / words.length : 0;
  const passive = (text.match(/\b(was|were|is|are|been|being)\s+\w+ed\b/gi) ?? []).length;
  const passiveRate = sentences.length ? passive / sentences.length : 0;
  const paras = text.split(/\n\s*\n/).filter((p) => p.trim());
  const paragraphLen = paras.length ? words.length / paras.length : words.length;
  const symbols = (text.match(/[$€₹£%^_=<>{}[\]\\|]/g) ?? []).length;
  const symbolBurden = words.length ? symbols / words.length : 0;
  const score = avgSentenceLen * 0.4 + longWordRate * 60 + technicalDensity * 80 + passiveRate * 10 + paragraphLen * 0.05 + symbolBurden * 60;
  const band = score < 14 ? "age_11_13" : score < 20 ? "age_13_15" : score < 28 ? "age_16_17" : "adult";
  const actions: string[] = [];
  if (avgSentenceLen > 24) actions.push("split long sentences");
  if (technicalDensity > 0.12) actions.push("define technical terms earlier");
  if (passiveRate > 0.3) actions.push("convert passive constructions");
  if (paragraphLen > 150) actions.push("break long paragraphs");
  void target;
  return {
    avgSentenceLen: Math.round(avgSentenceLen * 10) / 10,
    longWordRate: Math.round(longWordRate * 100) / 100,
    technicalDensity: Math.round(technicalDensity * 100) / 100,
    passiveRate: Math.round(passiveRate * 100) / 100,
    paragraphLen: Math.round(paragraphLen),
    symbolBurden: Math.round(symbolBurden * 100) / 100,
    band, actions,
  };
}

// ---------------------------------------------------------------------------
// Bias + cultural scans (evidence-first; human review required).
// ---------------------------------------------------------------------------

export interface BiasFinding {
  location: string; category: string; severity: "low" | "moderate" | "high";
  evidence: string; recommendation: string;
}

const BIAS_PATTERNS: { category: string; severity: "low" | "moderate" | "high"; re: RegExp; recommendation: string }[] = [
  { category: "occupational_stereotype", severity: "moderate", re: /\ball (engineers|doctors|nurses|teachers|scientists|CEOs|programmers) are (men|women|male|female)\b/i, recommendation: "diversify representation without altering the learning objective" },
  { category: "occupational_stereotype", severity: "moderate", re: /\b(mankind|manpower|chairman|policeman|fireman)\b/i, recommendation: "use gender-neutral occupational terms" },
  { category: "deficit_framing", severity: "moderate", re: /\b(suffers? from|victim of|confined to a wheelchair|handicapped)\b/i, recommendation: "person-first, non-deficit framing" },
  { category: "agency_bias", severity: "low", re: /\b(allows? (women|girls|them) to|helps? the poor to|gives? (them|these people) a voice)\b/i, recommendation: "attribute agency to the people described" },
  { category: "ability_association", severity: "high", re: /\b(naturally (better|worse)|innately|biologically (unsuited|suited)).{0,40}(women|men|girls|boys|poor|rich)\b/i, recommendation: "remove identity-ability association; specialist review required" },
];

export function scanBias(text: string, location = "artifact"): BiasFinding[] {
  const out: BiasFinding[] = [];
  for (const p of BIAS_PATTERNS) {
    if (!p.re) continue;
    const m = text.match(p.re);
    if (m && m.index !== undefined) {
      out.push({
        location, category: p.category, severity: p.severity,
        evidence: text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).slice(0, 200),
        recommendation: p.recommendation,
      });
    }
  }
  return out;
}

export interface CulturalFinding { type: string; location: string; recommendation: string }

export function scanCultural(text: string, targetContext: string, location = "artifact"): { findings: CulturalFinding[]; preserveOriginal: boolean } {
  const findings: CulturalFinding[] = [];
  if (/\$[\d,]+/.test(text) && !/₹|€|£/.test(text)) {
    findings.push({ type: "currency_assumption", location, recommendation: "offer local-currency alternative alongside the original" });
  }
  const idioms = ["ballpark", "piece of cake", "break a leg", "hit it out of the park", "touchdown", "slam dunk"];
  const hit = idioms.find((i) => new RegExp(`\\b${i}\\b`, "i").test(text));
  if (hit) findings.push({ type: "idiom", location, recommendation: `explain or localize “${hit}”` });
  if (/\b(Thanksgiving|SATs?|GCSEs?|prom|homecoming)\b/i.test(text)) {
    findings.push({ type: "region_specific", location, recommendation: "offer a local-context alternative" });
  }
  if (/\b(discovered|discovery of)\s+(America|India|the New World)\b/i.test(text)) {
    findings.push({ type: "colonial_framing", location, recommendation: "attribute perspective; add indigenous context" });
  }
  if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(text)) {
    findings.push({ type: "date_format", location, recommendation: "use unambiguous dates for the target context" });
  }
  void targetContext;
  return { findings, preserveOriginal: true };
}

// ---------------------------------------------------------------------------
// Accessibility audit (WCAG-oriented subset over exported content).
// ---------------------------------------------------------------------------

export interface A11yFinding { criterion: string; location: string; issue: string; blocking: boolean }

export function auditAccessibility(markdown: string): { passed: number; warnings: number; failed: number; failures: A11yFinding[] } {
  const failures: A11yFinding[] = [];
  let warnings = 0, passed = 0;
  const headings = [...markdown.matchAll(/^(#{1,6})\s+(.+)/gm)];
  const h1s = headings.filter((h) => h[1]!.length === 1);
  if (h1s.length === 0) { warnings++; } else passed++;
  if (h1s.length > 1) failures.push({ criterion: "heading_hierarchy", location: "document", issue: "multiple H1 headings", blocking: false });
  else passed++;
  let lastLevel = 0;
  for (const h of headings) {
    if (lastLevel > 0 && h[1]!.length > lastLevel + 1) {
      failures.push({ criterion: "heading_hierarchy", location: h[2]!.slice(0, 40), issue: "skipped heading level", blocking: false });
      break;
    }
    lastLevel = h[1]!.length;
  }
  if (!/```|code/i.test(markdown)) passed++;
  const emptyAlt = (markdown.match(/!\[\s*\]\(/g) ?? []).length;
  if (emptyAlt > 0) failures.push({ criterion: "non_text_content", location: "images", issue: `${emptyAlt} image(s) missing meaningful alt text`, blocking: true });
  else passed++;
  if (/\[click here\]|click here/i.test(markdown)) failures.push({ criterion: "link_names", location: "links", issue: "non-descriptive link text", blocking: false });
  else passed++;
  if (/\$\$|\\\[|\\begin\{equation/.test(markdown)) {
    failures.push({ criterion: "math_accessibility", location: "formulas", issue: "math needs accessible markup/description", blocking: false });
  } else passed++;
  const tables = (markdown.match(/\|.*\|/g) ?? []).length;
  if (tables > 0 && !/\|[\s:-]+\|/.test(markdown)) {
    failures.push({ criterion: "table_headers", location: "tables", issue: "tables without header rows", blocking: true });
  } else passed++;
  const failed = failures.filter((f) => f.blocking).length + failures.filter((f) => !f.blocking).length;
  return { passed, warnings, failed, failures };
}

// ---------------------------------------------------------------------------
// Rights decision + safety scan + freshness + publication engine.
// ---------------------------------------------------------------------------

export type RightsStatus =
  | "cleared" | "attribution" | "institution_only" | "derivative_restricted"
  | "download_restricted" | "expiring" | "unknown" | "disputed" | "prohibited";

export function rightsDecision(args: {
  license: string; derivativeAllowed?: boolean; attributionRequired?: boolean;
  expiresAt?: number | null; scope?: string; transformation?: string;
}): { status: RightsStatus; action: string } {
  const lic = args.license.toLowerCase();
  if (/prohibit|forbidden/.test(lic) || lic === "prohibited") {
    return { status: "prohibited", action: "block processing or remove material" };
  }
  if (!args.license || lic === "unknown" || lic === "") {
    return { status: "unknown", action: "hold publication; request rights review" };
  }
  if (args.transformation && args.derivativeAllowed === false) {
    return { status: "derivative_restricted", action: "block transformation; use as-is or seek permission" };
  }
  if (/disput/i.test(lic)) return { status: "disputed", action: "escalate to rights administrator" };
  if (args.expiresAt && args.expiresAt - Date.now() < 30 * 86_400_000) {
    return { status: "expiring", action: "schedule recheck before expiry" };
  }
  if (/subscription|institution/i.test(lic)) {
    return { status: "institution_only", action: "restrict access to authorized users" };
  }
  if (args.attributionRequired) return { status: "attribution", action: "add required attribution" };
  return { status: "cleared", action: "permit configured publication" };
}

export interface SafetyFinding {
  category: string; severity: "high" | "medium"; excerpt: string;
  action: "block" | "escalate" | "warn"; alternative?: string;
}

const SAFETY_PATTERNS: { category: string; severity: "high" | "medium"; re: RegExp; action: "block" | "escalate" | "warn"; alternative?: string }[] = [
  { category: "wrongdoing_instructions", severity: "high", re: /\bhow to (make|build|synthesize|create)\b.{0,40}\b(bomb|explosive|weapon|meth|fentanyl|poison)\b/i, action: "block" },
  { category: "weapons", severity: "high", re: /\b(build|assemble|modify).{0,30}\b(gun|firearm|rifle)\b/i, action: "block" },
  { category: "self_harm", severity: "high", re: /\b(how to )?(kill myself|commit suicide|self-harm methods|cut myself)\b/i, action: "escalate", alternative: "supportive resources and human contact" },
  { category: "malware", severity: "high", re: /\b(steal|harvest).{0,20}(credentials|passwords)|keylogger|ransomware (code|tutorial)\b/i, action: "block" },
  { category: "profiling", severity: "high", re: /\b(track|identify|profile) the learner\b.{0,20}\b(without consent|secretly)\b/i, action: "block" },
  { category: "answer_laundering", severity: "medium", re: /\b(reveal|leak).{0,20}(answer key|exam answers|hidden tests)\b/i, action: "escalate", alternative: "practice with similar (non-graded) items" },
  { category: "dangerous_advice", severity: "medium", re: /\b(take|double|stop taking).{0,20}(medication|dosage)\b.{0,20}(without|against).{0,20}(doctor|advice)\b/i, action: "escalate", alternative: "general information with clinician referral" },
  { category: "manipulation", severity: "medium", re: /\b(trick|manipulate|coerce).{0,20}(learner|student|child)\b.{0,20}(into|to obey)\b/i, action: "escalate" },
];

export function scanSafety(text: string, ageBand = ""): SafetyFinding[] {
  const out: SafetyFinding[] = [];
  for (const p of SAFETY_PATTERNS) {
    const m = text.match(p.re);
    if (m && m.index !== undefined) {
      out.push({
        category: p.category, severity: /child|minor|kid/i.test(ageBand) && p.severity === "medium" ? "high" : p.severity,
        excerpt: text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).slice(0, 200),
        action: p.action, alternative: p.alternative,
      });
    }
  }
  return out;
}

export type FreshnessState = "unaffected" | "citation_only" | "review_recommended" | "regeneration_required" | "publication_blocked";

/** Claim age vs rule: fresh → review → regenerate; safety/rights claims block. */
export function freshnessState(args: {
  ageDays: number; validDays: number; refreshDays: number;
  safetyOrRights?: boolean;
}): FreshnessState {
  if (args.ageDays <= args.refreshDays) return "unaffected";
  if (args.ageDays <= args.validDays) return args.safetyOrRights ? "review_recommended" : "citation_only";
  return args.safetyOrRights ? "publication_blocked" : "regeneration_required";
}

export type PublicationDecision =
  | "blocked" | "human_review" | "remediation_required"
  | "specialist_review" | "instructor_review" | "publish";

export interface PublicationInput {
  rights: RightsStatus; safetyHigh?: boolean; safetyDisallowed?: boolean;
  criticalMissing?: boolean; majorContradictions?: boolean;
  a11yBlocking?: boolean; biasHigh?: boolean; culturalHigh?: boolean;
  instructorApproved?: boolean;
}

/** Policy-driven release gate (thresholds differ by artifact type via caller). */
export function publicationDecision(r: PublicationInput): { decision: PublicationDecision; reasons: string[] } {
  const reasons: string[] = [];
  if (["unknown", "prohibited", "disputed"].includes(r.rights)) {
    reasons.push(`rights: ${r.rights}`);
    return { decision: "blocked", reasons };
  }
  if (r.safetyHigh || r.safetyDisallowed) {
    reasons.push("safety: high-risk or disallowed content");
    return { decision: "blocked", reasons };
  }
  if (r.criticalMissing) {
    reasons.push("citations: critical missing");
    return { decision: "blocked", reasons };
  }
  if (r.majorContradictions) {
    reasons.push("factual: unresolved major contradictions");
    return { decision: "human_review", reasons };
  }
  if (r.a11yBlocking) {
    reasons.push("accessibility: blocking failures");
    return { decision: "remediation_required", reasons };
  }
  if (r.biasHigh || r.culturalHigh) {
    reasons.push("bias/cultural: high risk");
    return { decision: "specialist_review", reasons };
  }
  if (!r.instructorApproved) {
    reasons.push("instructor approval pending");
    return { decision: "instructor_review", reasons };
  }
  return { decision: "publish", reasons: ["all gates passed"] };
}
