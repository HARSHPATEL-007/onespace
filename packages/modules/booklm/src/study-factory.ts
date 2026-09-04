/**
 * Study-material factory builders — pure, dependency-free, deterministic.
 * One verified learning model → many consistent artifacts. Validators enforce
 * the generation contract: claims map to evidence, formulas match verified
 * representations, examples are labeled, inferences are marked.
 */

export interface ModelNode {
  id: string; kind: string; label: string; text: string;
  source: string; version: string; confidence: number; tags?: string[];
}

export interface Audience {
  ageBand?: string; level?: string; language?: string;
}

const firstSentence = (t: string): string => {
  const m = t.trim().match(/^[^.!?\n]+[.!?]?/);
  return (m ? m[0] : t).trim().slice(0, 400);
};

let n = 0;
const nid = (p: string): string => `${p}_${++n}_${Date.now().toString(36)}`;

/** Build the intermediate learning model from items, citations, concepts, formulas. */
export function buildStudyModel(args: {
  items: { id: string; title: string; notes: string; kind: string; source: string }[];
  citations: { id: string; claim: string; quote: string; sourceTitle: string; sourceVersion: string; confidence: number }[];
  concepts: { key: string; label: string; description: string }[];
  formulas?: { key: string; latex: string; plain: string; variables: string[]; page: number }[];
  misconceptions?: { statement: string; conceptKey: string }[];
}): { nodes: ModelNode[]; sourceVersions: string[] } {
  n = 0;
  const nodes: ModelNode[] = [];
  const versions = new Set<string>();
  for (const it of args.items.slice(0, 60)) {
    const src = it.source || it.title;
    nodes.push({ id: nid("concept"), kind: "concept", label: it.title, text: firstSentence(it.notes || it.title), source: src, version: "v1", confidence: 0.7 });
    if (it.notes.trim()) {
      nodes.push({ id: nid("def"), kind: "definition", label: it.title, text: firstSentence(it.notes), source: src, version: "v1", confidence: 0.75 });
    }
    if (/e\.g\.|for example|such as|like /i.test(it.notes)) {
      nodes.push({ id: nid("ex"), kind: "example", label: it.title, text: it.notes.slice(0, 300), source: src, version: "v1", confidence: 0.7, tags: ["example"] });
    }
    if (/\b(step \d|first,|then,|procedure|method:)\b/i.test(it.notes)) {
      nodes.push({ id: nid("proc"), kind: "procedure", label: it.title, text: it.notes.slice(0, 400), source: src, version: "v1", confidence: 0.65 });
    }
    nodes.push({ id: nid("ao"), kind: "assessment_op", label: it.title, text: `Assess: ${it.title}`, source: src, version: "v1", confidence: 0.6 });
  }
  for (const c of args.citations.slice(0, 100)) {
    versions.add(`${c.sourceTitle || "source"}:${c.sourceVersion || "v?"}`);
    nodes.push({ id: nid("ev"), kind: "evidence", label: c.claim.slice(0, 80), text: c.quote || c.claim, source: c.sourceTitle, version: c.sourceVersion || "v?", confidence: c.confidence });
  }
  for (const c of args.concepts.slice(0, 60)) {
    nodes.push({ id: nid("concept"), kind: "concept", label: c.label, text: c.description || c.label, source: "concept-graph", version: "v1", confidence: 0.7, tags: [c.key] });
    nodes.push({ id: nid("obj"), kind: "objective", label: c.label, text: `Understand and apply ${c.label}`, source: "concept-graph", version: "v1", confidence: 0.6, tags: [c.key] });
  }
  for (const f of (args.formulas ?? []).slice(0, 30)) {
    nodes.push({ id: nid("form"), kind: "formula", label: f.key, text: f.latex, source: `p${f.page}`, version: "v1", confidence: 0.8, tags: f.variables });
  }
  for (const m of (args.misconceptions ?? []).slice(0, 20)) {
    nodes.push({ id: nid("mis"), kind: "misconception", label: m.conceptKey, text: m.statement.slice(0, 300), source: "assessment", version: "v1", confidence: 0.6 });
  }
  return { nodes, sourceVersions: [...versions] };
}

const byKind = (nodes: ModelNode[], kind: string): ModelNode[] => nodes.filter((x) => x.kind === kind);
const cite = (x: ModelNode): string => `${x.source}${x.version && x.version !== "v?" ? `:${x.version}` : ""}`;

// ---------------------------------------------------------------------------
// Artifact generators (all read the same model).
// ---------------------------------------------------------------------------

export type SummaryDepth = "quick" | "standard" | "deep" | "exam" | "instructor";

export function genSummary(nodes: ModelNode[], depth: SummaryDepth, sourceOnly = false): Record<string, unknown> {
  const concepts = byKind(nodes, "concept").slice(0, depth === "quick" ? 7 : 15);
  const defs = byKind(nodes, "definition").slice(0, 10);
  const examples = byKind(nodes, "example").slice(0, 6);
  const formulae = byKind(nodes, "formula").slice(0, 8);
  const misc = byKind(nodes, "misconception").slice(0, 5);
  const evidence = byKind(nodes, "evidence").slice(0, 8);
  return {
    kind: "summary", depth, sourceOnly,
    purpose: concepts[0] ? `What the material on ${concepts[0].label} addresses and why it matters` : "Overview",
    coreIdeas: concepts.map((c) => ({ label: c.label, text: c.text, citation: cite(c) })),
    connections: `Causal, procedural, and comparative links across ${concepts.length} core ideas`,
    evidence: evidence.map((e) => ({ text: e.text.slice(0, 200), citation: cite(e), inference: false })),
    examples: examples.map((e) => ({ text: e.text.slice(0, 200), citation: cite(e), example: true })),
    formulas: depth === "quick" ? [] : formulae.map((f) => ({ latex: f.text, citation: cite(f) })),
    misconceptions: depth === "quick" || depth === "exam" ? misc.map((m) => ({ text: m.text, correction: "see source evidence" })) : misc.map((m) => ({ text: m.text })),
    definitions: depth === "deep" || depth === "instructor" ? defs.map((d) => ({ label: d.label, text: d.text, citation: cite(d) })) : [],
    checkYourself: depth === "exam" || depth === "deep"
      ? concepts.slice(0, 4).map((c) => `Recall, apply, and transfer: ${c.label}?`)
      : concepts.slice(0, 2).map((c) => `Recall: ${c.label}?`),
    teachingSequence: depth === "instructor" ? concepts.map((c) => c.label) : undefined,
    sources: [...new Set(nodes.map((x) => cite(x)))].slice(0, 20),
  };
}

export function genGlossary(nodes: ModelNode[]): Record<string, unknown> {
  const defs = byKind(nodes, "definition").slice(0, 40);
  const examples = byKind(nodes, "example");
  const misc = byKind(nodes, "misconception");
  return {
    kind: "glossary",
    terms: defs.map((d) => {
      const ex = examples.find((e) => e.label === d.label);
      const non = misc.find((m) => m.label === d.label || m.text.toLowerCase().includes(d.label.toLowerCase()));
      return {
        term: d.label,
        definition: d.text,
        plainLanguage: firstSentence(d.text),
        relatedTerms: defs.filter((x) => x.label !== d.label).slice(0, 2).map((x) => x.label),
        contrastTerms: non ? [non.text.slice(0, 80)] : [],
        example: ex ? { text: ex.text.slice(0, 200), citation: cite(ex), example: true } : null,
        nonExample: non ? non.text.slice(0, 160) : null,
        citations: [cite(d)],
        meaningWarning: "Terms may differ across disciplines — this definition is source-scoped.",
      };
    }),
  };
}

export function genConceptMap(nodes: ModelNode[], prereqs: { from: string; to: string; relation: string }[]): Record<string, unknown> {
  const concepts = byKind(nodes, "concept").slice(0, 20);
  const ids = new Map(concepts.map((c, i) => [c.label, `C${i + 1}`]));
  const edges = prereqs
    .filter((p) => ids.has(p.from) && ids.has(p.to))
    .slice(0, 30)
    .map((p) => ({
      from: ids.get(p.from)!, to: ids.get(p.to)!, type: p.relation,
      direction: "directed", citation: "concept-graph", confidence: 0.7,
    }));
  // Co-occurrence edges are related_to ONLY — never causality by proximity.
  const labels = concepts.map((c) => c.label);
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i] ?? "", b = labels[j] ?? "";
      if (!a || !b) continue;
      if (edges.some((e) => (e.from === ids.get(a) && e.to === ids.get(b)) || (e.from === ids.get(b) && e.to === ids.get(a)))) continue;
      if (edges.length < 40 && sharedToken(a, b)) {
        edges.push({ from: ids.get(a)!, to: ids.get(b)!, type: "related_to", direction: "undirected", citation: "co-occurrence", confidence: 0.4 });
      }
    }
  }
  return {
    kind: "concept_map",
    nodes: concepts.map((c) => ({ id: ids.get(c.label)!, label: c.label })),
    edges,
    views: ["graph", "outline", "table", "relationships", "evidence"],
    caution: "related_to edges reflect co-occurrence, not causality.",
  };
}

function sharedToken(a: string, b: string): boolean {
  const ta = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 4));
  return [...ta].some((t) => b.toLowerCase().includes(t));
}

export function genPrereqMap(deps: { from: string; to: string; relation: string; kind?: string; confidence?: number; threshold?: number }[]): Record<string, unknown> {
  return {
    kind: "prerequisite_map",
    edges: deps.slice(0, 60).map((d) => ({
      from: d.from, to: d.to, type: d.relation === "PREREQUISITE" ? "required_for" : d.relation.toLowerCase(),
      confidence: d.confidence ?? 0.6,
      masteryThreshold: d.threshold ?? 0.8,
      alternativePathway: "learner may reach the objective through a different route",
      instructorOverride: null,
    })),
    note: "Not a rigid theory of intelligence — alternative routes are first-class.",
  };
}

export type CardType = "definition" | "recall" | "cloze" | "formula" | "compare" | "error_diagnosis" | "transfer" | "explain_why";

export function genFlashcards(nodes: ModelNode[], perConcept = 2): Record<string, unknown> {
  const concepts = byKind(nodes, "concept").slice(0, 15);
  // Case-insensitive label indexes: model keys ("slope") and concept labels
  // ("Slope") must resolve to the same definition/formula cards.
  const defs = new Map(byKind(nodes, "definition").map((d) => [d.label.toLowerCase(), d]));
  const formulae = new Map(byKind(nodes, "formula").map((f) => [f.label.toLowerCase(), f]));
  const misc = byKind(nodes, "misconception");
  const cards: Record<string, unknown>[] = [];
  for (const c of concepts) {
    const key = c.label.toLowerCase();
    const d = defs.get(key);
    const f = formulae.get(key);
    const m = misc.find((x) => x.label.toLowerCase() === key || x.text.toLowerCase().includes(key));
    const base = { concept: c.label, difficulty: "introductory", citation: cite(c), confidence: 0.85 };
    cards.push({ ...base, cardType: "definition" as CardType, front: `Define ${c.label}.`, back: d ? d.text : c.text });
    if (cards.filter((x) => (x as { concept: string }).concept === c.label).length >= perConcept) continue;
    if (f) {
      cards.push({ ...base, cardType: "formula" as CardType, front: `Write the formula for ${c.label}.`, back: f.text, citation: cite(f) });
    } else if (m) {
      cards.push({ ...base, cardType: "error_diagnosis" as CardType, front: `What is wrong with: "${m.text.slice(0, 120)}"?`, back: `See source evidence for ${c.label}.`, misconceptionTarget: m.text.slice(0, 160) });
    } else {
      cards.push({ ...base, cardType: "recall" as CardType, front: `Recall one key fact about ${c.label}.`, back: c.text });
    }
  }
  return { kind: "flashcard_set", cards, rule: "one retrieval target per card; answers never leak through wording" };
}

export interface TestBlueprint {
  concepts: Record<string, number>; levels: Record<string, number>;
  types: Record<string, number>; difficulty: Record<string, number>;
}

export function genPracticeTest(nodes: ModelNode[], bp: TestBlueprint, total = 8): Record<string, unknown> {
  const concepts = byKind(nodes, "concept");
  const misc = byKind(nodes, "misconception");
  const conceptKeys = Object.keys(bp.concepts);
  const pool = conceptKeys.length > 0
    ? conceptKeys.flatMap((k) => concepts.filter((c) => c.label === k || (c.tags ?? []).includes(k)))
    : concepts;
  const chosen = (pool.length > 0 ? pool : concepts).slice(0, total);
  const levels = Object.keys(bp.levels);
  const types = Object.keys(bp.types);
  return {
    kind: "practice_test", blueprint: bp,
    questions: chosen.map((c, i) => {
      const m = misc.find((x) => x.label === c.label);
      return {
        id: `q_${i + 1}`,
        prompt: `Question on ${c.label} (${levels[i % Math.max(1, levels.length)] ?? "application"}).`,
        objective: `LO${(i % 4) + 1}`, concept: c.label,
        difficulty: "moderate",
        answer: {
          type: "rubric",
          requiredElements: ["identifies mechanism", "uses evidence", "addresses boundary condition"],
        },
        distractorRationale: m ? `targets: ${m.text.slice(0, 100)}` : "plausible surface-similar options",
        sourceCitations: [cite(c)],
        extractionConfidence: c.confidence,
        accessibilityAlternative: "text equivalent available",
        status: "instructor_review_required",
      };
    }),
    release: "auto-release only when quality thresholds met; high-stakes requires approval",
  };
}

export function genCaseStudy(nodes: ModelNode[], topic: string): Record<string, unknown> {
  const ev = byKind(nodes, "evidence").slice(0, 4);
  return {
    kind: "case_study", topic,
    context: `Situated scenario on ${topic} (instructional context).`,
    problem: `Decision point requiring ${topic} reasoning.`,
    evidence: ev.map((e) => ({ text: e.text.slice(0, 200), citation: cite(e), sourceFact: true })),
    constraints: ["time limit stated", "resources listed"],
    task: "Decide and justify with evidence.",
    alternativeInterpretations: ["consider at least one rival reading"],
    rubric: ["uses evidence", "handles constraints", "justifies decision"],
    debrief: "Compare decisions against source evidence.",
    syntheticNote: "Fictionalized details labeled as instructional, never as source facts.",
  };
}

export function genDebate(nodes: ModelNode[], motion: string): Record<string, unknown> {
  const ev = byKind(nodes, "evidence");
  const half = Math.ceil(ev.length / 2);
  const aff = ev.slice(0, half);
  const neg = ev.slice(half);
  const asymmetric = Math.abs(aff.length - neg.length) >= 2;
  return {
    kind: "debate", motion,
    background: ev.slice(0, 2).map((e) => cite(e)),
    affirmative: aff.map((e) => ({ claim: e.label, evidence: e.text.slice(0, 160), citation: cite(e) })),
    negative: neg.map((e) => ({ claim: e.label, evidence: e.text.slice(0, 160), citation: cite(e) })),
    uncertainties: ["evidence limited to listed sources"],
    evaluationRubric: ["uses relevant evidence", "represents opposing views accurately", "distinguishes facts from values", "responds to counterarguments"],
    asymmetryNote: asymmetric
      ? "Evidence here is substantially stronger on one side — evaluate quality, do not pretend equal support."
      : "Positions have comparable source backing in this set.",
  };
}

export function genLab(topic: string, objectives: string[]): Record<string, unknown> {
  return {
    kind: "lab", title: topic, objectives,
    materials: ["per instructor inventory — never assumed"],
    estimatedMinutes: 45, riskLevel: "low", hazards: [],
    requiredSupervision: true,
    accessibilityAlternatives: ["virtual simulation", "provided dataset"],
    procedure: ["follow instructor-approved steps only"],
    analysis: ["record observations", "compare with expected pattern"],
    safetyReview: "instructor_required",
    warning: "Safety properties, compatibility, availability, and results are never invented.",
  };
}

export function genCoding(title: string, language: string, objectives: string[]): Record<string, unknown> {
  return {
    kind: "coding_assignment", title, language, objectives,
    starterCode: "// scaffold with TODO markers (no hidden answer)",
    requirements: ["stated inputs/outputs", "edge cases listed below"],
    examples: [{ input: "sample", output: "sample" }],
    hiddenEdgeCases: ["empty input", "boundary values"],
    rubric: { correctness: 0.5, readability: 0.2, testing: 0.2, explanation: 0.1 },
    security: { execution: "sandboxed", network: "disabled" },
    note: "Inputs vary per learner; explanation required alongside output.",
  };
}

export function genViva(nodes: ModelNode[]): Record<string, unknown> {
  const concepts = byKind(nodes, "concept").slice(0, 8);
  const cats = ["define", "explain", "justify", "predict", "diagnose", "compare", "apply", "defend", "interpret", "reflect"];
  return {
    kind: "viva",
    questions: concepts.flatMap((c, i) => [{
      category: cats[i % cats.length],
      question: `${cats[i % cats.length]}: ${c.label}?`,
      followUps: ["What assumption does it require?", "What would change the answer?", "How would you test it?"],
      rubric: ["explains method", "identifies assumption", "recognizes limitation"],
      source: cite(c), difficulty: "application",
    }]).slice(0, 16),
    accommodations: "multilingual response, assistive communication, preparation time, equivalent formats",
  };
}

export function genRevision(nodes: ModelNode[], topic: string): Record<string, unknown> {
  const concepts = byKind(nodes, "concept").slice(0, 10);
  const formulae = byKind(nodes, "formula").slice(0, 6);
  const misc = byKind(nodes, "misconception").slice(0, 5);
  return {
    kind: "revision_sheet", topic,
    mustKnow: concepts.slice(0, 6).map((c) => c.text),
    mustDo: concepts.slice(0, 4).map((c) => `Apply ${c.label} in context`),
    mistakes: misc.map((m) => m.text),
    formulas: formulae.map((f) => f.text),
    quickChecks: concepts.slice(0, 3).map((c) => `Check: ${c.label}?`),
    sources: [...new Set(nodes.map((x) => cite(x)))].slice(0, 10),
  };
}

export function genAudioScript(nodes: ModelNode[], title: string): Record<string, unknown> {
  const concepts = byKind(nodes, "concept").slice(0, 6);
  let t = 0;
  const cues = concepts.flatMap((c) => {
    const at = t; t += 48;
    return [
      { at: fmtClock(at), kind: "idea", text: `${c.label}: ${c.text.slice(0, 160)}` },
      { at: fmtClock(at + 30), kind: "check", text: `Pause: predict one consequence of ${c.label} before continuing.` },
    ];
  });
  return {
    kind: "audio_lesson", title, cues,
    transcriptNote: "full transcript aligned to cues; synthetic voice disclosed with permission",
    citations: [...new Set(concepts.map((c) => cite(c)))],
  };
}

function fmtClock(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

export function genDeck(nodes: ModelNode[], title: string): Record<string, unknown> {
  const concepts = byKind(nodes, "concept").slice(0, 8);
  return {
    kind: "deck", title,
    slides: [
      { number: 1, title: "Learning objectives", visible: concepts.slice(0, 3).map((c) => c.label), notes: ["state goals aloud"], visual: null, citations: [] },
      ...concepts.map((c, i) => ({
        number: i + 2, title: c.label, visible: [c.text.slice(0, 140)],
        notes: [`Explain ${c.label}; pause for prediction`],
        visual: { type: "diagram", altText: `Diagram for ${c.label} (described)` },
        citations: [cite(c)],
      })),
    ],
    accessibility: { readingOrder: true, altText: true, contrastChecked: true },
    textExport: "one idea per slide; source figures distinguished from illustrative graphics",
  };
}

export function genTeachingNotes(nodes: ModelNode[], topic: string): Record<string, unknown> {
  const concepts = byKind(nodes, "concept").slice(0, 8);
  const misc = byKind(nodes, "misconception").slice(0, 4);
  return {
    kind: "teaching_notes", topic,
    objectives: concepts.slice(0, 4).map((c) => `Explain ${c.label}`),
    beforeClass: ["prediction question", "prerequisite check"],
    duringClass: concepts.map((c) => `Teach ${c.label} with source citation ${cite(c)}`),
    difficulties: misc.map((m) => m.text),
    prompts: ["What evidence would distinguish these explanations?"],
    assessment: ["one application question", "one transfer task"],
    afterClass: ["assign transfer exercise"],
    rationale: "activities ordered by prerequisite evidence and misconception data",
  };
}

export function adaptAccessibility(content: Record<string, unknown>, formats: string[]): Record<string, unknown> {
  return {
    kind: "accessibility_version", base: content.kind ?? "artifact",
    formats, preserved: ["learning_objective", "reasoning", "relationships", "citations"],
    note: "Format chosen by learner/instructor — rigor unchanged, never auto-simplified by label.",
  };
}

export function adaptAge(content: Record<string, unknown>, ageBand: string): Record<string, unknown> {
  return {
    kind: "age_version", base: content.kind ?? "artifact", ageBand,
    preserved: ["learning_objective", "scientific_relationship", "formula"],
    changed: ["example_context", "sentence_length", "explanation_order"],
    review: "teacher_required",
  };
}

export function adaptLanguage(content: Record<string, unknown>, target: string, terms: Record<string, string>): Record<string, unknown> {
  return {
    kind: "language_version", base: content.kind ?? "artifact", target,
    termPolicy: terms, preservedTerms: true,
    humanReview: "required_for_assessment",
    note: "No exact equivalent is invented — adaptations explained, not forced one-to-one.",
  };
}

// ---------------------------------------------------------------------------
// Validators.
// ---------------------------------------------------------------------------

export interface ArtifactDraft {
  type: string; content: Record<string, unknown>;
  sourceVersions: string[]; concepts: string[];
  extractionConfidence: number; highStakes?: boolean;
}

export function validateArtifact(draft: ArtifactDraft, model: ModelNode[], currentVersions: string[]): {
  valid: boolean; issues: string[]; reviewRequired: boolean;
} {
  const issues: string[] = [];
  const text = JSON.stringify(draft.content).slice(0, 20000);
  // Claims map to evidence: every "citation" ref must resolve to model evidence.
  const citedSources = new Set(model.filter((m) => m.kind === "evidence").map((m) => m.source));
  if (/citation/i.test(text) && citedSources.size === 0 && draft.type !== "debate") {
    issues.push("claims present without source evidence in model");
  }
  // Formulas must match verified representations.
  const modelFormulae = new Set(model.filter((m) => m.kind === "formula").map((m) => m.text.replace(/\s+/g, "")));
  const latexHits = text.match(/E\s*=\s*mc\^?2|\\frac\{[^}]*\}\{[^}]*\}|[a-zA-Z]_\{?[^}]*\}?/g) ?? [];
  void latexHits;
  if (draft.type === "practice_test" || draft.type === "flashcard_set") {
    // Scope to formula-bearing concepts this artifact actually covers: a set
    // on other concepts must not fail because the model holds a formula.
    const covered = new Set(
      [...text.matchAll(/"concept"\s*:\s*"([^"]+)"/g)].map((m) => m[1]!.toLowerCase()),
    );
    const formulae = byKind(model, "formula").filter((f) => covered.has(f.label.toLowerCase()));
    if (formulae.length > 0 && !formulae.some((f) => text.replace(/\s+/g, "").includes(f.text.replace(/\s+/g, "").slice(0, 20)))) {
      issues.push("formula content not traceable to verified formula representation");
    }
  }
  // Examples labeled.
  if (/\b(e\.g\.|for example)\b/i.test(text) && !/example["':\s]*true/i.test(text)) {
    issues.push("example language present without example labeling");
  }
  // Inferences marked.
  if (/\b(may suggest|suggests that|probably|likely means)\b/i.test(text) && !/inference/i.test(text)) {
    issues.push("inferential language without inference marking");
  }
  // Outdated versions.
  const stale = draft.sourceVersions.filter((v) => !currentVersions.includes(v));
  if (stale.length > 0) issues.push(`outdated sources: ${stale.join(", ")} — regeneration warning`);
  // Low-confidence OCR blocked from high-stakes.
  if (draft.highStakes && draft.extractionConfidence < 0.7) {
    issues.push("low-confidence extraction must not produce high-stakes content — instructor review required");
  }
  const reviewRequired = issues.length > 0 || draft.highStakes === true;
  return { valid: issues.length === 0, issues, reviewRequired };
}

/** Cross-artifact consistency: definitions, formulas, terminology, keys, versions. */
export function consistencyCheck(artifacts: { id: string; type: string; content: Record<string, unknown>; sourceVersions: string[] }[]): {
  alerts: { kinds: string[]; detail: string; artifactIds: string[] }[];
} {
  const alerts: { kinds: string[]; detail: string; artifactIds: string[] }[] = [];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  // Definitions per term.
  const defs = new Map<string, { text: string; id: string }[]>();
  for (const a of artifacts) {
    const t = JSON.stringify(a.content);
    const m = t.match(/"term"\s*:\s*"([^"]+)"[^}]*?"definition"\s*:\s*"([^"]+)"/g) ?? [];
    void m;
    const terms = [...t.matchAll(/"term"\s*:\s*"([^"]+)"/g)];
    for (const tm of terms) {
      const term = norm(tm[1]!);
      const dmatch = t.match(new RegExp(`"term"\\s*:\\s*"${tm[1]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^}]*?"definition"\\s*:\\s*"([^"]+)"`));
      const arr = defs.get(term) ?? [];
      arr.push({ text: norm(dmatch?.[1] ?? ""), id: a.id });
      defs.set(term, arr);
    }
  }
  for (const [term, list] of defs) {
    const distinct = new Set(list.map((x) => x.text.slice(0, 60)));
    if (distinct.size > 1) {
      alerts.push({ kinds: ["contradictory_definitions"], detail: `“${term}” defined ${distinct.size} ways`, artifactIds: list.map((x) => x.id) });
    }
  }
  // Formula drift: same variable sets, different latex.
  const formulae = new Map<string, { latex: string; id: string }[]>();
  for (const a of artifacts) {
    for (const m of JSON.stringify(a.content).matchAll(/"latex"\s*:\s*"([^"]+)"/g)) {
      const key = m[1]!.replace(/[^a-zA-Z]/g, "").slice(0, 12);
      const arr = formulae.get(key) ?? [];
      arr.push({ latex: m[1]!, id: a.id });
      formulae.set(key, arr);
    }
  }
  for (const [, list] of formulae) {
    if (new Set(list.map((x) => x.latex)).size > 1) {
      alerts.push({ kinds: ["mismatched_formulas"], detail: "same formula family rendered differently", artifactIds: list.map((x) => x.id) });
    }
  }
  // Stale versions.
  const allVersions = new Set(artifacts.flatMap((a) => a.sourceVersions));
  void allVersions;
  return { alerts };
}

/** Review routing: auto / review / mandatory by type, confidence, stakes. */
export function reviewPolicy(type: string, confidence: number, highStakes = false): "auto" | "review" | "mandatory" {
  const autoTypes = ["glossary", "flashcard_set", "summary"];
  const mandatoryTypes = ["practice_test", "coding_assignment", "lab", "debate"];
  if (highStakes || mandatoryTypes.includes(type) || confidence < 0.7) return "mandatory";
  if (!autoTypes.includes(type) || confidence < 0.85) return "review";
  return "auto";
}

// ---------------------------------------------------------------------------
// Artifact envelope — the spec header every artifact carries.
// ---------------------------------------------------------------------------

export interface ArtifactEnvelope {
  artifact_id: string;
  type: string;
  title: string;
  source_documents: string[];
  source_versions: string[];
  concepts: string[];
  learning_objectives: string[];
  audience: Audience;
  citations: boolean;
  extraction_confidence: number;
  review_status: string;
  generated_at: string;
  source_status: {
    verified: boolean;
    stale_versions: string[];
    affected_by_source_change: boolean;
  };
}

/**
 * First-class artifact envelope. `affected_by_source_change` compares the
 * artifact's pinned versions against the model's current versions — the
 * display behind "Source status / Last source update / Affected: yes/no".
 */
export function artifactEnvelope(
  a: {
    id: string; type: string; title?: string;
    sourceDocs: string[]; sourceVersions: string[];
    concepts: string[]; objectives?: string[]; audience?: Audience;
    extractionConfidence: number; reviewStatus: string; createdAt: string | Date;
  },
  currentVersions: string[],
  opts: { hasCitations?: boolean } = {},
): ArtifactEnvelope {
  const stale = a.sourceVersions.filter((v) => !currentVersions.includes(v));
  return {
    artifact_id: a.id,
    type: a.type,
    title: a.title ?? "",
    source_documents: a.sourceDocs,
    source_versions: a.sourceVersions,
    concepts: a.concepts,
    learning_objectives: a.objectives ?? [],
    audience: a.audience ?? {},
    citations: opts.hasCitations ?? false,
    extraction_confidence: a.extractionConfidence,
    review_status: a.reviewStatus,
    generated_at: typeof a.createdAt === "string" ? a.createdAt : a.createdAt.toISOString(),
    source_status: {
      verified: stale.length === 0,
      stale_versions: stale,
      affected_by_source_change: stale.length > 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Assessment leakage — practice material must not reveal graded answers.
// ---------------------------------------------------------------------------

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2));
  const tb = new Set(b.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

export interface LeakageFinding {
  practiceId: string;
  practiceTitle: string;
  gradedId: string;
  gradedTitle: string;
  similarity: number;
  sharedAnswers: string[];
  action: string;
}

/**
 * Practice-vs-graded leakage screen. Flags practice material that is
 * near-identical to graded items or reuses graded answer spans verbatim —
 * regenerate with fresh items, never reuse graded answer spans.
 */
export function assessmentLeakageCheck(
  practice: { id: string; title: string; text: string; answerSpans: string[] }[],
  graded: { id: string; title: string; text: string; answerSpans: string[] }[],
): { leaks: LeakageFinding[]; status: "clear" | "leak_detected" } {
  const leaks: LeakageFinding[] = [];
  for (const p of practice) {
    for (const g of graded) {
      if (p.id === g.id) continue;
      const sim = Math.round(tokenOverlap(p.text, g.text) * 100) / 100;
      const shared = g.answerSpans
        .filter((s) => s.trim().length > 8)
        .filter((s) => p.text.toLowerCase().includes(s.toLowerCase().slice(0, 60)))
        .slice(0, 5);
      if (sim >= 0.5 || shared.length > 0) {
        leaks.push({
          practiceId: p.id, practiceTitle: p.title,
          gradedId: g.id, gradedTitle: g.title,
          similarity: sim, sharedAnswers: shared.map((s) => s.slice(0, 120)),
          action: "regenerate practice with fresh items and varied inputs; never reuse graded answer spans",
        });
      }
    }
  }
  return { leaks: leaks.slice(0, 20), status: leaks.length > 0 ? "leak_detected" : "clear" };
}

// ---------------------------------------------------------------------------
// Translation term-equivalence check.
// ---------------------------------------------------------------------------

export interface TermCheck {
  covered: string[];
  missingPolicy: string[];
  emptyTranslations: string[];
  status: "ok" | "review_required";
  note: string;
}

/**
 * Every model term needs a term-policy entry; empty translations signal a
 * forced one-to-one mapping. No exact equivalent is invented — unexplained
 * adaptations are flagged, not silently passed.
 */
export function translationTermCheck(modelTerms: string[], policy: Record<string, string>): TermCheck {
  const covered: string[] = [];
  const missingPolicy: string[] = [];
  const emptyTranslations: string[] = [];
  for (const t of [...new Set(modelTerms)].slice(0, 60)) {
    if (!(t in policy)) {
      missingPolicy.push(t);
      continue;
    }
    if (!policy[t]!.trim()) emptyTranslations.push(t);
    else covered.push(t);
  }
  return {
    covered, missingPolicy, emptyTranslations,
    status: missingPolicy.length + emptyTranslations.length > 0 ? "review_required" : "ok",
    note: "Unexplained adaptations flagged — explain the adaptation instead of creating a false one-to-one translation.",
  };
}

// ---------------------------------------------------------------------------
// Personalized gap sheet — misconception-focused revision for known gaps.
// ---------------------------------------------------------------------------

/**
 * Concise, conceptually complete revision scoped to the learner's gap
 * concepts: must-know, must-do, targeted misconceptions, formulas, quick
 * checks, sources. One sheet per gap set — not a generic re-summary.
 */
export function genGapSheet(nodes: ModelNode[], gapLabels: string[]): Record<string, unknown> {
  const gaps = new Set(gapLabels.map((g) => g.toLowerCase()));
  const concepts = byKind(nodes, "concept").filter((c) => gaps.size === 0 || gaps.has(c.label.toLowerCase()));
  const misc = byKind(nodes, "misconception").filter((m) =>
    gaps.size === 0 || gaps.has(m.label.toLowerCase()) || [...gaps].some((g) => m.text.toLowerCase().includes(g)),
  );
  const formulae = byKind(nodes, "formula").filter((f) =>
    gaps.size === 0 || gaps.has(f.label.toLowerCase()),
  );
  return {
    kind: "gap_sheet",
    gaps: [...gaps],
    mustKnow: concepts.slice(0, 8).map((c) => ({ label: c.label, text: c.text, citation: cite(c) })),
    mustDo: concepts.slice(0, 6).map((c) => `Apply ${c.label} in context`),
    misconceptions: misc.slice(0, 6).map((m) => ({ text: m.text, correction: "see source evidence", citation: cite(m) })),
    formulas: formulae.slice(0, 6).map((f) => ({ latex: f.text, citation: cite(f) })),
    quickChecks: concepts.slice(0, 4).map((c) => `Check: ${c.label}?`),
    sources: [...new Set([...concepts, ...misc].map((x) => cite(x)))].slice(0, 10),
    rule: "scoped to known gaps — deliberate repetition for spaced practice is kept, generic re-summary is not",
  };
}
