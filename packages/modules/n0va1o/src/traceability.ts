/**
 * N0VA1O Traceability Matrix — deeper enhancements (spec §2).
 *
 * Traces requirements to architecture, implementation, and test coverage to
 * prevent feature drift across modules and simplify audits.
 */

export type ArtifactType = "requirement" | "architecture" | "implementation" | "test";

export interface TraceabilityEntry {
  id: string;
  requirement: string;
  description: string;
  architectureRef: string;
  implementationRef: string;
  testRef: string;
  status: "covered" | "partial" | "missing";
}

export interface TraceabilityMatrix {
  entries: TraceabilityEntry[];
}

/**
 * Build a traceability matrix from entries. Computes coverage status
 * automatically from populated references.
 */
export function buildMatrix(entries: Omit<TraceabilityEntry, "status">[]): TraceabilityMatrix {
  const mapped: TraceabilityEntry[] = entries.map((e) => {
    const refs = [e.architectureRef, e.implementationRef, e.testRef].filter(Boolean);
    const status: TraceabilityEntry["status"] = refs.length === 3 ? "covered" : refs.length > 0 ? "partial" : "missing";
    return { ...e, status };
  });
  return { entries: mapped };
}

/** Find entries with missing implementation or test coverage. */
export function findGaps(matrix: TraceabilityMatrix): TraceabilityEntry[] {
  return matrix.entries.filter((e) => e.status !== "covered");
}

/** Coverage summary counts. */
export function coverageSummary(matrix: TraceabilityMatrix): { covered: number; partial: number; missing: number; total: number } {
  const summary = { covered: 0, partial: 0, missing: 0, total: matrix.entries.length };
  for (const e of matrix.entries) summary[e.status]++;
  return summary;
}
