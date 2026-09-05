/**
 * N0VA BOOKLM EDUCATION — Document understanding deep layer.
 *
 * Pure, deterministic companions to doc-parse.ts / doc-ingest.ts: OCR
 * confusion scans, handwriting gating, formula record validation with
 * variable linking, structured figure records with chart-value provenance,
 * table-cell audits, citation verification ladders, multi-signal document
 * integrity assessment, chunk provenance envelopes with low-confidence
 * disclosure, transcript–slide alignment, and sandboxed code-extraction
 * checks (parse only — untrusted code is never executed).
 *
 * Production rule: extracted content is not ground truth until its
 * structure, location, and confidence are validated.
 */

// ---------------------------------------------------------------------------
// 1. OCR confusion scan + handwriting gating.
// ---------------------------------------------------------------------------

export interface OcrConfusion {
  pattern: string;
  excerpt: string;
  index: number;
  note: string;
}

const OCR_CONFUSIONS: { re: RegExp; pattern: string; note: string }[] = [
  { re: /[0-9][lI][0-9]|[lI][0-9]|[0-9][lI]/g, pattern: "1/l", note: "digit one vs lowercase L — verify quantities and identifiers" },
  { re: /[0-9][O][0-9a-zA-Z]|[a-zA-Z][O][0-9]/g, pattern: "0/O", note: "digit zero vs letter O — verify codes and formulas" },
  { re: /[a-zA-Z]×|[×][a-zA-Z0-9]/g, pattern: "x/×", note: "variable x vs multiplication sign — verify algebra" },
  { re: /\w–\w/g, pattern: "-/–", note: "hyphen vs en-dash vs minus — verify ranges and signs" },
  // NOTE: r+n vs m needs dictionary/domain validation (the OCR pipeline
  // stage), not a character scan — single-letter m is a legitimate math
  // variable and flagging it would drown real findings in noise.
];

/** Scan text for known OCR confusion-risk patterns. Review-oriented, not corrective. */
export function detectOcrConfusions(text: string, cap = 20): OcrConfusion[] {
  const out: OcrConfusion[] = [];
  for (const c of OCR_CONFUSIONS) {
    c.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = c.re.exec(text)) !== null && out.length < cap) {
      out.push({
        pattern: c.pattern,
        excerpt: text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).slice(0, 120),
        index: m.index,
        note: c.note,
      });
      if (m[0].length === 0) c.re.lastIndex++;
    }
  }
  return out;
}

export interface HandwritingAssessment {
  status: "machine_readable" | "human_confirmation_required" | "blocked_from_grading";
  confidence: number;
  alternatives: string[];
  gradingNote: string;
}

/**
 * Handwriting is explicitly probabilistic. Below 0.5 it must not silently
 * influence grading — block from automatic grading until human-confirmed.
 */
export function assessHandwritingBlock(confidence: number, alternatives: string[] = []): HandwritingAssessment {
  const conf = Math.max(0, Math.min(1, confidence));
  if (conf >= 0.75) {
    return { status: "machine_readable", confidence: conf, alternatives, gradingNote: "Readable — routine spot-checks still apply." };
  }
  if (conf >= 0.5) {
    return { status: "human_confirmation_required", confidence: conf, alternatives, gradingNote: "Confirm before use in feedback; never sole grading basis." };
  }
  return {
    status: "blocked_from_grading", confidence: conf, alternatives,
    gradingNote: "Low-confidence handwriting recognition must not silently influence grading — human transcription required.",
  };
}

// ---------------------------------------------------------------------------
// 2. Formula records: validation + variable linking.
// ---------------------------------------------------------------------------

export interface FormulaValidation {
  syntactic: boolean;
  renderable: boolean;
  symbolAmbiguity: boolean;
  features: { superscripts: boolean; subscripts: boolean; fractions: boolean; radicals: boolean; matrices: boolean; greek: boolean };
  confusions: OcrConfusion[];
  variablesLinked: { variable: string; definition: string | null }[];
  needsVisualConfirmation: boolean;
}

/** Brace balance + renderability heuristic + ambiguity inventory. */
export function validateFormulaRecord(latex: string, variables: string[] = [], nearbyText = ""): FormulaValidation {
  let depth = 0, balanced = true;
  for (const ch of latex) {
    if (ch === "{") depth++;
    if (ch === "}") { depth--; if (depth < 0) { balanced = false; break; } }
  }
  if (depth !== 0) balanced = false;
  const features = {
    superscripts: /\^/.test(latex),
    subscripts: /_/.test(latex),
    fractions: /\\d?frac\{/.test(latex),
    radicals: /\\sqrt/.test(latex),
    matrices: /\\begin\{(matrix|pmatrix|bmatrix)\}/.test(latex),
    greek: /\\(alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|phi|omega|Delta|Sigma|Phi)\b/.test(latex),
  };
  const confusions = detectOcrConfusions(latex, 10);
  const variablesLinked = variables.map((v) => {
    const clean = v.replace(/[{}\\]/g, "");
    // "where X is/demotes/means ..." within nearby text.
    const m = nearbyText.match(new RegExp(`\\bwhere\\s+${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(is|denotes|means|represents)\\b[^.!?]{0,100}`, "i"));
    return { variable: v, definition: m ? m[0].slice(0, 120) : null };
  });
  const needsVisualConfirmation = !balanced || confusions.length > 0;
  return {
    syntactic: balanced,
    renderable: balanced && latex.trim().length > 0,
    symbolAmbiguity: confusions.length > 0,
    features,
    confusions,
    variablesLinked,
    needsVisualConfirmation,
  };
}

// ---------------------------------------------------------------------------
// 3. Figures: structured records + chart-value provenance wording.
// ---------------------------------------------------------------------------

export type ChartValueKind = "embedded" | "axis_estimated" | "trend_inferred" | "unavailable";

export interface FigureRecord {
  figure_id: string;
  type: string;
  nodes: { id: string; label: string }[];
  edges: { from: string; to: string }[];
  caption: string;
  labelCount: number;
  relationCount: number;
  confidence: number;
}

export function figureRecord(args: {
  figureId: string; type?: string; nodes?: unknown; edges?: unknown;
  caption?: string; confidence?: number;
}): FigureRecord {
  const labels: { id: string; label: string }[] = [];
  const push = (v: unknown, i: number) => {
    if (typeof v === "string" && v.trim()) labels.push({ id: `n${i + 1}`, label: v.trim().slice(0, 120) });
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const label = ["label", "name", "text", "title"].map((k) => o[k]).find((x) => typeof x === "string" && (x as string).trim());
      labels.push({ id: typeof o.id === "string" ? o.id : `n${i + 1}`, label: String(label ?? "").slice(0, 120) });
    }
  };
  if (Array.isArray(args.nodes)) args.nodes.forEach(push);
  const edges = Array.isArray(args.edges)
    ? args.edges.flatMap((e) => {
      if (e && typeof e === "object" && typeof (e as Record<string, unknown>).from === "string") {
        return [{ from: String((e as Record<string, unknown>).from), to: String((e as Record<string, unknown>).to ?? "") }];
      }
      return [];
    })
    : [];
  return {
    figure_id: args.figureId,
    type: args.type ?? "figure",
    nodes: labels.slice(0, 40),
    edges: edges.slice(0, 80),
    caption: args.caption ?? "",
    labelCount: labels.length,
    relationCount: edges.length,
    confidence: args.confidence ?? 0.5,
  };
}

/**
 * Chart-value provenance wording. Inferred values must be introduced with
 * "the chart suggests" — never stated as extracted facts.
 */
export function chartValueWording(kind: ChartValueKind): string {
  switch (kind) {
    case "embedded": return "value directly embedded in label";
    case "axis_estimated": return "value estimated from visual axes — verify against source";
    case "trend_inferred": return "the chart suggests — inferred from trend, not extracted";
    case "unavailable": return "value unavailable from the image";
  }
}

// ---------------------------------------------------------------------------
// 4. Table-cell audit.
// ---------------------------------------------------------------------------

export interface TableCellIssue {
  location: string;
  kind: "blank_vs_zero" | "ragged_row" | "low_confidence" | "repeated_header" | "merged_overlap";
  detail: string;
}

export interface TableCellAudit {
  rows: number;
  columns: number;
  blankCells: number;
  zeroCells: number;
  issues: TableCellIssue[];
  status: "ok" | "review_required";
}

/**
 * Structural table safeguards: ragged rows (column drift), blank-vs-zero
 * ambiguity in numeric columns, low-confidence cells, repeated headers
 * across pages, overlapping merged ranges.
 */
export function auditTableCells(
  cells: { row: number; column: number; text: string; confidence?: number; rowspan?: number; colspan?: number }[][],
  headers: string[] = [],
  opts: { lowConfidenceThreshold?: number } = {},
): TableCellAudit {
  const threshold = opts.lowConfidenceThreshold ?? 0.7;
  const flat = cells.flat();
  const width = Math.max(0, ...cells.map((r) => r.length), headers.length);
  const issues: TableCellIssue[] = [];
  let blanks = 0, zeros = 0;
  const occupied = new Set<string>();
  cells.forEach((rowCells, ri) => {
    if (rowCells.length !== width && width > 0) {
      issues.push({ location: `row_${ri + 1}`, kind: "ragged_row", detail: `row has ${rowCells.length} cells vs ${width} columns — possible column drift` });
    }
    for (const c of rowCells) {
      const key = `${c.row}:${c.column}`;
      const t = (c.text ?? "").trim();
      if (t === "") blanks++;
      if (/^0+(\.0+)?$/.test(t)) zeros++;
      if (t === "" && headers.length > 0) {
        issues.push({ location: `r${c.row}c${c.column}`, kind: "blank_vs_zero", detail: "blank cell in headed table — blank is not zero; confirm intent" });
      }
      if ((c.confidence ?? 1) < threshold) {
        issues.push({ location: `r${c.row}c${c.column}`, kind: "low_confidence", detail: `cell confidence ${(c.confidence ?? 0).toFixed(2)} below ${threshold}` });
      }
      const rs = c.rowspan ?? 1, cs = c.colspan ?? 1;
      for (let dr = 0; dr < rs; dr++) {
        for (let dc = 0; dc < cs; dc++) {
          const k = `${c.row + dr}:${c.column + dc}`;
          if (dr + dc > 0 && occupied.has(k)) {
            issues.push({ location: `r${c.row}c${c.column}`, kind: "merged_overlap", detail: `merged range overlaps cell ${k}` });
          }
          occupied.add(k);
        }
      }
      void key;
    }
  });
  return {
    rows: cells.length,
    columns: width,
    blankCells: blanks,
    zeroCells: zeros,
    issues: issues.slice(0, 30),
    status: issues.length > 0 ? "review_required" : "ok",
  };
}

/** Repeated headers across pages (continued tables) — informational, not an error. */
export function repeatedHeaders(headers: string[], priorHeaders: string[][]): { repeated: boolean; detail: string } {
  const norm = (h: string[]) => h.map((x) => x.toLowerCase().trim()).join("|");
  const hit = priorHeaders.some((p) => p.length > 0 && norm(p) === norm(headers));
  return hit
    ? { repeated: true, detail: "headers repeat a prior page — likely a continued table, keep rows joined" }
    : { repeated: false, detail: "no repeated header detected" };
}

// ---------------------------------------------------------------------------
// 5. Citation verification ladder.
// ---------------------------------------------------------------------------

export type CitationStage = "found" | "parsed" | "matched" | "verified" | "supporting";

export interface CitationStageResult {
  stage: CitationStage;
  next: string;
}

/**
 * Presence ≠ proof. Each rung states exactly what is established and what
 * remains: found → parsed → matched to bibliography → verified against the
 * source → actually supporting the nearby claim.
 */
export function citationStage(args: {
  found: boolean; parsed?: boolean; matched?: boolean; verified?: boolean; supports?: boolean;
}): CitationStageResult {
  if (!args.found) return { stage: "found", next: "citation not found — locate the in-text marker" };
  if (!args.parsed) return { stage: "found", next: "parse raw text into typed citation object" };
  if (!args.matched) return { stage: "parsed", next: "match to a bibliography entry" };
  if (!args.verified) return { stage: "matched", next: "verify against the referenced source" };
  if (!args.supports) return { stage: "verified", next: "check the passage actually supports the nearby claim" };
  return { stage: "supporting", next: "complete — citation supports the claim" };
}

// ---------------------------------------------------------------------------
// 6. Multi-signal document integrity assessment.
// ---------------------------------------------------------------------------

export type DocumentStatus = "complete" | "incomplete_possible" | "corrupted";

export interface IntegrityWarning {
  type: string;
  locations: string[];
  reason: string;
  confidence: number;
}

export interface IntegrityAssessment {
  document_status: DocumentStatus;
  warnings: IntegrityWarning[];
  recommended_action: "none" | "request_original_export_or_rescan" | "confirm_before_high_stakes_use";
  blocksHighStakes: boolean;
}

/**
 * Combine page-sequence gaps, figure-number gaps, truncation signals,
 * table continuations without precedents, and expected-vs-actual page
 * counts. High-confidence claims depending on missing regions stay blocked
 * until the user confirms.
 */
export function assessDocumentIntegrity(args: {
  pageNumbers: number[];
  figureCaptions?: string[];
  figureNumbers?: number[];
  lastParagraph?: string;
  tableStarts?: number[];
  tableContinuations?: number[];
  expectedPages?: number;
  actualPages?: number;
}): IntegrityAssessment {
  const warnings: IntegrityWarning[] = [];
  const pages = [...new Set(args.pageNumbers)].sort((a, b) => a - b);
  for (let i = 1; i < pages.length; i++) {
    if (pages[i]! - pages[i - 1]! > 1) {
      warnings.push({
        type: "page_sequence_gap",
        locations: [`page_${pages[i - 1]! + 1}..${pages[i]! - 1}`],
        reason: `sequence jumps from ${pages[i - 1]} to ${pages[i]}`,
        confidence: 0.93,
      });
    }
  }
  const figs = [...new Set(args.figureNumbers ?? [])].sort((a, b) => a - b);
  for (let i = 1; i < figs.length; i++) {
    if (figs[i]! - figs[i - 1]! > 1) {
      warnings.push({
        type: "figure_numbering_gap",
        locations: [`fig_${figs[i - 1]! + 1}..${figs[i]! - 1}`],
        reason: `figure numbering jumps from ${figs[i - 1]} to ${figs[i]}`,
        confidence: 0.79,
      });
    }
  }
  const last = (args.lastParagraph ?? "").trim();
  if (last && !/[.!?:"”']$/.test(last)) {
    warnings.push({ type: "truncated_section", locations: ["last_paragraph"], reason: "final paragraph ends mid-sentence", confidence: 0.79 });
  }
  if (/continued on next page\.?$/i.test(last)) {
    warnings.push({ type: "broken_continuation", locations: ["last_paragraph"], reason: "dangling “continued on next page” with no following page", confidence: 0.85 });
  }
  for (const t of args.tableContinuations ?? []) {
    if (!(args.tableStarts ?? []).some((s) => s < t)) {
      warnings.push({ type: "orphan_table_continuation", locations: [`page_${t}`], reason: "table continuation without a preceding table", confidence: 0.8 });
    }
  }
  if (args.expectedPages != null && args.actualPages != null && args.actualPages < args.expectedPages) {
    warnings.push({
      type: "page_count_shortfall",
      locations: [],
      reason: `metadata claims ${args.expectedPages} pages, only ${args.actualPages} present`,
      confidence: 0.9,
    });
  }
  const status: DocumentStatus = warnings.some((w) => w.confidence >= 0.9) ? "incomplete_possible" : warnings.length > 0 ? "incomplete_possible" : "complete";
  void args.figureCaptions;
  return {
    document_status: status,
    warnings: warnings.slice(0, 20),
    recommended_action: warnings.length === 0 ? "none" : "request_original_export_or_rescan",
    blocksHighStakes: warnings.length > 0,
  };
}

// ---------------------------------------------------------------------------
// 7. Chunk provenance envelope + low-confidence disclosure.
// ---------------------------------------------------------------------------

export interface ChunkProvenance {
  chunk_id: string;
  content_type: string;
  text: string;
  source: { document_id: string; page: number | null; bbox: number[] | null; snapshot: string };
  extraction: { method: string; model_version: string; confidence: number };
  correction_state: "raw" | "corrected" | "user_verified";
}

/** Provenance-preserving chunk envelope for the retrieval index. */
export function chunkProvenance(args: {
  chunkId: string; contentType: string; text: string;
  documentId: string; page?: number | null; bbox?: number[] | null; snapshot?: string;
  method?: string; modelVersion?: string; confidence?: number;
  corrected?: boolean; userVerified?: boolean;
}): ChunkProvenance {
  return {
    chunk_id: args.chunkId,
    content_type: args.contentType,
    text: args.text.slice(0, 2000),
    source: {
      document_id: args.documentId,
      page: args.page ?? null,
      bbox: args.bbox ?? null,
      snapshot: args.snapshot ?? "v1",
    },
    extraction: {
      method: args.method ?? "text_ocr",
      model_version: args.modelVersion ?? "ingest-1.0",
      confidence: Math.max(0, Math.min(1, args.confidence ?? 0.5)),
    },
    correction_state: args.userVerified ? "user_verified" : args.corrected ? "corrected" : "raw",
  };
}

/**
 * Direct disclosure when answers depend on shaky extraction — surfaced to
 * the learner, never buried in metadata.
 */
export function lowConfidenceDisclosure(confidence: number, location: string, threshold = 0.7): string | null {
  if (confidence >= threshold) return null;
  return `This answer depends on a low-confidence extraction reading (${confidence.toFixed(2)}) at ${location}. Please verify against the displayed source before relying on it.`;
}

// ---------------------------------------------------------------------------
// 8. Transcript–slide alignment.
// ---------------------------------------------------------------------------

export interface AlignedSegment {
  segmentKey: string;
  slide: string | null;
  reason: string;
}

/**
 * Align transcript segments to slides by timestamp overlap. Segments with
 * no overlapping slide keep linked_slide empty and say so — alignment is
 * reported, never invented.
 */
export function alignTranscriptToSlides(
  segments: { segmentKey: string; startSec: number; endSec: number }[],
  slides: { slideKey: string; startSec: number; endSec: number }[],
): AlignedSegment[] {
  return segments.map((s) => {
    const hit = slides.find((sl) => s.startSec < sl.endSec && s.endSec > sl.startSec);
    return {
      segmentKey: s.segmentKey,
      slide: hit ? hit.slideKey : null,
      reason: hit
        ? `timestamp overlap [${s.startSec}s–${s.endSec}s] with ${hit.slideKey}`
        : "no overlapping slide — spoken explanation without a visual anchor",
    };
  });
}

// ---------------------------------------------------------------------------
// 9. Code-extraction checks (static only — never execute).
// ---------------------------------------------------------------------------

export interface CodeExtractionCheck {
  balanced: boolean;
  indentationConsistent: boolean;
  commentRatio: number;
  ocrCorruptions: OcrConfusion[];
  warnings: string[];
  status: "parseable" | "needs_review";
}

/**
 * Language-aware static checks without execution: bracket balance,
 * indentation consistency, comment/code separation note, OCR corruption
 * markers. Screenshots of code should be shown next to this output with
 * uncertain characters highlighted by the caller.
 */
export function checkCodeExtraction(content: string, language = ""): CodeExtractionCheck {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const stack: string[] = [];
  let balanced = true, inStr: string | null = null, prev = "";
  const code = content.replace(/'''[\s\S]*?'''|"""[\s\S]*?"""|`[^`]*`/g, (m) => " ".repeat(m.length));
  for (const ch of code) {
    if (inStr) {
      if (ch === inStr && prev !== "\\") inStr = null;
    } else if (ch === '"' || ch === "'") {
      inStr = ch;
    } else if (pairs[ch]) {
      stack.push(pairs[ch]);
    } else if (Object.values(pairs).includes(ch)) {
      if (stack.pop() !== ch) { balanced = false; break; }
    }
    prev = ch;
  }
  if (stack.length > 0) balanced = false;
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const indents = lines.map((l) => (l.match(/^(\s*)/)?.[1] ?? "").length);
  const oddIndent = indents.some((n) => n % 2 !== 0 && n % 4 !== 0);
  const starts = lines.map((l) => l[0] ?? "");
  const tabMix = starts.includes("\t") && starts.includes(" ");
  // Comment/code separation runs on string-stripped code so comment-looking
  // text inside literals never counts. Both full-line and trailing comments
  // count — a trailing "# explain" is still documentation.
  const strippedLines = code.split("\n").filter((l) => l.trim().length > 0);
  const commentLines = strippedLines.filter((l) => {
    const t = l.trim();
    return /(^|[\s(;{,])#|\/\*|^\s*\*|^\s*\/\/|^\s*--(\s|$)|^\s*%/.test(t);
  }).length;
  const ocrCorruptions = detectOcrConfusions(content, 10);
  const warnings: string[] = [];
  if (!balanced) warnings.push("unbalanced brackets — possible truncation or OCR corruption");
  if (oddIndent) warnings.push("possible indentation ambiguity — verify against the original image");
  if (tabMix) warnings.push("mixed tabs and spaces — normalize before use");
  if (ocrCorruptions.length > 0) warnings.push(`${ocrCorruptions.length} OCR confusion-risk pattern(s) — highlight uncertain characters`);
  // NOTE: no generic "has indentation" warning — indentation is significant
  // and expected; only inconsistency (odd indents, tab/space mixing) warns.
  void language;
  return {
    balanced,
    indentationConsistent: !oddIndent && !tabMix,
    commentRatio: lines.length ? Math.round((commentLines / lines.length) * 100) / 100 : 0,
    ocrCorruptions,
    warnings,
    status: warnings.length > 0 ? "needs_review" : "parseable",
  };
}
