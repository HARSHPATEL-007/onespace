/**
 * N0VA1O Bulk Import and Export — integration layer (spec §3.3).
 *
 * Large imports/exports support chunking, resumable transfer, retry backoff,
 * and per-record failure reporting. Provides progress indicators and post-run
 * reconciliation summaries.
 */

export interface BulkRecord {
  id: string;
  data: Record<string, unknown>;
}

export interface RecordResult {
  recordId: string;
  status: "success" | "failed" | "skipped";
  error?: string;
  attempts: number;
}

export interface BulkProgress {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  percentComplete: number;
  lastProcessedId: string | null;
}

export interface BulkSummary {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  durationMs: number;
  failures: RecordResult[];
}

export interface BulkOptions {
  chunkSize?: number;
  maxRetries?: number;
  backoffMs?: number;
  /** Starting offset for resumable transfers. */
  resumeAfterId?: string | null;
}

const DEFAULTS: Required<BulkOptions> = {
  chunkSize: 100,
  maxRetries: 3,
  backoffMs: 500,
  resumeAfterId: null,
};

/**
 * Process records in chunks with retry and backoff. Pure orchestration logic —
 * the caller supplies the per-record processor and a sleep function.
 */
export async function bulkProcess(opts: {
  records: BulkRecord[];
  process: (record: BulkRecord) => Promise<void>;
  onProgress?: (progress: BulkProgress) => void;
  options?: BulkOptions;
  sleep?: (ms: number) => Promise<void>;
}): Promise<BulkSummary> {
  const options = { ...DEFAULTS, ...opts.options };
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const start = Date.now();

  // Resume support: skip records up to and including resumeAfterId.
  let records = opts.records;
  if (options.resumeAfterId) {
    const idx = records.findIndex((r) => r.id === options.resumeAfterId);
    if (idx >= 0) records = records.slice(idx + 1);
  }

  const results: RecordResult[] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  let lastId: string | null = null;

  const total = records.length;
  for (let i = 0; i < total; i += options.chunkSize) {
    const chunk = records.slice(i, i + options.chunkSize);
    for (const record of chunk) {
      const result = await processWithRetry(record, opts.process, options.maxRetries, options.backoffMs, sleep);
      results.push(result);
      if (result.status === "success") succeeded++;
      else if (result.status === "failed") failed++;
      else skipped++;
      lastId = record.id;
    }
    opts.onProgress?.({
      total,
      processed: succeeded + failed + skipped,
      succeeded,
      failed,
      skipped,
      percentComplete: Math.round(((succeeded + failed + skipped) / total) * 100),
      lastProcessedId: lastId,
    });
  }

  return {
    total,
    succeeded,
    failed,
    skipped,
    durationMs: Date.now() - start,
    failures: results.filter((r) => r.status === "failed"),
  };
}

async function processWithRetry(
  record: BulkRecord,
  process: (record: BulkRecord) => Promise<void>,
  maxRetries: number,
  backoffMs: number,
  sleep: (ms: number) => Promise<void>,
): Promise<RecordResult> {
  let attempts = 0;
  let lastError: string | undefined;
  while (attempts <= maxRetries) {
    attempts++;
    try {
      await process(record);
      return { recordId: record.id, status: "success", attempts };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Unknown error";
      if (attempts <= maxRetries) {
        await sleep(Math.min(backoffMs * 2 ** attempts, 30_000));
      }
    }
  }
  return { recordId: record.id, status: "failed", error: lastError, attempts };
}

/** Split a large record set into fixed-size chunks. */
export function chunkRecords(records: BulkRecord[], chunkSize: number): BulkRecord[][] {
  const chunks: BulkRecord[][] = [];
  for (let i = 0; i < records.length; i += chunkSize) {
    chunks.push(records.slice(i, i + chunkSize));
  }
  return chunks;
}
