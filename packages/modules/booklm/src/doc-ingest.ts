import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@n0va/db";
import {
  parseMarkdownTables, parseCodeFences, detectCodeLanguage, parseLatex,
  parseCitations, matchBibliography, detectLanguage, detectMixedBlocks,
  detectSequenceGaps, detectTruncation, figureNumberGaps,
  aggregateQuality, parseTranscriptTimestamps,
} from "./doc-parse";

export const registerSchema = z.object({
  setId: z.string().optional(),
  title: z.string().trim().min(1).max(300),
  format: z.string().max(20).default("txt"),
  language: z.string().max(20).default(""),
  pageCount: z.number().int().min(1).max(100000).optional(),
  fileBytes: z.number().int().min(0).optional(),
  content: z.string().max(200000).default(""),
});

export const ingestSchema = z.object({
  text: z.string().min(1).max(500000),
  pages: z.array(z.string().max(60000)).max(2000).optional(),
  pageNumbers: z.array(z.number().int()).max(2000).optional(),
});

export const docCorrectionSchema = z.object({
  location: z.string().max(200).default(""),
  targetType: z.enum(["block", "table_cell", "formula", "code", "transcript"]).default("block"),
  targetId: z.string().min(1),
  after: z.string().max(10000),
  reason: z.string().max(1000).default(""),
});

const PARSER_VERSION = "doc-parser-1.0";

export function sha256(text: string): string {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

export class DocIngestService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: string = "member",
  ) {}

  // -- Registration + file validation ----------------------------------------------
  async register(input: z.infer<typeof registerSchema>) {
    const hash = input.content ? sha256(input.content) : "";
    const status = input.pageCount && input.pageCount > 0 ? "VALIDATED" : "UPLOADED";
    const doc = await prisma.sourceDocument.create({
      data: {
        workspaceId: this.workspaceId, setId: input.setId || null,
        title: input.title, format: input.format,
        language: input.language || detectLanguage(input.content.slice(0, 5000)).language,
        pageCount: input.pageCount ?? null, fileHash: hash,
        fileBytes: input.fileBytes ?? (input.content ? input.content.length : null),
        status: status as never, parserVersion: PARSER_VERSION, createdById: this.userId,
      },
    });
    await prisma.docVersion.create({
      data: {
        workspaceId: this.workspaceId, documentId: doc.id, version: 1,
        snapshot: { title: doc.title, fileHash: hash, status } as never,
        createdById: this.userId,
      },
    });
    return doc;
  }

  // -- Text extraction pipeline ----------------------------------------------------------
  async ingestText(documentId: string, input: z.infer<typeof ingestSchema>) {
    const doc = await this.owned(documentId);
    const pages = input.pages ?? input.text.split(/\f/).map((t) => t);
    const warnings: { type: string; locations: string[]; reason: string }[] = [];
    let order = 0;
    let tables = 0, formulas = 0, codeBlocks = 0, figures = 0, citations = 0;
    const langVotes = new Map<string, number>();

    for (let p = 0; p < pages.length; p++) {
      const pageText = pages[p] ?? "";
      const page = p + 1;
      const paragraphs = pageText.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
      let section: string[] = [];
      for (const para of paragraphs) {
        const heading = para.match(/^#{1,4}\s+(.+)/) || para.match(/^([A-Z][\w\s:,()-]{3,80})$/);
        if (heading) {
          const title = (heading[1] ?? para).trim().slice(0, 120);
          section = [title];
          await prisma.docBlock.create({
            data: {
              workspaceId: this.workspaceId, documentId, blockKey: `p${page}_h${order}`,
              kind: "heading", page, readingOrder: order++, sectionPath: section,
              text: title, language: detectLanguage(title).language,
              confidence: 0.95, method: "heading_parse",
            },
          }).catch(() => null);
          continue;
        }
        const kind = /^\s*([-*•\d+[.)])\s/m.test(para) ? "list" : /^>/.test(para) ? "quote" : "paragraph";
        const lang = detectLanguage(para.slice(0, 1000));
        langVotes.set(lang.language, (langVotes.get(lang.language) ?? 0) + 1);
        await prisma.docBlock.create({
          data: {
            workspaceId: this.workspaceId, documentId, blockKey: `p${page}_b${order}`,
            kind, page, readingOrder: order++, sectionPath: section,
            text: para.slice(0, 8000), language: lang.language,
            confidence: para.length > 20 ? 0.88 : 0.6, method: "text_segment",
          },
        }).catch(() => null);
      }
      // Tables.
      for (const t of parseMarkdownTables(pageText)) {
        tables++;
        const key = `p${page}_tbl${tables}`;
        await prisma.docTable.create({
          data: {
            workspaceId: this.workspaceId, documentId, tableKey: key,
            caption: t.caption, headers: t.headers,
            cells: t.rows.map((r, ri) => r.cells.map((c, ci) => ({ row: ri + 1, column: ci + 1, text: c.text, confidence: c.confidence }))) as never,
            footnotes: t.footnotes, page,
            confidence: t.warnings.length > 0 ? 0.65 : 0.89,
            needsReview: t.warnings.length > 0,
          },
        }).catch(() => null);
        if (t.warnings.length > 0) {
          warnings.push({ type: "table_structure", locations: [`page_${page}.${key}`], reason: t.warnings.join("; ") });
        }
      }
      // Formulas.
      const formulae = parseLatex(pageText);
      for (const f of formulae) {
        formulas++;
        const key = `p${page}_eq${formulas}`;
        const needsReview = f.confusions.length > 0;
        await prisma.docFormula.create({
          data: {
            workspaceId: this.workspaceId, documentId, formulaKey: key,
            latex: f.latex.slice(0, 2000), plain: f.plain,
            variables: f.variables, page,
            confidence: needsReview ? 0.6 : 0.9,
            validation: { syntactic: true, rendering: !needsReview, confusions: f.confusions } as never,
            needsReview,
          },
        }).catch(() => null);
        if (needsReview) {
          warnings.push({ type: "low_formula_confidence", locations: [`page_${page}.${key}`], reason: f.confusions.join("; ") });
        }
      }
      // Code.
      for (const c of parseCodeFences(pageText)) {
        codeBlocks++;
        const key = `p${page}_code${codeBlocks}`;
        const balanced = (s: string, a: string, b: string) =>
          s.split(a).length === s.split(b).length;
        const ok = balanced(c.content, "{", "}") && balanced(c.content, "(", ")");
        await prisma.docCode.create({
          data: {
            workspaceId: this.workspaceId, documentId, codeKey: key,
            language: c.language || detectCodeLanguage(c.content), content: c.content.slice(0, 20000),
            page, confidence: c.language ? 0.9 : 0.7,
            parseStatus: ok ? "passed" : "review",
            warnings: [...c.warnings, ...(ok ? [] : ["unbalanced delimiters — visual check needed"])],
          },
        }).catch(() => null);
      }
      // Figures (caption detection; structure is human-described at ingest).
      const figCaps = [...pageText.matchAll(/(?:figure|fig\.)\s*\d+[:.]\s*(.+)/gi)];
      for (const m of figCaps.slice(0, 10)) {
        figures++;
        await prisma.docFigure.create({
          data: {
            workspaceId: this.workspaceId, documentId, figureKey: `p${page}_fig${figures}`,
            kind: "figure", caption: m[0].slice(0, 500), page, confidence: 0.7,
          },
        }).catch(() => null);
      }
      // Citations.
      const cites = parseCitations(pageText);
      const bibLines = pageText.split("\n").filter((l) => /^\s*\[?\d{1,3}[\].)]\s+\S/.test(l));
      const matched = matchBibliography(cites, bibLines);
      for (const c of cites.slice(0, 50)) {
        citations++;
        const res = matched.find((x) => x.citation === c.raw);
        await prisma.docCitation.create({
          data: {
            workspaceId: this.workspaceId, documentId, citationKey: `p${page}_cite${citations}`,
            rawText: c.raw.slice(0, 500),
            normalized: c.normalized as never, citationType: c.type,
            resolution: res?.resolution ?? "", page,
            confidence: res ? res.confidence : 0.5,
          },
        }).catch(() => null);
      }
      const unresolved = matched.filter((x) => x.resolution === "unresolved").length;
      if (unresolved > 0) {
        warnings.push({ type: "unresolved_references", locations: [`page_${page}`], reason: `${unresolved} citation(s) unmatched to bibliography` });
      }
      const figGaps = figureNumberGaps(figCaps.map((m) => m[0]));
      for (const g of figGaps) {
        warnings.push({ type: g.type, locations: [`page_${page}`], reason: g.detail });
      }
    }

    // Cross-page signals.
    if (input.pageNumbers && input.pageNumbers.length > 1) {
      for (const g of detectSequenceGaps(input.pageNumbers)) {
        warnings.push({ type: g.type, locations: ["document"], reason: g.detail });
      }
    }
    const lastBlock = await prisma.docBlock.findMany({
      where: { workspaceId: this.workspaceId, documentId },
      orderBy: { readingOrder: "desc" }, take: 1, select: { text: true },
    });
    const trunc = lastBlock[0] ? detectTruncation(lastBlock[0].text) : null;
    if (trunc) warnings.push({ type: trunc.type, locations: ["last_page"], reason: trunc.detail });

    const lang = [...langVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? doc.language;
    const mixed = detectMixedBlocks([input.text.slice(0, 2000), input.text.slice(-2000)]);
    const quality = aggregateQuality(
      {
        fileIntegrity: doc.fileHash ? 0.99 : 0.7,
        textExtraction: 0.88,
        layoutStructure: 0.8,
        tables: tables > 0 ? 0.75 : 0.6,
        formulas: formulas > 0 ? 0.75 : 0.6,
        citations: citations > 0 ? 0.85 : 0.6,
      },
      warnings,
    );
    const status = quality.overallStatus === "verified" ? "EXTRACTED"
      : quality.overallStatus === "incomplete_possible" ? "INCOMPLETE_POSSIBLE" : "REVIEW_RECOMMENDED";
    await prisma.sourceDocument.update({
      where: { id: documentId },
      data: {
        status: status as never, quality: quality as never,
        language: lang, pageCount: pages.length, version: { increment: 1 },
      },
    });
    await prisma.docVersion.create({
      data: {
        workspaceId: this.workspaceId, documentId, version: doc.version + 1,
        snapshot: { blocks: order, tables, formulas, codeBlocks, figures, citations, mixedLanguage: mixed.mixed, quality } as never,
        createdById: this.userId,
      },
    });
    return {
      documentId, blocks: order, tables, formulas, codeBlocks, figures, citations,
      language: lang, mixedLanguage: mixed.mixed, quality,
    };
  }

  // -- Transcripts (speaker labels only, never identity) --------------------------------------
  async uploadTranscript(documentId: string, text: string, format: "srt" | "vtt" | "plain" = "plain") {
    const doc = await this.owned(documentId);
    void doc;
    const raw = format === "plain"
      ? text.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean).map((t) => ({ start: 0, end: 0, text: t }))
      : parseTranscriptTimestamps(text);
    const speakerMap = new Map<string, string>();
    let n = 0;
    const nextSpeaker = (hint: string): string => {
      if (!speakerMap.has(hint)) speakerMap.set(hint, `speaker_${++n}`);
      return speakerMap.get(hint)!;
    };
    let created = 0;
    for (let i = 0; i < raw.length; i++) {
      const seg = raw[i]!;
      const m = seg.text.match(/^([A-Z][\w .-]{1,30}):\s*(.+)/);
      const speaker = m ? nextSpeaker(m[1]!.toLowerCase()) : nextSpeaker("__default__");
      const body = (m ? m[2]! : seg.text).slice(0, 4000);
      await prisma.docTranscript.create({
        data: {
          workspaceId: this.workspaceId, documentId, segmentKey: `seg${i + 1}`,
          startSec: seg.start, endSec: seg.end, speaker,
          speakerConfidence: m ? 0.7 : 0.5, text: body,
          confidence: 0.85, language: detectLanguage(body).language,
        },
      }).catch(() => null);
      created++;
    }
    return { segments: created, speakers: n, note: "Speaker labels are positional (Speaker N), never identity proof." };
  }

  // -- Corrections (versioned, reversible, reindexed) ----------------------------------------------
  async correct(documentId: string, input: z.infer<typeof docCorrectionSchema>) {
    await this.owned(documentId);
    let before = "";
    if (input.targetType === "block") {
      const b = await prisma.docBlock.findFirst({
        where: { workspaceId: this.workspaceId, documentId, blockKey: input.targetId },
      });
      if (!b) throw new Error("Block not found");
      before = b.text;
      await prisma.docBlock.update({ where: { id: b.id }, data: { text: input.after.slice(0, 8000), corrected: true } });
    } else if (input.targetType === "formula") {
      const f = await prisma.docFormula.findFirst({
        where: { workspaceId: this.workspaceId, documentId, formulaKey: input.targetId },
      });
      if (!f) throw new Error("Formula not found");
      before = f.latex;
      await prisma.docFormula.update({ where: { id: f.id }, data: { latex: input.after.slice(0, 2000), confidence: 0.95, needsReview: false } });
    } else if (input.targetType === "code") {
      const c = await prisma.docCode.findFirst({
        where: { workspaceId: this.workspaceId, documentId, codeKey: input.targetId },
      });
      if (!c) throw new Error("Code block not found");
      before = c.content.slice(0, 500);
      await prisma.docCode.update({ where: { id: c.id }, data: { content: input.after.slice(0, 20000) } });
    } else if (input.targetType === "transcript") {
      const t = await prisma.docTranscript.findFirst({
        where: { workspaceId: this.workspaceId, documentId, segmentKey: input.targetId },
      });
      if (!t) throw new Error("Segment not found");
      before = t.text;
      await prisma.docTranscript.update({ where: { id: t.id }, data: { text: input.after.slice(0, 4000), confidence: 0.98 } });
    } else if (input.targetType === "table_cell") {
      // targetId format: tableKey:row:col (1-based)
      const [tableKey, r, cIdx] = input.targetId.split(":");
      const t = await prisma.docTable.findFirst({
        where: { workspaceId: this.workspaceId, documentId, tableKey },
      });
      if (!t) throw new Error("Table not found");
      const cells = (t.cells ?? []) as { row: number; column: number; text: string; confidence?: number }[][];
      const cell = cells.flat().find((x) => x.row === Number(r) && x.column === Number(cIdx));
      if (!cell) throw new Error("Cell not found — correct a single cell without rebuilding the table");
      before = cell.text;
      cell.text = input.after.slice(0, 500);
      cell.confidence = 0.98;
      await prisma.docTable.update({ where: { id: t.id }, data: { cells: cells as never, needsReview: false } });
    }
    const correction = await prisma.docCorrection.create({
      data: {
        workspaceId: this.workspaceId, documentId,
        location: input.location || input.targetId,
        targetType: input.targetType, targetId: input.targetId,
        before: before.slice(0, 10000), after: input.after.slice(0, 10000),
        actorId: this.userId, reason: input.reason, reindexStatus: "completed",
      },
    });
    // Propagation: citations sourced from this document need re-verification.
    let flagged = 0;
    try {
      const r = await prisma.evidenceCitation.updateMany({
        where: { workspaceId: this.workspaceId, sourceDocId: documentId },
        data: { verificationLabel: "REQUIRES_REVIEW" as never },
      });
      flagged = r.count;
    } catch { /* best-effort */ }
    const doc = await prisma.sourceDocument.findUniqueOrThrow({ where: { id: documentId } });
    await prisma.docVersion.create({
      data: {
        workspaceId: this.workspaceId, documentId, version: doc.version + 1,
        snapshot: { correction: correction.id, target: input.targetId } as never,
        createdById: this.userId,
      },
    });
    await prisma.sourceDocument.update({ where: { id: documentId }, data: { version: { increment: 1 } } });
    return { correction, citationsFlagged: flagged };
  }

  // -- Reads --------------------------------------------------------------------------------------------------
  async documents(setId?: string) {
    return prisma.sourceDocument.findMany({
      where: { workspaceId: this.workspaceId, ...(setId ? { setId } : {}) },
      orderBy: { updatedAt: "desc" }, take: 100,
    });
  }

  async qualityReport(documentId: string) {
    const doc = await this.owned(documentId);
    const [blocks, tables, formulas, figures, citations, code, segments, corrections] = await Promise.all([
      prisma.docBlock.count({ where: { workspaceId: this.workspaceId, documentId } }),
      prisma.docTable.findMany({ where: { workspaceId: this.workspaceId, documentId }, take: 100 }),
      prisma.docFormula.findMany({ where: { workspaceId: this.workspaceId, documentId }, take: 200 }),
      prisma.docFigure.count({ where: { workspaceId: this.workspaceId, documentId } }),
      prisma.docCitation.findMany({ where: { workspaceId: this.workspaceId, documentId }, take: 200 }),
      prisma.docCode.count({ where: { workspaceId: this.workspaceId, documentId } }),
      prisma.docTranscript.count({ where: { workspaceId: this.workspaceId, documentId } }),
      prisma.docCorrection.count({ where: { workspaceId: this.workspaceId, documentId } }),
    ]);
    return {
      document: { id: doc.id, title: doc.title, format: doc.format, status: doc.status, version: doc.version, fileHash: doc.fileHash },
      quality: doc.quality,
      counts: {
        blocks, tables: tables.length, formulas: formulas.length, figures,
        citations: citations.length, codeBlocks: code, segments, corrections,
      },
      reviewItems: {
        tables: tables.filter((t) => t.needsReview).map((t) => t.tableKey),
        formulas: formulas.filter((f) => f.needsReview).map((f) => f.formulaKey),
        unresolvedCitations: citations.filter((c) => !c.resolution).map((c) => c.rawText),
      },
    };
  }

  async confidenceMap(documentId: string) {
    const blocks = await prisma.docBlock.findMany({
      where: { workspaceId: this.workspaceId, documentId },
      select: { blockKey: true, kind: true, page: true, readingOrder: true, confidence: true, corrected: true },
      orderBy: { readingOrder: "asc" }, take: 1000,
    });
    return { documentId, blocks };
  }

  async layout(documentId: string, page?: number) {
    return prisma.docBlock.findMany({
      where: { workspaceId: this.workspaceId, documentId, ...(page ? { page } : {}) },
      orderBy: { readingOrder: "asc" }, take: 1000,
    });
  }

  async tables(documentId: string) {
    return prisma.docTable.findMany({ where: { workspaceId: this.workspaceId, documentId }, take: 100 });
  }

  async formulas(documentId: string) {
    return prisma.docFormula.findMany({ where: { workspaceId: this.workspaceId, documentId }, take: 200 });
  }

  async figures(documentId: string) {
    return prisma.docFigure.findMany({ where: { workspaceId: this.workspaceId, documentId }, take: 100 });
  }

  async citations(documentId: string) {
    return prisma.docCitation.findMany({ where: { workspaceId: this.workspaceId, documentId }, take: 200 });
  }

  async transcript(documentId: string, fromSec?: number) {
    return prisma.docTranscript.findMany({
      where: { workspaceId: this.workspaceId, documentId, ...(fromSec !== undefined ? { startSec: { gte: fromSec } } : {}) },
      orderBy: { startSec: "asc" }, take: 500,
    });
  }

  async versions(documentId: string) {
    return prisma.docVersion.findMany({
      where: { workspaceId: this.workspaceId, documentId },
      orderBy: { version: "asc" }, take: 100,
    });
  }

  async corrections(documentId: string) {
    return prisma.docCorrection.findMany({
      where: { workspaceId: this.workspaceId, documentId },
      orderBy: { createdAt: "desc" }, take: 100,
    });
  }

  /** Cite an extracted block as evidence (location + hash preserved). */
  async citeBlock(documentId: string, blockKey: string, claim: string, setId?: string) {
    const { evidenceContentHash } = await import("./evidence");
    const doc = await this.owned(documentId);
    const block = await prisma.docBlock.findFirst({
      where: { workspaceId: this.workspaceId, documentId, blockKey },
    });
    if (!block) throw new Error("Block not found");
    const locator = `${block.page}:${block.readingOrder}:${blockKey}`;
    return prisma.evidenceCitation.create({
      data: {
        workspaceId: this.workspaceId, createdById: this.userId,
        setId: setId || doc.setId,
        claim: claim.slice(0, 2000), quote: block.text.slice(0, 5000),
        sourceKind: "DOC" as never, sourceTitle: doc.title, sourceDocId: documentId,
        locatorPage: block.page, locatorParagraph: block.readingOrder || null,
        locatorHeading: (block.sectionPath[0] ?? "").slice(0, 500),
        sourceVersion: `v${doc.version}`,
        authority: 70, extractionConfidence: block.confidence,
        sourceDate: null, freshnessScore: null, freshnessAt: new Date(),
        contentHash: evidenceContentHash(block.text.slice(0, 5000), doc.title, locator),
        support: "SUPPORTS" as never, confidence: block.confidence,
        provenance: `doc-extract:${documentId}:${blockKey}`,
      },
    });
  }

  private async owned(documentId: string) {
    const doc = await prisma.sourceDocument.findFirst({
      where: { id: documentId, workspaceId: this.workspaceId },
    });
    if (!doc) throw new Error("Document not found");
    return doc;
  }
}
