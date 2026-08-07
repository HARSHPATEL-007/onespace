/**
 * N0VA1O Streaming File Views — sandbox layer (spec §5.3).
 *
 * Large outputs are accessible through chunked previews, content search, and
 * type-aware rendering. The platform avoids loading full payloads into model
 * context when a lightweight pointer or partial read is sufficient.
 */

export type ContentCategory = "text" | "csv" | "json" | "binary" | "image" | "log";

export interface FilePointer {
  fileId: string;
  path: string;
  sizeBytes: number;
  contentType: ContentCategory;
  /** Lightweight summary injected into LLM context instead of full content. */
  preview: string;
}

export interface ChunkResult {
  chunkIndex: number;
  totalChunks: number;
  content: string;
  byteOffset: number;
  byteLength: number;
}

export interface SearchResult {
  line: number;
  column: number;
  match: string;
  context: string;
}

export interface PreviewOptions {
  maxChars?: number;
  headLines?: number;
  tailLines?: number;
}

const DEFAULT_PREVIEW: PreviewOptions = { maxChars: 500, headLines: 20 };

/** Categorize content by content-type string. */
export function categorize(contentType: string): ContentCategory {
  if (contentType.includes("csv") || contentType.includes("spreadsheet")) return "csv";
  if (contentType.includes("json")) return "json";
  if (contentType.includes("image")) return "image";
  if (contentType.includes("text") || contentType.includes("log")) return "text";
  return "binary";
}

/**
 * Build a lightweight file pointer with a preview suitable for LLM context.
 * Avoids loading the full payload.
 */
export function buildPointer(opts: {
  fileId: string;
  path: string;
  sizeBytes: number;
  contentType: string;
  rawContent?: string;
  previewOpts?: PreviewOptions;
}): FilePointer {
  const category = categorize(opts.contentType);
  const preview = opts.rawContent ? generatePreview(opts.rawContent, category, opts.previewOpts) : `<${category} file, ${opts.sizeBytes} bytes>`;
  return { fileId: opts.fileId, path: opts.path, sizeBytes: opts.sizeBytes, contentType: category, preview };
}

function generatePreview(content: string, category: ContentCategory, opts?: PreviewOptions): string {
  const o = { ...DEFAULT_PREVIEW, ...opts };
  if (category === "json") {
    try {
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed, null, 2).slice(0, o.maxChars);
    } catch {
      return content.slice(0, o.maxChars);
    }
  }
  if (category === "csv") {
    const lines = content.split("\n").slice(0, o.headLines ?? 20);
    return lines.join("\n") + (content.split("\n").length > (o.headLines ?? 20) ? `\n... (${content.split("\n").length - (o.headLines ?? 20)} more rows)` : "");
  }
  return content.slice(0, o.maxChars ?? 500);
}

/**
 * Read a chunk of a file. Avoids loading the entire content into context.
 */
export function readChunk(content: string, chunkIndex: number, chunkSize: number): ChunkResult {
  const totalChunks = Math.ceil(content.length / chunkSize);
  const byteOffset = chunkIndex * chunkSize;
  const slice = content.slice(byteOffset, byteOffset + chunkSize);
  return { chunkIndex, totalChunks, content: slice, byteOffset, byteLength: slice.length };
}

/**
 * Search file content for a pattern. Returns matching lines with context.
 */
export function searchContent(content: string, pattern: string, contextLines: number = 2): SearchResult[] {
  const lines = content.split("\n");
  const results: SearchResult[] = [];
  const regex = new RegExp(escapeRegex(pattern), "gi");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const match = line.match(regex);
    if (match) {
      results.push({
        line: i + 1,
        column: (line.toLowerCase().indexOf(pattern.toLowerCase())) + 1,
        match: match[0],
        context: lines.slice(Math.max(0, i - contextLines), i + contextLines + 1).join("\n"),
      });
    }
  }
  return results;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
