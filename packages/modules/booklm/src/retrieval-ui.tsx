import type { EvidenceCard, QueryPlan } from "./hybrid-retrieval";

export interface RetrievalUiActions {
  openSource?: (citationId: string) => void;
  addCitation?: (card: EvidenceCard) => void;
  compareVersions?: (card: EvidenceCard) => void;
  showRelated?: (card: EvidenceCard) => void;
  traversePrereqs?: (card: EvidenceCard) => void;
  findSimpler?: (card: EvidenceCard) => void;
  findDiagram?: (card: EvidenceCard) => void;
  findTimestamp?: (card: EvidenceCard) => void;
  findPractice?: (card: EvidenceCard) => void;
  searchBroader?: (query: string) => void;
  reportIncorrect?: (card: EvidenceCard) => void;
  resolveAmbiguity?: (choice: string) => void;
}

export function QueryPlanView({ plan }: { plan: QueryPlan }) {
  return (
    <div data-testid="query-plan">
      <div>
        <strong>Interpreted as:</strong> {plan.interpretedAs} ({Math.round(plan.confidence * 100)}%)
      </div>
      <div>Primary: {plan.primary.join(" + ")} | Fan-out: {plan.parallel.join(", ")}</div>
      {plan.ambiguity && (
        <div data-testid="ambiguity-prompt">
          <p>
            I found {plan.ambiguity.options.length} meanings for &ldquo;{plan.ambiguity.term}&rdquo;:
          </p>
          <ul>
            {plan.ambiguity.options.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
          <p>Search both, or pick one — history never decides silently.</p>
        </div>
      )}
    </div>
  );
}

const VALIDITY_TONE: Record<string, string> = {
  current: "nv-badge-ok",
  historical: "nv-badge-muted",
  superseded: "nv-badge-stale",
  "future-effective": "nv-badge-warn",
  "date-unknown": "nv-badge-warn",
  "conflicting-validity": "nv-badge-bad",
};

export function ValidityBadge({ validity }: { validity: EvidenceCard["validity"] }) {
  return (
    <span data-testid="validity-badge" className={VALIDITY_TONE[validity] ?? "nv-badge-muted"}>
      Validity: {validity}
    </span>
  );
}

export function EvidenceCardView({ card, actions }: { card: EvidenceCard; actions?: RetrievalUiActions }) {
  return (
    <article data-testid="evidence-card">
      <h4>{card.title}</h4>
      <p>
        {card.source} · {card.location} · Rights: {card.rights}
      </p>
      <p>
        <ValidityBadge validity={card.validity} /> · Score: {card.score.toFixed(3)} · Citation: {card.citation.id || "—"}
      </p>
      <p>Match: {card.match}</p>
      <blockquote>{card.evidence}</blockquote>
      <ul>
        {card.why.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      <p>Related: {card.relatedConcepts.join(", ") || "—"}</p>
      <p>Contradictions: {card.contradictions}</p>
      <p>Accessibility: {card.accessibility.join(", ") || "—"}</p>
      <div>
        <button onClick={() => actions?.openSource?.(card.citation.id)}>Open source location</button>
        <button onClick={() => actions?.addCitation?.(card)}>Add citation</button>
        <button onClick={() => actions?.compareVersions?.(card)}>Compare versions</button>
        <button onClick={() => actions?.showRelated?.(card)}>Show related concepts</button>
        <button onClick={() => actions?.traversePrereqs?.(card)}>Traverse prerequisites</button>
        <button onClick={() => actions?.findSimpler?.(card)}>Find simpler explanation</button>
        <button onClick={() => actions?.findDiagram?.(card)}>Find diagram</button>
        <button onClick={() => actions?.findTimestamp?.(card)}>Find lecture timestamp</button>
        <button onClick={() => actions?.findPractice?.(card)}>Find practice questions</button>
        <button onClick={() => actions?.reportIncorrect?.(card)}>Report incorrect</button>
      </div>
    </article>
  );
}

export function EvidenceResultsList({
  cards,
  query,
  unavailable,
  actions,
  onSearchBroader,
}: {
  cards: EvidenceCard[];
  query: string;
  unavailable?: string[];
  actions?: RetrievalUiActions;
  onSearchBroader?: (query: string) => void;
}) {
  if (cards.length === 0) {
    return (
      <div data-testid="no-evidence">
        <p>I found related material, but not enough approved evidence to support a definite answer.</p>
        <button onClick={() => (onSearchBroader ?? actions?.searchBroader)?.(query)}>Search broader repositories</button>
      </div>
    );
  }
  return (
    <div data-testid="evidence-results">
      {cards.map((c, i) => (
        <EvidenceCardView key={`${c.citation.id || c.title}-${i}`} card={c} actions={actions} />
      ))}
      {unavailable && unavailable.length > 0 && (
        <p data-testid="federated-gap">Not searched (unavailable): {unavailable.join(", ")} — coverage is partial.</p>
      )}
    </div>
  );
}

export function PersonalizationControls({
  value, onChange,
}: {
  value: { useCourseContext: boolean; useStudyHistory: boolean; useSavedSources: boolean; searchGlobally: boolean };
  onChange: (v: { useCourseContext: boolean; useStudyHistory: boolean; useSavedSources: boolean; searchGlobally: boolean }) => void;
}) {
  const toggle = (k: keyof typeof value) => onChange({ ...value, [k]: !value[k] });
  return (
    <fieldset data-testid="personalization-controls">
      <legend>Personalization (never silent)</legend>
      <label><input type="checkbox" checked={value.useCourseContext} onChange={() => toggle("useCourseContext")} /> Use my course context</label>
      <label><input type="checkbox" checked={value.useStudyHistory} onChange={() => toggle("useStudyHistory")} /> Use my recent study history</label>
      <label><input type="checkbox" checked={value.useSavedSources} onChange={() => toggle("useSavedSources")} /> Use my saved sources</label>
      <label><input type="checkbox" checked={value.searchGlobally} onChange={() => toggle("searchGlobally")} /> Search globally</label>
      <button onClick={() => onChange({ useCourseContext: true, useStudyHistory: false, useSavedSources: false, searchGlobally: false })}>Reset personalization</button>
      <p>Why did I see this result? — every boosted card carries its reason.</p>
    </fieldset>
  );
}
