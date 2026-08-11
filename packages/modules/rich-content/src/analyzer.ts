export interface ParsedMessage {
  raw: string;
  urls: ParsedUrl[];
  codeBlocks: ParsedCodeBlock[];
  attachments: ParsedAttachment[];
  mentions: ParsedMention[];
  widgets: ParsedWidget[];
  hasSecrets: boolean;
}

export interface ParsedUrl {
  url: string;
  domain: string;
  startIndex: number;
  endIndex: number;
  type: "web" | "n0va_object" | "github" | "jira" | "file";
  objectId?: string;
  objectType?: string;
}

export interface ParsedCodeBlock {
  language: string;
  code: string;
  startIndex: number;
  endIndex: number;
  isInline: boolean;
  lineCount: number;
  hasSecrets: boolean;
}

export interface ParsedAttachment {
  filename: string;
  mimeType: string;
  reference: string;
}

export interface ParsedMention {
  username: string;
  startIndex: number;
  endIndex: number;
}

export interface ParsedWidget {
  type: "poll" | "task" | "approval" | "calendar" | "crm" | "ticket" | "digest";
  data: Record<string, unknown>;
}

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
const CODE_BLOCK_REGEX = /```(\w*)\n?([\s\S]*?)```/g;
const INLINE_CODE_REGEX = /`([^`]+)`/g;
const MENTION_REGEX = /@([a-zA-Z0-9_]+)/g;
const N0VA_OBJECT_REGEX = /n0va:\/\/(doc|task|meeting|approval|crm|ticket)\/([a-zA-Z0-9-]+)/gi;
const GITHUB_REGEX = /https?:\/\/(www\.)?github\.com\/([^/]+)\/([^/\s]+)\/(issues|pull)\/(\d+)/i;
const JIRA_REGEX = /https?:\/\/([^.]+)\.atlassian\.net\/browse\/([A-Z]+-\d+)/i;

const SECRET_PATTERNS = [
  /api[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9]{16,}/i,
  /token\s*[:=]\s*['"]?[a-zA-Z0-9]{16,}/i,
  /password\s*[:=]\s*['"]?\S{8,}/i,
  /secret\s*[:=]\s*['"]?[a-zA-Z0-9]{16,}/i,
  /Bearer\s+[a-zA-Z0-9._-]{20,}/i,
  /sk-[a-zA-Z0-9]{20,}/i,
];

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
  css: "css", html: "html", json: "json", yaml: "yaml", yml: "yaml",
  md: "markdown", sql: "sql", sh: "shell", bash: "shell",
};

export function analyzeMessage(raw: string): ParsedMessage {
  const urls = extractUrls(raw);
  const codeBlocks = extractCodeBlocks(raw);
  const mentions = extractMentions(raw);
  const hasSecrets = detectSecrets(raw, codeBlocks);

  return {
    raw,
    urls,
    codeBlocks,
    attachments: [],
    mentions,
    widgets: [],
    hasSecrets,
  };
}

function extractUrls(text: string): ParsedUrl[] {
  const urls: ParsedUrl[] = [];
  let match: RegExpExecArray | null;

  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(text)) !== null) {
    const url = match[0];
    try {
      const parsed = new URL(url);
      const domain = parsed.hostname.replace(/^www\./, "");

      let type: ParsedUrl["type"] = "web";
      let objectId: string | undefined;
      let objectType: string | undefined;

      const githubMatch = url.match(GITHUB_REGEX);
      if (githubMatch) {
        type = "github";
        objectId = githubMatch[5];
        objectType = githubMatch[4];
      }

      const jiraMatch = url.match(JIRA_REGEX);
      if (jiraMatch) {
        type = "jira";
        objectId = jiraMatch[2];
      }

      if (domain === "n0va.ai" || domain.endsWith(".n0va.ai")) {
        const objMatch = url.match(N0VA_OBJECT_REGEX);
        if (objMatch) {
          type = "n0va_object";
          objectId = objMatch[0][1];
          objectType = objMatch[0][0] as string;
        }
      }

      urls.push({ url, domain, startIndex: match.index, endIndex: match.index + url.length, type, objectId, objectType });
    } catch { /* invalid URL */ }
    if (match.index === URL_REGEX.lastIndex) URL_REGEX.lastIndex++;
  }

  return urls;
}

function extractCodeBlocks(text: string): ParsedCodeBlock[] {
  const blocks: ParsedCodeBlock[] = [];
  let match: RegExpExecArray | null;

  CODE_BLOCK_REGEX.lastIndex = 0;
  while ((match = CODE_BLOCK_REGEX.exec(text)) !== null) {
    const language = (match[1] || detectLanguage(match[2] || "")).toLowerCase();
    blocks.push({
      language,
      code: match[2] || "",
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      isInline: false,
      lineCount: (match[2] || "").split("\n").length,
      hasSecrets: SECRET_PATTERNS.some(p => p.test(match![2] || "")),
    });
  }

  INLINE_CODE_REGEX.lastIndex = 0;
  while ((match = INLINE_CODE_REGEX.exec(text)) !== null) {
    if (match[1] == null) continue;
    if (blocks.some(b => match!.index >= b.startIndex && match!.index <= b.endIndex)) continue;
    blocks.push({
      language: detectLanguage(match[1]),
      code: match[1],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      isInline: true,
      lineCount: 1,
      hasSecrets: false,
    });
  }

  return blocks;
}

function extractMentions(text: string): ParsedMention[] {
  const mentions: ParsedMention[] = [];
  let match: RegExpExecArray | null;

  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    mentions.push({ username: match[1]!, startIndex: match.index, endIndex: match.index + match[0].length });
  }

  return mentions;
}

export function detectSecrets(text: string, blocks: ParsedCodeBlock[]): boolean {
  if (SECRET_PATTERNS.some(p => p.test(text))) return true;
  return blocks.some(b => b.hasSecrets);
}

function detectLanguage(code: string): string {
  if (/^(import|export|const|let|function|class|interface|type)\s/m.test(code)) return "typescript";
  if (/^(def |class |import |from |if __name__)/m.test(code)) return "python";
  if (/^(func |package |import |type |struct )/m.test(code)) return "go";
  if (/^(fn |let |mut |impl |struct |enum )/m.test(code)) return "rust";
  if (/^(public |private |class |interface |import )/m.test(code)) return "java";
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\s/i.test(code)) return "sql";
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\s/i.test(code)) return "sql";
  if (/^(\$|#)\s/m.test(code)) return "shell";
  if (/^[{\[]/.test(code.trim())) return "json";
  if (/^(---|\w+:\s)/m.test(code)) return "yaml";
  return "text";
}

export function getLanguageFromExtension(ext: string): string {
  return LANGUAGE_EXTENSIONS[ext.toLowerCase()] ?? "text";
}

export function sanitizeCode(code: string): string {
  return code
    .replace(/api[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9]{16,}/g, "***REDACTED_API_KEY***")
    .replace(/token\s*[:=]\s*['"]?[a-zA-Z0-9]{16,}/g, "***REDACTED_TOKEN***")
    .replace(/Bearer\s+[a-zA-Z0-9._-]{20,}/g, "Bearer ***REDACTED***")
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "sk-***REDACTED***");
}

export function truncateCode(code: string, maxLines = 50): string {
  const lines = code.split("\n");
  if (lines.length <= maxLines) return code;
  return lines.slice(0, maxLines).join("\n") + `\n... (${lines.length - maxLines} more lines)`;
}
