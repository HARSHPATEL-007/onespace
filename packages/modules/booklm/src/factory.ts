import { z } from "zod";
import { prisma } from "@n0va/db";
import {
  buildStudyModel, genSummary, genGlossary, genConceptMap, genPrereqMap,
  genFlashcards, genPracticeTest, genCaseStudy, genDebate, genLab, genCoding,
  genViva, genRevision, genAudioScript, genDeck, genTeachingNotes,
  adaptAccessibility, adaptAge, adaptLanguage,
  validateArtifact, consistencyCheck, reviewPolicy,
  type SummaryDepth, type TestBlueprint, type Audience,
} from "./study-factory";

export const generateSchema = z.object({
  setId: z.string().min(1),
  type: z.enum([
    "summary", "glossary", "concept_map", "prereq_map", "flashcard_set",
    "practice_test", "case_study", "debate", "lab", "coding_assignment",
    "viva", "revision_sheet", "audio_lesson", "deck", "teaching_notes",
  ]),
  title: z.string().max(300).default(""),
  depth: z.enum(["quick", "standard", "deep", "exam", "instructor"]).default("standard"),
  sourceOnly: z.boolean().default(true),
  audience: z.object({
    ageBand: z.string().max(20).default(""),
    level: z.string().max(40).default("intermediate"),
    language: z.string().max(20).default("en"),
  }).default({ level: "intermediate", language: "en" }),
  blueprint: z.object({
    concepts: z.record(z.string().max(120), z.number().min(0).max(1)).default({}),
    levels: z.record(z.string().max(40), z.number().min(0).max(1)).default({ recall: 0.2, application: 0.45, transfer: 0.35 }),
    types: z.record(z.string().max(40), z.number().min(0).max(1)).default({}),
    difficulty: z.record(z.string().max(40), z.number().min(0).max(1)).default({}),
  }).default({ concepts: {}, levels: { recall: 0.2, application: 0.45, transfer: 0.35 }, types: {}, difficulty: {} }),
  topic: z.string().max(300).default(""),
  language: z.string().max(20).default("python"),
  objectives: z.array(z.string().max(200)).max(20).default([]),
  highStakes: z.boolean().default(false),
});

const AUTO_PUBLISH_CONFIDENCE = 0.85;

export class StudyFactoryService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: string = "member",
  ) {}

  private assertInstructor() {
    if (!["admin", "owner", "teacher"].includes(this.role)) throw new Error("Forbidden: instructor role required");
  }

  /** Build (or rebuild) the single verified learning model for a set. */
  async buildModel(setId: string) {
    const [items, citations, concepts, deps, docs, misc] = await Promise.all([
      prisma.learningItem.findMany({ where: { workspaceId: this.workspaceId, setId }, orderBy: { sortOrder: "asc" }, take: 60 }),
      prisma.evidenceCitation.findMany({ where: { workspaceId: this.workspaceId, setId }, take: 100 }),
      prisma.learnerConcept.findMany({ where: { workspaceId: this.workspaceId, setId }, take: 60 }),
      prisma.conceptDependency.findMany({
        where: { workspaceId: this.workspaceId },
        include: { from: { select: { label: true } }, to: { select: { label: true } } },
        take: 200,
      }),
      prisma.sourceDocument.findMany({ where: { workspaceId: this.workspaceId, setId }, select: { id: true }, take: 20 }),
      prisma.misconception.findMany({
        where: { workspaceId: this.workspaceId, status: { notIn: ["RESOLVED", "DISMISSED"] as never } },
        include: { concept: { select: { key: true, setId: true } } }, take: 20,
      }),
    ]);
    const docIds = docs.map((d) => d.id);
    const formulas = docIds.length > 0
      ? await prisma.docFormula.findMany({ where: { workspaceId: this.workspaceId, documentId: { in: docIds } }, take: 30 })
      : [];
    const conceptIds = new Set(concepts.map((c) => c.id));
    const { nodes, sourceVersions } = buildStudyModel({
      items: items.map((i) => ({ id: i.id, title: i.title, notes: i.notes, kind: i.kind, source: i.source || i.title })),
      citations: citations.map((c) => ({
        id: c.id, claim: c.claim, quote: c.quote, sourceTitle: c.sourceTitle,
        sourceVersion: c.sourceVersion, confidence: c.confidence,
      })),
      concepts: concepts.map((c) => ({ key: c.key, label: c.label, description: c.description })),
      formulas: formulas.map((f) => ({ key: f.formulaKey, latex: f.latex, plain: f.plain, variables: f.variables, page: f.page })),
      misconceptions: misc
        .filter((m) => conceptIds.has(m.conceptId))
        .map((m) => ({ statement: m.statement, conceptKey: m.concept.key })),
    });
    const model = await prisma.studyModel.create({
      data: {
        workspaceId: this.workspaceId, setId, nodes: nodes as never,
        sourceVersions: sourceVersions as never, builtById: this.userId,
      },
    });
    return {
      model,
      prereqs: deps
        .filter((d) => concepts.some((c) => c.label === d.to.label))
        .map((d) => ({ from: d.from.label, to: d.to.label, relation: d.relation, kind: d.kind, confidence: d.confidence })),
    };
  }

  private async latestModel(setId: string) {
    const model = await prisma.studyModel.findFirst({
      where: { workspaceId: this.workspaceId, setId },
      orderBy: { createdAt: "desc" },
    });
    if (!model) throw new Error("No study model — build it first");
    return model;
  }

  /** Generate one artifact from the shared model (never an independent summary). */
  async generate(input: z.infer<typeof generateSchema>) {
    const model = await this.latestModel(input.setId);
    const nodes = (model.nodes ?? []) as unknown as import("./study-factory").ModelNode[];
    const deps = await prisma.conceptDependency.findMany({
      where: { workspaceId: this.workspaceId },
      include: { from: { select: { label: true } }, to: { select: { label: true } } },
      take: 200,
    });
    const prereqs = deps.map((d) => ({ from: d.from.label, to: d.to.label, relation: d.relation }));
    const audience = input.audience as Audience;
    let content: Record<string, unknown>;
    switch (input.type) {
      case "summary": content = genSummary(nodes, input.depth as SummaryDepth, input.sourceOnly); break;
      case "glossary": content = genGlossary(nodes); break;
      case "concept_map": content = genConceptMap(nodes, prereqs); break;
      case "prereq_map": content = genPrereqMap(prereqs.map((p) => ({ ...p, kind: "SOFT" as const, confidence: 0.6, threshold: 0.8 }))); break;
      case "flashcard_set": content = genFlashcards(nodes); break;
      case "practice_test": content = genPracticeTest(nodes, input.blueprint as TestBlueprint); break;
      case "case_study": content = genCaseStudy(nodes, input.topic || "course case"); break;
      case "debate": content = genDebate(nodes, input.topic || "course motion"); break;
      case "lab": content = genLab(input.topic || "course lab", input.objectives); break;
      case "coding_assignment": content = genCoding(input.topic || "course assignment", input.language, input.objectives); break;
      case "viva": content = genViva(nodes); break;
      case "revision_sheet": content = genRevision(nodes, input.topic || "course topic"); break;
      case "audio_lesson": content = genAudioScript(nodes, input.title || "course audio"); break;
      case "deck": content = genDeck(nodes, input.title || "course deck"); break;
      case "teaching_notes": content = genTeachingNotes(nodes, input.topic || "course topic"); break;
    }
    const sourceDocs = [...new Set(nodes.map((x) => x.source))].slice(0, 20);
    const sourceVersions = (model.sourceVersions ?? []) as string[];
    const extractionConfidence = nodes.length
      ? Math.round((nodes.reduce((s, x) => s + x.confidence, 0) / nodes.length) * 100) / 100 : 0.5;
    const validation = validateArtifact(
      {
        type: input.type, content, sourceVersions,
        concepts: [...new Set(nodes.filter((x) => x.kind === "concept").map((x) => x.label))].slice(0, 20),
        extractionConfidence, highStakes: input.highStakes,
      },
      nodes, sourceVersions,
    );
    const route = reviewPolicy(input.type, extractionConfidence, input.highStakes);
    const autoPublish = route === "auto" && extractionConfidence >= AUTO_PUBLISH_CONFIDENCE;
    const artifact = await prisma.studyArtifact.create({
      data: {
        workspaceId: this.workspaceId, setId: input.setId, modelId: model.id,
        type: input.type, title: input.title || `${input.type.replace(/_/g, " ")} — ${new Date().toLocaleDateString()}`,
        content: { ...content, _opts: { depth: input.depth, audience, topic: input.topic, language: input.language, objectives: input.objectives, blueprint: input.blueprint, highStakes: input.highStakes } } as never,
        sourceDocs, sourceVersions,
        concepts: [...new Set(nodes.filter((x) => x.kind === "concept").map((x) => x.label))].slice(0, 20),
        objectives: nodes.filter((x) => x.kind === "objective").map((x) => x.label).slice(0, 10),
        audience: audience as never,
        extractionConfidence,
        reviewStatus: autoPublish ? ("PUBLISHED" as never) : route === "mandatory" ? ("IN_REVIEW" as never) : ("DRAFT" as never),
        createdById: this.userId,
      },
    });
    return { artifact, validation, route, autoPublished: autoPublish };
  }

  async list(setId: string, type?: string) {
    return prisma.studyArtifact.findMany({
      where: { workspaceId: this.workspaceId, setId, ...(type ? { type } : {}) },
      orderBy: { updatedAt: "desc" }, take: 100,
    });
  }

  async get(id: string) {
    const a = await prisma.studyArtifact.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!a) throw new Error("Artifact not found");
    return a;
  }

  async validate(id: string) {
    const a = await this.get(id);
    const model = a.modelId
      ? await prisma.studyModel.findFirst({ where: { id: a.modelId, workspaceId: this.workspaceId } })
      : await this.latestModel(a.setId).catch(() => null);
    const nodes = ((model?.nodes ?? []) as unknown as import("./study-factory").ModelNode[]);
    const currentVersions = (model?.sourceVersions ?? []) as string[];
    return validateArtifact(
      {
        type: a.type, content: (a.content ?? {}) as Record<string, unknown>,
        sourceVersions: a.sourceVersions, concepts: a.concepts,
        extractionConfidence: a.extractionConfidence,
        highStakes: ["practice_test", "coding_assignment", "lab"].includes(a.type),
      },
      nodes, currentVersions,
    );
  }

  /** Instructor review gate (mandatory types always land here). */
  async review(id: string, approve: boolean, note = "") {
    this.assertInstructor();
    void note;
    return prisma.studyArtifact.updateMany({
      where: { id, workspaceId: this.workspaceId },
      data: {
        reviewStatus: (approve ? "APPROVED" : "REJECTED") as never,
        reviewedById: this.userId,
      },
    });
  }

  async publish(id: string) {
    this.assertInstructor();
    const a = await this.get(id);
    if (a.reviewStatus !== "APPROVED") throw new Error("Publish requires instructor approval");
    return prisma.studyArtifact.updateMany({
      where: { id, workspaceId: this.workspaceId }, data: { reviewStatus: "PUBLISHED" as never },
    });
  }

  /** Transforms keep provenance + review rules of the base artifact. */
  async transform(id: string, kind: "translate" | "adapt" | "accessibility", opts: Record<string, unknown>) {
    const a = await this.get(id);
    const base = (a.content ?? {}) as Record<string, unknown>;
    let content: Record<string, unknown>;
    if (kind === "translate") {
      content = adaptLanguage(base, String(opts.target ?? "hi"), (opts.terms ?? {}) as Record<string, string>);
    } else if (kind === "adapt") {
      content = adaptAge(base, String(opts.ageBand ?? "11-13"));
    } else {
      content = adaptAccessibility(base, (opts.formats as string[]) ?? ["text", "audio-transcript"]);
    }
    return prisma.studyArtifact.create({
      data: {
        workspaceId: this.workspaceId, setId: a.setId, modelId: a.modelId,
        type: `${a.type}_${kind}`, title: `${a.title} (${kind})`,
        content: { ...content, derivedFrom: a.id } as never,
        sourceDocs: a.sourceDocs, sourceVersions: a.sourceVersions,
        concepts: a.concepts, objectives: a.objectives,
        audience: (opts.audience ?? a.audience ?? {}) as never,
        extractionConfidence: a.extractionConfidence,
        reviewStatus: "DRAFT" as never, createdById: this.userId,
      },
    });
  }

  /** Regenerate from the latest model; old version superseded, never overwritten. */
  async regenerate(id: string) {
    const a = await this.get(id);
    const opts = ((a.content ?? {}) as { _opts?: Record<string, unknown> })._opts ?? {};
    const fresh = await this.generate({
      setId: a.setId, type: a.type as never, title: a.title,
      depth: (opts.depth as never) ?? "standard",
      sourceOnly: true,
      audience: (opts.audience as never) ?? { level: "intermediate", language: "en" },
      blueprint: (opts.blueprint as never) ?? { concepts: {}, levels: {}, types: {}, difficulty: {} },
      topic: String(opts.topic ?? a.title),
      language: String(opts.language ?? "python"),
      objectives: (opts.objectives as string[]) ?? [],
      highStakes: Boolean(opts.highStakes ?? false),
    });
    await prisma.studyArtifact.updateMany({
      where: { id, workspaceId: this.workspaceId }, data: { reviewStatus: "SUPERSEDED" as never },
    });
    return fresh;
  }

  async provenance(id: string) {
    const a = await this.get(id);
    const model = a.modelId
      ? await prisma.studyModel.findFirst({ where: { id: a.modelId, workspaceId: this.workspaceId } })
      : null;
    return {
      artifact: {
        id: a.id, type: a.type, version: a.version,
        sourceDocs: a.sourceDocs, sourceVersions: a.sourceVersions,
        extractionConfidence: a.extractionConfidence,
        reviewStatus: a.reviewStatus, reviewedBy: a.reviewedById,
        generatedAt: a.createdAt,
      },
      model: model ? { id: model.id, nodes: (model.nodes as unknown[]).length, builtAt: model.createdAt } : null,
    };
  }

  /** Source update → affected artifacts (stale versions), flagged for regen. */
  async impact(documentKey: string) {
    const rows = await prisma.studyArtifact.findMany({
      where: { workspaceId: this.workspaceId },
      take: 500,
    });
    const affected = rows.filter((a) =>
      a.sourceDocs.some((s) => s.toLowerCase().includes(documentKey.toLowerCase())) ||
      a.sourceVersions.some((v) => v.toLowerCase().includes(documentKey.toLowerCase())),
    );
    return {
      documentKey,
      affected: affected.map((a) => ({
        id: a.id, type: a.type, title: a.title,
        reviewStatus: a.reviewStatus, versions: a.sourceVersions,
      })),
      note: "Regenerate affected artifacts from the rebuilt model; supersede — never overwrite.",
    };
  }

  /** Cross-artifact consistency over the set's latest artifacts. */
  async consistency(setId: string) {
    const { consistencyCheck } = await import("./study-factory");
    const rows = await prisma.studyArtifact.findMany({
      where: { workspaceId: this.workspaceId, setId },
      orderBy: { updatedAt: "desc" }, take: 200,
    });
    // Latest per type.
    const seen = new Set<string>();
    const latest = rows.filter((r) => {
      if (seen.has(r.type)) return false;
      seen.add(r.type);
      return true;
    });
    const { alerts } = consistencyCheck(latest.map((a) => ({
      id: a.id, type: a.type,
      content: (a.content ?? {}) as Record<string, unknown>,
      sourceVersions: a.sourceVersions,
    })));
    return { checked: latest.map((a) => ({ id: a.id, type: a.type })), alerts };
  }
}
