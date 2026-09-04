"use client";

import { useState } from "react";
import type { EvidenceCard, QueryPlan } from "./hybrid-retrieval";
import { EvidenceResultsList, PersonalizationControls, QueryPlanView } from "./retrieval-ui";

export interface WorkbenchQueryResult {
  query_id: string;
  plan: QueryPlan;
  results: EvidenceCard[];
  graph_paths: { nodes: string[]; relations: string[]; reason: string; evidence: string; confidence: number }[];
  temporal_comparisons: { document_id: string; oldStatus: string; newStatus: string; changed: boolean; summary: string; oldExcerpt: string; newExcerpt: string }[];
  federated_unavailable: string[];
  refused: boolean;
  refusal: string | null;
}

export interface WorkbenchActions {
  plan: (query: string) => Promise<QueryPlan>;
  query: (input: unknown) => Promise<WorkbenchQueryResult>;
  feedback: (queryId: string, unitId: string, verdict: "correct" | "incorrect", note?: string) => Promise<unknown>;
}

/**
 * N0VA BOOKLM EDUCATION — Hybrid Retrieval workbench.
 *
 * Query-planning + evidence-ranking surface: interpreted intent (correctable),
 * personalization controls (never silent), evidence cards with every action,
 * graph paths, temporal comparisons, and a broader-results fallback.
 */
export function RetrievalWorkbench({ setId, actions }: { setId: string; actions: WorkbenchActions }) {
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState<QueryPlan | null>(null);
  const [result, setResult] = useState<WorkbenchQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [personalization, setPersonalization] = useState({
    useCourseContext: true,
    useStudyHistory: false,
    useSavedSources: false,
    searchGlobally: false,
  });

  async function run(overrideQuery?: string, broader = false) {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const [p, r] = await Promise.all([
        actions.plan(q),
        actions.query({
          query: q,
          scope: { setId },
          modalities: ["text", "table", "image", "video"],
          filters: { status: "approved" },
          personalization: {
            use_course_context: personalization.useCourseContext,
            use_study_history: personalization.useStudyHistory,
            use_saved_sources: personalization.useSavedSources,
          },
          federated: { enabled: broader || personalization.searchGlobally, repositories: [] },
          require_citations: true,
          limit: 10,
        }),
      ]);
      setPlan(p);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retrieval failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section data-testid="retrieval-workbench" style={{ marginTop: 24 }}>
      <h3>Hybrid retrieval</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <input
          aria-label="Retrieval query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask across text, tables, figures, lectures, code…"
          style={{ width: "min(640px, 100%)" }}
        />
        <button type="submit" disabled={loading || !query.trim()}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <PersonalizationControls value={personalization} onChange={setPersonalization} />
      {plan && (
        <div style={{ marginTop: 12 }}>
          <QueryPlanView plan={plan} />
          {plan.ambiguity && (
            <div>
              {plan.ambiguity.actions.map((a) => (
                <button key={a} onClick={() => void run(`${query} (${a})`)}>
                  {a}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {result && (
        <div style={{ marginTop: 12 }}>
          <EvidenceResultsList
            cards={result.results}
            query={query}
            unavailable={result.federated_unavailable}
            actions={{
              reportIncorrect: (card) => {
                void actions.feedback(result.query_id, card.citation.id || card.title, "incorrect", "Reported from workbench");
              },
            }}
            onSearchBroader={(q) => void run(q, true)}
          />
          {result.graph_paths.length > 0 && (
            <div data-testid="graph-paths">
              <h4>Knowledge-graph paths</h4>
              <ul>
                {result.graph_paths.map((g, i) => (
                  <li key={i}>
                    {g.nodes.join(" → ")} — {g.reason} (confidence {g.confidence})
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.temporal_comparisons.length > 0 && (
            <div data-testid="temporal-comparisons">
              <h4>What changed</h4>
              <ul>
                {result.temporal_comparisons.map((t, i) => (
                  <li key={i}>
                    {t.summary} Was: “{t.oldExcerpt.slice(0, 140)}” → Now: “{t.newExcerpt.slice(0, 140)}”
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
