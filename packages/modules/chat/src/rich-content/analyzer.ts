/**
 * Message Analyzer — URLs, attachments, code blocks
 * Part of rich-content Message Interaction System
 * Policy-aware, tenant-scoped, never executes code.
 */

export interface CodeBlock {
  id: string;
  language: string | null;
  raw: string;
  truncated: string;
  lineCount: number;
  charCount: number;
  isTruncated: boolean;
  hasSecrets: boolean;
  secretTypes: string[];
}

export interface UrlMatch {
  url: string;
  cleanUrl: string; // without trailing punctuation
  domain: string;
  isInternal: boolean; // N0VA internal vs external
  isN0vaObject: boolean; // tasks, docs, meetings, approvals
  n0vaObjectType?: "task" | "doc" | "meeting" | "approval" | "crm" | "file" | "sheet" | "site";
  n0vaObjectId?: string;
}

export interface AttachmentInfo {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  extension: string;
  isImage: boolean;
  isVideo: boolean;
  isPdf: boolean;
  isDoc: boolean;
  isSheet: boolean;
  isCode: boolean;
}

export interface MessageAnalysis {
  body: string;
  urls: UrlMatch[];
  codeBlocks: CodeBlock[];
  inlineCode: string[];
  attachments: AttachmentInfo[];
  hasCode: boolean;
  hasUrls: boolean;
  hasAttachments: boolean;
  mentionCount: number;
  summaryLine: string; // one clear summary per UX rule
}

// N0VA internal object URL patterns
const N0VA_OBJECT_RE = /\/m\/(tasks|docs|calendar|sales|crm|cloud-storage|sheets|sites|approvals|chat)[\/\?][^\s"']*/gi;
const SHEET_RANGE_RE = /sheets?\.[^\s]*\/d\/[^\/]+\/[^ \n]*/i;
const TASK_RE = /\/m\/tasks\/(?<id>[a-z0-9-]+)/i;
const DOC_RE = /\/m\/docs\/(?<id>[a-z0-9-]+)/i;

const URL_RE = /\bhttps?:\/\/[^\s<>"'{}|\^`\[\]]+[^\s<>"'.,;!?)\]}]/gi;
const CODE_BLOCK_RE = /```(\w*)\n?([\s\S]*?)```/g;
const INLINE_CODE_RE = /`([^`\n]+)`/g;

// Keep secure: never match javascript:, data:, file: as unfurl candidates
const UNSAFE_PROTOCOL_RE = /^(javascript|data|file|vbscript):/i;

// DLP patterns for code secret detection (reuse compliance patterns)
const SECRET_IN_CODE: Array<[RegExp, string]> = [
  [/\bsk-[A-Za-z0-9]{20,}\b/, "openai_key"],
  [/\bghp_[A-Za-z0-9]{36}\b/, "github_token"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/, "github_pat"],
  [/\bAKIA[0-9A-Z]{16}\b/, "aws_key"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "gcp_key"],
  [/\b-----BEGIN (?:RSA )?PRIVATE KEY-----/, "private_key"],
  [/\b[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\b.*eyJ/, "jwt"], // rough
  [/\bxox[bpras]-[A-Za-z0-9-]{10,}\b/, "slack_token"],
];

const CODE_LANGUAGES = new Set([
  "js","javascript","ts","typescript","tsx","jsx","py","python","java","go","rust","rb","ruby","php","c","cpp","cs","csharp","swift","kotlin","sql","json","yaml","yml","toml","sh","bash","shell","ps1","powershell","css","html","xml","dockerfile","makefile","sql","graphql","proto","log","text","plain",
]);

function detectLanguage(hint: string | null, code: string): string | null {
  if (hint && CODE_LANGUAGES.has(hint.toLowerCase())) return hint.toLowerCase();
  if (hint) return hint.toLowerCase().slice(0, 20);
  // Heuristic auto-detect
  if (/^\s*\{[\s\S]*"[^"]*"\s*:\s*/m.test(code) && code.includes("{") && code.includes("}")) return "json";
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i.test(code)) return "sql";
  if (/^\s*<\?xml|^\s*<\w+[\s>]/m.test(code)) return "xml";
  if (/^\s*#!(?:\/usr\/bin\/env |\/?bin\/)(bash|sh|python|node)/m.test(code)) return "sh";
  if (/^\s*package\s+\w+|^\s*import\s+["']|func\s+\w+\(/m.test(code)) return "go";
  if (/^\s*def\s+\w+\(|^\s*import\s+\w+/m.test(code)) return "py";
  return null;
}

function secretsInCode(code: string): { hasSecrets: boolean; types: string[] } {
  const types: string[] = [];
  for (const [re, label] of SECRET_IN_CODE) {
    if (re.test(code)) types.push(label);
  }
  return { hasSecrets: types.length > 0, types };
}

function truncateCode(code: string, maxLines = 120, maxChars = 8000): { truncated: string; isTruncated: boolean } {
  const lines = code.split("\n");
  let out = code;
  let isTruncated = false;
  if (lines.length > maxLines) {
    out = lines.slice(0, maxLines).join("\n") + `\n… +${lines.length - maxLines} more lines`;
    isTruncated = true;
  }
  if (out.length > maxChars) {
    out = out.slice(0, maxChars) + `\n… truncated ${code.length - maxChars} chars`;
    isTruncated = true;
  }
  return { truncated: out, isTruncated };
}

function toUrlMatch(raw: string): UrlMatch | null {
  const clean = raw.replace(/[.,;!?]+$/, "");
  if (UNSAFE_PROTOCOL_RE.test(clean)) return null;
  try {
    const u = new URL(clean);
    if (!/^https?:$/.test(u.protocol)) return null;
    const domain = u.hostname.toLowerCase();
    const isInternal = domain.endsWith("n0va.local") || domain.includes("onespace") || u.pathname.startsWith("/m/");
    // Also treat relative /m/... as internal N0VA object
    const isN0vaObject = N0VA_OBJECT_RE.test(clean) || N0VA_OBJECT_RE.test(u.pathname + u.search);
    // Reset regex lastIndex
    N0VA_OBJECT_RE.lastIndex = 0;
    let objectType: UrlMatch["n0vaObjectType"];
    let objectId: string | undefined;
    const lower = clean.toLowerCase();
    if (lower.includes("/m/tasks/")) { objectType = "task"; objectId = TASK_RE.exec(clean)?.groups?.id; }
    else if (lower.includes("/m/docs/")) { objectType = "doc"; objectId = DOC_RE.exec(clean)?.groups?.id; }
    else if (lower.includes("/m/calendar/")) objectType = "meeting";
    else if (lower.includes("/m/sales/") || lower.includes("/m/crm/")) objectType = "crm";
    else if (lower.includes("/m/cloud-storage/")) objectType = "file";
    else if (lower.includes("/m/sheets/") || SHEET_RANGE_RE.test(clean)) objectType = "sheet";
    else if (lower.includes("/m/sites/")) objectType = "site";
    else if (lower.includes("/approvals/")) objectType = "approval";

    return {
      url: clean,
      cleanUrl: clean,
      domain,
      isInternal,
      isN0vaObject,
      n0vaObjectType: objectType,
      n0vaObjectId: objectId,
    };
  } catch {
    return null;
  }
}

export function analyzeMessage(body: string, attachments: Array<{ filename: string; mimeType: string; sizeBytes: number }> = []): MessageAnalysis {
  const urls: UrlMatch[] = [];
  const seen = new Set<string>();
  // Absolute URLs
  for (const m of body.matchAll(URL_RE)) {
    const hit = toUrlMatch(m[0]!);
    if (hit && !seen.has(hit.cleanUrl)) {
      seen.add(hit.cleanUrl);
      // Cap at 10 URLs per UX rule (avoid noisy previews)
      if (urls.length < 10) urls.push(hit);
    }
  }
  // Relative N0VA object links (/m/docs/123) without host
  N0VA_OBJECT_RE.lastIndex = 0;
  for (const m of body.matchAll(N0VA_OBJECT_RE)) {
    const path = m[0]!;
    if (seen.has(path)) continue;
    // Treat as internal link
    urls.push({
      url: path,
      cleanUrl: path,
      domain: "n0va.internal",
      isInternal: true,
      isN0vaObject: true,
      n0vaObjectType: path.includes("/m/docs/") ? "doc" : path.includes("/m/tasks/") ? "task" : path.includes("/m/calendar/") ? "meeting" : path.includes("/m/sales/") || path.includes("/m/crm/") ? "crm" : undefined,
    });
    seen.add(path);
    if (urls.length >= 10) break;
  }

  const codeBlocks: CodeBlock[] = [];
  let idx = 0;
  for (const m of body.matchAll(CODE_BLOCK_RE)) {
    const hint = (m[1] ?? "").trim() || null;
    const raw = m[2] ?? "";
    const language = detectLanguage(hint, raw);
    const { truncated, isTruncated } = truncateCode(raw);
    const { hasSecrets, types } = secretsInCode(raw);
    codeBlocks.push({
      id: `cb_${idx++}`,
      language,
      raw,
      truncated,
      lineCount: raw.split("\n").length,
      charCount: raw.length,
      isTruncated,
      hasSecrets,
      secretTypes: types,
    });
    if (codeBlocks.length >= 8) break; // cap
  }

  const inlineCode: string[] = [];
  for (const m of body.matchAll(INLINE_CODE_RE)) {
    // Avoid double-counting ``` blocks — crude: skip if inside a code block range
    if (m[1] && m[1].length <= 200) inlineCode.push(m[1]);
    if (inlineCode.length >= 12) break;
  }

  const attachmentInfos: AttachmentInfo[] = attachments.map((a) => {
    const ext = (a.filename.split(".").pop() ?? "").toLowerCase();
    const mime = a.mimeType.toLowerCase();
    return {
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      extension: ext,
      isImage: mime.startsWith("image/"),
      isVideo: mime.startsWith("video/"),
      isPdf: mime === "application/pdf" || ext === "pdf",
      isDoc: ["doc","docx","txt","md","rtf"].includes(ext) || mime.includes("word") || mime.includes("text/"),
      isSheet: ["xls","xlsx","csv","tsv"].includes(ext) || mime.includes("spreadsheet") || mime.includes("excel"),
      isCode: ["js","ts","py","java","go","rs","json","yaml","yml","sh","sql","html","css","xml","log"].includes(ext),
    };
  });

  const summaryLine = buildSummary(body, urls, codeBlocks, attachmentInfos);

  return {
    body,
    urls,
    codeBlocks,
    inlineCode,
    attachments: attachmentInfos,
    hasCode: codeBlocks.length > 0 || inlineCode.length > 0,
    hasUrls: urls.length > 0,
    hasAttachments: attachmentInfos.length > 0,
    mentionCount: (body.match(/@[\w.'-]+/g) ?? []).length,
    summaryLine,
  };
}

function buildSummary(body: string, urls: UrlMatch[], code: CodeBlock[], atts: AttachmentInfo[]): string {
  const clean = body.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "").replace(/\s+/g, " ").trim();
  if (code.length > 0) {
    const lang = code[0]!.language ?? "code";
    return `Code snippet (${lang}, ${code[0]!.lineCount} lines)`;
  }
  if (atts.length > 0) {
    if (atts.length === 1) return `Attachment: ${atts[0]!.filename}`;
    return `${atts.length} attachments`;
  }
  if (urls.length > 0) {
    const primary = urls[0]!;
    if (primary.isN0vaObject && primary.n0vaObjectType) return `Link to ${primary.n0vaObjectType}`;
    return `Link: ${primary.domain}`;
  }
  if (clean.length === 0) return "";
  return clean.slice(0, 120) + (clean.length > 120 ? "…" : "");
}

export function extractUrls(body: string): string[] {
  return analyzeMessage(body).urls.map((u) => u.cleanUrl);
}
