/**
 * Code Preview — syntax-aware formatting, language detection, safe truncation, DLP stripping
 * Never executes pasted code. Handles inline, file-level, repo/PR, diff snippets.
 */

import { sanitizeCode } from "./security";

export interface CodePreview {
  id: string;
  language: string | null;
  detectedLanguage: string | null;
  raw: string; // original
  safe: string; // sanitized, secrets redacted
  truncated: boolean;
  lineCount: number;
  charCount: number;
  hasSecrets: boolean;
  secretTypes: string[];
  highlights?: Array<{ line: number; kind: "add" | "remove" | "context" }>;
  isDiff: boolean;
  themeAware: true;
}

const DIFF_RE = /^@@.*@@/m;

function toLines(code: string): string[] { return code.split("\n"); }

function isDiff(code: string): boolean {
  return DIFF_RE.test(code) || code.split("\n").some((l) => l.startsWith("+") || l.startsWith("-"));
}

function diffHighlights(code: string): Array<{ line: number; kind: "add" | "remove" | "context" }> {
  const lines = toLines(code);
  return lines.map((l, i) => {
    if (l.startsWith("+") && !l.startsWith("+++")) return { line: i + 1, kind: "add" as const };
    if (l.startsWith("-") && !l.startsWith("---")) return { line: i + 1, kind: "remove" as const };
    return { line: i + 1, kind: "context" as const };
  });
}

export function previewCodeBlock(id: string, language: string | null, code: string): CodePreview {
  const { clean, redactedTypes } = sanitizeCode(code);
  const safe = clean;
  const hasSecrets = redactedTypes.length > 0;
  const isDiffFlag = isDiff(code);
  const highlights = isDiffFlag ? diffHighlights(code) : undefined;
  const lines = toLines(safe);
  let truncated = false;
  let out = safe;
  if (lines.length > 120 || safe.length > 8000) {
    truncated = true;
    const sliced = lines.slice(0, 120).join("\n").slice(0, 8000);
    out = sliced + `\n… truncated (${lines.length > 120 ? `${lines.length - 120} more lines` : `${safe.length - 8000} more chars`})`;
  }
  return {
    id,
    language,
    detectedLanguage: language,
    raw: code,
    safe: out,
    truncated,
    lineCount: lines.length,
    charCount: code.length,
    hasSecrets,
    secretTypes: redactedTypes,
    highlights,
    isDiff: isDiffFlag,
    themeAware: true,
  };
}

export function previewInlineCode(code: string): { safe: string; hasSecrets: boolean } {
  const { clean, redactedTypes } = sanitizeCode(code);
  return { safe: clean.slice(0, 500), hasSecrets: redactedTypes.length > 0 };
}

// Repo/PR preview — lightweight: just return structured fields for card adapter to render
export function previewRepo(path: string, meta: { owner?: string; repo?: string; branch?: string; file?: string; line?: string }): CodePreview | null {
  if (!path) return null;
  const summary = [meta.owner, meta.repo, meta.branch, meta.file].filter(Boolean).join(" / ");
  return previewCodeBlock(`repo:${path}`, null, `// ${summary}\n// Open in editor to view`);
}
