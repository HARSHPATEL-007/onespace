/**
 * Document parsers — pure, dependency-free, deterministic.
 * Markdown tables, code fences, LaTeX, citations, language/script detection,
 * sequence-gap detection, quality aggregation. No prisma, no node APIs.
 */

export interface ParsedTable {
  caption: string; headers: string[];
  rows: { cells: { text: string; confidence: number }[] }[];
  footnotes: string[]; warnings: string[];
}

function looksLikeDelimiter(line: string): boolean {
  const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  return cells.length >= 2 && cells.every((c) => /^:?-+:?$/.test(c));
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

/** Parse pipe tables; flags uneven rows, blanks-vs-zero, repeated headers. */
export function parseMarkdownTables(text: string): ParsedTable[] {
  const lines = text.split("\n");
  const out: ParsedTable[] = [];
  let caption = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^(table|tbl)\b[:\s]/i.test(line.trim())) caption = line.trim();
    if (!line.includes("|") || i + 1 >= lines.length || !looksLikeDelimiter(lines[i + 1]!)) continue;
    const headers = splitRow(line);
    const rows: ParsedTable["rows"] = [];
    const warnings: string[] = [];
    let j = i + 2;
    for (; j < lines.length; j++) {
      const l = lines[j]!;
      if (!l.includes("|") || l.trim() === "") break;
      const cells = splitRow(l);
      if (cells.length !== headers.length) {
        warnings.push(`row ${rows.length + 1}: ${cells.length} cells vs ${headers.length} headers (possible merged cells)`);
      }
      rows.push({
        cells: cells.map((text) => ({
          text, confidence: text === "" ? 0.3 : /^\d+(\.\d+)?$/.test(text) ? 0.95 : 0.85,
        })),
      });
    }
    if (rows.length === 0) { i = j; continue; }
    const blanks = rows.flatMap((r) => r.cells).filter((c) => c.text === "").length;
    const zeros = rows.flatMap((r) => r.cells).filter((c) => c.text === "0").length;
    if (blanks > 0) warnings.push(`${blanks} blank cell(s) — blank ≠ zero`);
    if (zeros > 0) warnings.push(`${zeros} explicit zero(s) preserved`);
    const footnotes: string[] = [];
    while (j < lines.length && /^\s*(\*|†|‡|note:)/i.test(lines[j]!)) {
      footnotes.push(lines[j]!.trim());
      j++;
    }
    out.push({ caption, headers, rows, footnotes, warnings });
    caption = "";
    i = j - 1;
  }
  return out;
}

export interface ParsedCode {
  language: string; content: string; lines: number; warnings: string[];
}

/** Fenced code blocks with indentation + language checks. */
export function parseCodeFences(text: string): ParsedCode[] {
  const out: ParsedCode[] = [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const content = m[2] ?? "";
    const warnings: string[] = [];
    const lines = content.split("\n");
    if (lines.some((l) => /^\t+ /.test(l) || /^ +\t/.test(l))) {
      warnings.push("mixed tabs/spaces — possible indentation ambiguity");
    }
    out.push({
      language: detectCodeLanguage(content, m[1] || ""),
      content, lines: lines.length, warnings,
    });
  }
  return out;
}

/** Language from fence hint, shebang, or keywords. */
export function detectCodeLanguage(content: string, hint = ""): string {
  if (hint) return hint.toLowerCase();
  if (/^#!.*\b(python|node|bash|ruby)\b/.test(content)) {
    const s = content.match(/^#!.*\b(python|node|bash|ruby)\b/)![1]!;
    return s === "node" ? "javascript" : s;
  }
  if (/\b(def |import |print\(|:\s*$)/m.test(content) && /:\s*$/m.test(content)) return "python";
  if (/\b(function|const |let |=>|console\.log)\b/.test(content)) return "javascript";
  if (/\b(public (class|static)|System\.out|import java)\b/.test(content)) return "java";
  if (/#include\s*</.test(content) || /\bstd::/.test(content)) return "cpp";
  if (/\b(SELECT|FROM|WHERE)\b/i.test(content)) return "sql";
  return "";
}

export interface ParsedFormula {
  latex: string; plain: string; variables: string[];
  numbered: string | null; confusions: string[];
}

/** Display $$..$$, \[..\], equation environments; OCR-confusion scan. */
export function parseLatex(text: string): ParsedFormula[] {
  const out: ParsedFormula[] = [];
  const patterns = [/\$\$([\s\S]+?)\$\$/g, /\\\[([\s\S]+?)\\\]/g, /\\begin\{equation\*?\}([\s\S]+?)\\end\{equation\*?\}/g];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const latex = m[1]!.trim();
      const variables = [...new Set(
        (latex.match(/\\(alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|phi|omega)\b|[a-zA-Z]/g) ?? [])
          .map((v) => v.replace("\\", "")),
      )].slice(0, 20);
      const numbered = (latex.match(/\\(tag|label)\{([^}]+)\}/) ?? [])[2] ?? null;
      const confusions: string[] = [];
      if (/(^|[^a-zA-Z])1([^a-zA-Z]|$)/.test(latex) && /\\ell|l/.test(latex)) confusions.push("1/l ambiguity");
      if (/(?<![A-Za-z])0(?![A-Za-z])/.test(latex) && /O/.test(latex)) confusions.push("0/O ambiguity");
      if (/\\times/.test(latex) && /(^|[^a-zA-Z])x([^a-zA-Z]|$)/.test(latex)) confusions.push("x/× ambiguity");
      if (/–|—/.test(latex)) confusions.push("minus/en-dash ambiguity");
      out.push({ latex, plain: latex.replace(/\\[a-zA-Z]+\{?/g, "").replace(/[{}^_]/g, "").slice(0, 300), variables, numbered, confusions });
    }
  }
  return out;
}

export interface ParsedCitation {
  raw: string; type: "numeric" | "author_date" | "footnote" | "doi" | "url" | "unknown";
  normalized: { authors?: string[]; year?: string; title?: string; doi?: string; url?: string };
}

/** Numeric [12], author-date, footnotes, DOI/URL citations. */
export function parseCitations(text: string): ParsedCitation[] {
  const out: ParsedCitation[] = [];
  const seen = new Set<string>();
  const push = (c: ParsedCitation) => {
    if (seen.has(c.raw)) return;
    seen.add(c.raw);
    out.push(c);
  };
  for (const m of text.matchAll(/\[(\d{1,3})\]/g)) {
    push({ raw: m[0], type: "numeric", normalized: {} });
  }
  for (const m of text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:\s+et al\.?)?),?\s+(19|20)\d{2}\b/g)) {
    push({ raw: m[0], type: "author_date", normalized: { authors: [m[1]!.replace(/\s+et al\.?/, "")], year: m[0].match(/(19|20)\d{2}/)![0] } });
  }
  for (const m of text.matchAll(/\[\^(\d+)\]/g)) {
    push({ raw: m[0], type: "footnote", normalized: {} });
  }
  for (const m of text.matchAll(/10\.\d{4,}\/[^\s)]+/g)) {
    push({ raw: m[0], type: "doi", normalized: { doi: m[0] } });
  }
  for (const m of text.matchAll(/https?:\/\/[^\s)]+/g)) {
    if (!/doi\.org/.test(m[0])) push({ raw: m[0], type: "url", normalized: { url: m[0] } });
  }
  return out.slice(0, 100);
}

/** Match numeric citations to a numbered bibliography. */
export function matchBibliography(citations: ParsedCitation[], references: string[]): { citation: string; resolution: string; confidence: number }[] {
  const refMap = new Map<string, string>();
  for (const line of references) {
    const m = line.match(/^\s*\[?(\d{1,3})\]?(?:[\.\)]\s*|\s+)(.+)/);
    if (m) refMap.set(m[1]!, m[2]!.slice(0, 300));
  }
  return citations.filter((c) => c.type === "numeric").map((c) => {
    const n = c.raw.replace(/[\[\]]/g, "");
    const hit = refMap.get(n);
    return {
      citation: c.raw,
      resolution: hit ? `matched_reference_${n}` : "unresolved",
      confidence: hit ? 0.9 : 0.3,
    };
  });
}

// ---------------------------------------------------------------------------
// Script-aware language detection (block level; Han/Cyrillic report candidates).
// ---------------------------------------------------------------------------

export interface LangGuess { language: string; script: string; confidence: number; candidates?: string[] }

const SCRIPTS: { script: string; re: RegExp; language: string; confidence: number; candidates?: string[] }[] = [
  { script: "Devanagari", re: /[\u0900-\u097F]/, language: "hi", confidence: 0.9, candidates: ["hi", "mr", "ne"] },
  { script: "Arabic", re: /[\u0600-\u06FF]/, language: "ar", confidence: 0.9, candidates: ["ar", "fa", "ur"] },
  { script: "Han", re: /[\u4E00-\u9FFF]/, language: "zh", confidence: 0.7, candidates: ["zh", "ja", "ko"] },
  { script: "Hiragana/Katakana", re: /[\u3040-\u30FF]/, language: "ja", confidence: 0.95 },
  { script: "Hangul", re: /[\uAC00-\uD7AF]/, language: "ko", confidence: 0.95 },
  { script: "Cyrillic", re: /[\u0400-\u04FF]/, language: "ru", confidence: 0.75, candidates: ["ru", "uk", "bg", "sr"] },
  { script: "Hebrew", re: /[\u0590-\u05FF]/, language: "he", confidence: 0.95 },
  { script: "Greek", re: /[\u0370-\u03FF]/, language: "el", confidence: 0.9 },
  { script: "Thai", re: /[\u0E00-\u0E7F]/, language: "th", confidence: 0.95 },
];

export function detectLanguage(text: string): LangGuess {
  for (const s of SCRIPTS) {
    if (s.re.test(text)) {
      return { language: s.language, script: s.script, confidence: s.confidence, candidates: s.candidates };
    }
  }
  if (/[a-zA-Z]/.test(text)) return { language: "en", script: "Latin", confidence: 0.7, candidates: ["en", "es", "fr", "de"] };
  return { language: "unknown", script: "unknown", confidence: 0.2 };
}

export function detectMixedBlocks(paragraphs: string[]): { mixed: boolean; segments: { index: number; language: string; script: string }[] } {
  const segments = paragraphs.map((p, index) => {
    const g = detectLanguage(p);
    return { index, language: g.language, script: g.script };
  });
  const langs = new Set(segments.map((s) => s.language));
  return { mixed: langs.size > 1, segments };
}

// ---------------------------------------------------------------------------
// Missing-page / corruption signals (sequence gaps, truncation, numbering).
// ---------------------------------------------------------------------------

export interface SequenceWarning { type: string; detail: string; confidence: number }

export function detectSequenceGaps(pageNumbers: number[]): SequenceWarning[] {
  const out: SequenceWarning[] = [];
  const sorted = [...new Set(pageNumbers)].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]! - sorted[i - 1]! > 1) {
      out.push({
        type: "page_sequence_gap",
        detail: `expected ${sorted[i - 1]! + 1}, observed ${sorted[i]!}`,
        confidence: 0.93,
      });
    }
  }
  return out;
}

export function detectTruncation(lastParagraph: string): SequenceWarning | null {
  const t = lastParagraph.trim();
  if (!t) return null;
  if (/continued on (the )?next page|…|\.\.\.$/i.test(t)) {
    return { type: "continued_marker", detail: "explicit continuation marker", confidence: 0.9 };
  }
  if (!/[.!?:"”')\]]$/.test(t) && t.split(/\s+/).length > 8) {
    return { type: "truncated_section", detail: "abrupt termination without closing punctuation", confidence: 0.79 };
  }
  return null;
}

export function figureNumberGaps(captions: string[]): SequenceWarning[] {
  const nums = captions
    .map((c) => c.match(/(?:figure|fig\.?|table|tbl\.?)\s*(\d+)/i)?.[1])
    .filter((n): n is string => !!n)
    .map(Number);
  const out: SequenceWarning[] = [];
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]! - sorted[i - 1]! > 1) {
      out.push({ type: "figure_numbering_gap", detail: `gap between ${sorted[i - 1]} and ${sorted[i]}`, confidence: 0.7 });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Quality aggregation: per-level confidence, never one number.
// ---------------------------------------------------------------------------

export interface QualityParts {
  fileIntegrity?: number; textExtraction?: number; layoutStructure?: number;
  tables?: number; formulas?: number; citations?: number;
}

export function aggregateQuality(parts: QualityParts, warnings: { type: string; locations: string[]; reason: string }[]): {
  confidence: Required<QualityParts>; overallStatus: "verified" | "review_recommended" | "incomplete_possible"; warnings: typeof warnings;
} {
  const d = (v: number | undefined, dflt: number) => (typeof v === "number" ? v : dflt);
  const confidence: Required<QualityParts> = {
    fileIntegrity: d(parts.fileIntegrity, 0.9),
    textExtraction: d(parts.textExtraction, 0.7),
    layoutStructure: d(parts.layoutStructure, 0.7),
    tables: d(parts.tables, 0.6),
    formulas: d(parts.formulas, 0.6),
    citations: d(parts.citations, 0.7),
  };
  const min = Math.min(confidence.tables, confidence.formulas, confidence.textExtraction);
  const overallStatus = warnings.some((w) => w.type === "page_sequence_gap" || w.type === "truncated_section")
    ? "incomplete_possible"
    : min < 0.6 || warnings.length > 3 ? "review_recommended" : "verified";
  return { confidence, overallStatus, warnings };
}

/** SRT/VTT timestamp parser → segments (speaker labels assigned downstream). */
export function parseTranscriptTimestamps(text: string): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  const toSec = (t: string): number => {
    const m = t.match(/(?:(\d+):)?(\d+):(\d+)[,.](\d+)/);
    if (!m) return 0;
    return (Number(m[1] ?? 0) * 3600) + (Number(m[2]) * 60) + Number(m[3]) + Number(m[4]) / 1000;
  };
  const blocks = text.split(/\n\s*\n/);
  for (const b of blocks) {
    const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
    const timeIdx = lines.findIndex((l) => /-->/.test(l));
    if (timeIdx < 0) continue;
    const [s, e] = lines[timeIdx]!.split("-->").map((x) => x.trim());
    const body = lines.slice(timeIdx + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (body) out.push({ start: toSec(s ?? ""), end: toSec(e ?? ""), text: body });
  }
  return out.slice(0, 2000);
}
