import { z } from "zod";
import { prisma } from "@n0va/db";
import { DEFAULT_WEIGHTS, type RerankWeights } from "./epistemics";

export const policySchema = z.object({
  setId: z.string().min(1),
  approvedSources: z.array(z.string().max(100)).max(50).default([]),
  restrictedSources: z.array(z.string().max(100)).max(50).default([]),
  requireTwoSources: z.boolean().default(false),
  requireCurrentVersion: z.boolean().default(false),
  requireHumanReview: z.boolean().default(false),
  examMode: z.boolean().default(false),
  examExternalSources: z.boolean().default(false),
  allowedInferenceLevel: z.enum(["none", "marked", "free"]).default("marked"),
  minCoverage: z.number().min(0).max(1).default(0.5),
  minIndependentSources: z.number().int().min(1).max(10).default(1),
  retrievalWeights: z.object({
    ws: z.number(), wl: z.number(), wa: z.number(), wf: z.number(),
    wc: z.number(), wt: z.number(), wx: z.number(), wd: z.number(),
  }).partial().default({}),
  freshnessLambda: z.record(z.string().max(40), z.number().min(0).max(5)).default({}),
});

export type PolicyInput = z.infer<typeof policySchema>;

export interface EffectivePolicy {
  approvedSources: string[]; restrictedSources: string[];
  requireTwoSources: boolean; requireCurrentVersion: boolean; requireHumanReview: boolean;
  examMode: boolean; examExternalSources: boolean;
  allowedInferenceLevel: "none" | "marked" | "free";
  minCoverage: number; minIndependentSources: number;
  weights: RerankWeights; lambdas: Record<string, number>;
  configured: boolean;
}

const DEFAULT_POLICY: EffectivePolicy = {
  approvedSources: [], restrictedSources: [],
  requireTwoSources: false, requireCurrentVersion: false, requireHumanReview: false,
  examMode: false, examExternalSources: false,
  allowedInferenceLevel: "marked",
  minCoverage: 0.5, minIndependentSources: 1,
  weights: DEFAULT_WEIGHTS, lambdas: {},
  configured: false,
};

export class PolicyService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: string,
  ) {}

  private assertInstructor() {
    if (!["admin", "owner", "teacher"].includes(this.role)) throw new Error("Forbidden: instructor role required");
  }

  async getPolicy(setId: string) {
    return prisma.sourcePolicy.findUnique({
      where: { workspaceId_setId: { workspaceId: this.workspaceId, setId } },
    });
  }

  async upsertPolicy(input: PolicyInput) {
    this.assertInstructor();
    return prisma.sourcePolicy.upsert({
      where: { workspaceId_setId: { workspaceId: this.workspaceId, setId: input.setId } },
      update: {
        approvedSources: input.approvedSources, restrictedSources: input.restrictedSources,
        requireTwoSources: input.requireTwoSources, requireCurrentVersion: input.requireCurrentVersion,
        requireHumanReview: input.requireHumanReview, examMode: input.examMode,
        examExternalSources: input.examExternalSources, allowedInferenceLevel: input.allowedInferenceLevel,
        minCoverage: input.minCoverage, minIndependentSources: input.minIndependentSources,
        retrievalWeights: (input.retrievalWeights ?? {}) as never,
        freshnessLambda: (input.freshnessLambda ?? {}) as never,
        updatedById: this.userId,
      },
      create: {
        workspaceId: this.workspaceId, setId: input.setId,
        approvedSources: input.approvedSources, restrictedSources: input.restrictedSources,
        requireTwoSources: input.requireTwoSources, requireCurrentVersion: input.requireCurrentVersion,
        requireHumanReview: input.requireHumanReview, examMode: input.examMode,
        examExternalSources: input.examExternalSources, allowedInferenceLevel: input.allowedInferenceLevel,
        minCoverage: input.minCoverage, minIndependentSources: input.minIndependentSources,
        retrievalWeights: (input.retrievalWeights ?? {}) as never,
        freshnessLambda: (input.freshnessLambda ?? {}) as never,
        updatedById: this.userId,
      },
    });
  }

  /** Resolve effective policy: stored course policy over built-in defaults. */
  async effectivePolicy(setId: string): Promise<EffectivePolicy> {
    const p = await this.getPolicy(setId);
    if (!p) return DEFAULT_POLICY;
    const w = (p.retrievalWeights ?? {}) as Partial<RerankWeights>;
    return {
      approvedSources: p.approvedSources, restrictedSources: p.restrictedSources,
      requireTwoSources: p.requireTwoSources, requireCurrentVersion: p.requireCurrentVersion,
      requireHumanReview: p.requireHumanReview, examMode: p.examMode,
      examExternalSources: p.examExternalSources,
      allowedInferenceLevel: (p.allowedInferenceLevel ?? "marked") as EffectivePolicy["allowedInferenceLevel"],
      minCoverage: p.minCoverage, minIndependentSources: p.minIndependentSources,
      weights: { ...DEFAULT_WEIGHTS, ...w },
      lambdas: ((p.freshnessLambda ?? {}) as Record<string, number>),
      configured: true,
    };
  }

  /**
   * Advisory source check: is this citation usable under the policy?
   * Returns { allowed, reason }. Restricted lists exclude; approved lists are
   * advisory unless examMode/requireApprovedOnly makes them restrictive.
   */
  checkSource(
    policy: EffectivePolicy,
    cite: { sourceType: string; sourceKind: string; sourceTitle: string },
    opts?: { examMode?: boolean; approvedOnly?: boolean },
  ): { allowed: boolean; reason: string } {
    const tags = [cite.sourceType, cite.sourceKind, cite.sourceTitle].map((s) => s.toLowerCase());
    const inList = (list: string[]) => list.some((entry) => {
      const e = entry.toLowerCase();
      return tags.some((t) => t === e || (e.length > 2 && t.includes(e)));
    });
    if (inList(policy.restrictedSources)) {
      return { allowed: false, reason: `Source matches restricted list (${policy.restrictedSources.join(", ")}).` };
    }
    const restrictive = opts?.examMode || opts?.approvedOnly;
    if (restrictive && policy.approvedSources.length > 0 && !inList(policy.approvedSources)) {
      return { allowed: false, reason: "Not on the course approved-source list (restrictive mode)." };
    }
    if (!restrictive && policy.approvedSources.length > 0 && !inList(policy.approvedSources)) {
      return { allowed: true, reason: `Advisory: lower-authority source — no approved source addresses this (${policy.approvedSources.join(", ")}).` };
    }
    return { allowed: true, reason: "Source permitted by course policy." };
  }
}
