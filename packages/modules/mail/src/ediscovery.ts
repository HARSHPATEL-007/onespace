/**
 * N0VA MAIL — eDiscovery Engine
 * Legal hold, retention policies, and compliance search
 */

import { prisma } from "@n0va/db";

export interface LegalHoldScope {
  users: string[];
  dateRange: { start: Date; end: Date };
  keywords: string[];
  attachmentTypes: string[];
}

export interface LegalHold {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  status: "active" | "released" | "pending";
  createdBy: string;
  scope: LegalHoldScope;
  notifiedCustodians: string[];
  createdAt: Date;
  releasedAt?: Date;
}

export interface RetentionPolicy {
  id: string;
  workspaceId: string;
  name: string;
  retentionPeriodDays: number;
  action: "delete" | "archive" | "review";
  applyTo: "all" | "folder" | "label";
  target?: string;
  enabled: boolean;
}

export interface DiscoveryFilters {
  dateRange?: { start: Date; end: Date };
  senders?: string[];
  recipients?: string[];
  folders?: string[];
  hasAttachments?: boolean;
  labels?: string[];
  aiCategories?: string[];
  aiSentiments?: string[];
}

export class EDiscoveryEngine {
  constructor(private readonly workspaceId: string) {}

  async createLegalHold(input: {
    name: string;
    description: string;
    createdBy: string;
    users: string[];
    dateRange: { start: Date; end: Date };
    keywords: string[];
    attachmentTypes?: string[];
  }): Promise<LegalHold> {
    const hold = await prisma.mailLegalHold.create({
      data: {
        workspaceId: this.workspaceId,
        name: input.name,
        description: input.description,
        createdBy: input.createdBy,
        status: "active",
        scopeUsers: input.users,
        scopeDateStart: input.dateRange.start,
        scopeDateEnd: input.dateRange.end,
        scopeKeywords: input.keywords,
        scopeAttachmentTypes: input.attachmentTypes || [],
        notifiedCustodians: input.users,
      },
    });

    await prisma.mailMessage.updateMany({
      where: {
        workspaceId: this.workspaceId,
        fromEmail: { in: input.users },
        sentAt: { gte: input.dateRange.start, lte: input.dateRange.end },
      },
      data: { legalHold: true },
    });

    return this.mapLegalHold(hold);
  }

  async getLegalHolds(): Promise<LegalHold[]> {
    const holds = await prisma.mailLegalHold.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { createdAt: "desc" },
    });
    return holds.map((h) => this.mapLegalHold(h));
  }

  async releaseLegalHold(holdId: string, releasedBy: string): Promise<LegalHold> {
    const hold = await prisma.mailLegalHold.update({
      where: { id: holdId },
      data: { status: "released", releasedAt: new Date(), releasedBy },
    });
    return this.mapLegalHold(hold);
  }

  async checkMessageUnderHold(messageId: string): Promise<boolean> {
    const holds = await prisma.mailLegalHold.findMany({
      where: { workspaceId: this.workspaceId, status: "active" },
    });
    const message = await prisma.mailMessage.findFirst({
      where: { id: messageId, workspaceId: this.workspaceId },
    });
    if (!message) return false;

    for (const hold of holds) {
      const inDateRange = message.sentAt >= hold.scopeDateStart && message.sentAt <= hold.scopeDateEnd;
      const matchesKeywords = hold.scopeKeywords.length === 0 || hold.scopeKeywords.some(
        (kw: string) => message.subject.toLowerCase().includes(kw.toLowerCase()) || message.body.toLowerCase().includes(kw.toLowerCase()),
      );
      if (inDateRange && matchesKeywords) return true;
    }
    return false;
  }

  async createRetentionPolicy(input: {
    name: string;
    retentionPeriodDays: number;
    action: "delete" | "archive" | "review";
    applyTo: "all" | "folder" | "label";
    target?: string;
  }): Promise<RetentionPolicy> {
    const policy = await prisma.mailRetentionPolicy.create({
      data: {
        workspaceId: this.workspaceId,
        name: input.name,
        retentionPeriodDays: input.retentionPeriodDays,
        action: input.action,
        applyTo: input.applyTo,
        target: input.target ?? "",
        enabled: true,
      },
    });
    return this.mapRetentionPolicy(policy);
  }

  async getRetentionPolicies(): Promise<RetentionPolicy[]> {
    const policies = await prisma.mailRetentionPolicy.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { createdAt: "desc" },
    });
    return policies.map((p) => this.mapRetentionPolicy(p));
  }

  async applyRetentionPolicies(): Promise<{ archived: number; deleted: number; flagged: number }> {
    const policies = await prisma.mailRetentionPolicy.findMany({
      where: { workspaceId: this.workspaceId, enabled: true },
    });
    let archived = 0, deleted = 0, flagged = 0;

    for (const policy of policies) {
      const cutoff = new Date(Date.now() - policy.retentionPeriodDays * 86400000);
      const where: Record<string, unknown> = {
        workspaceId: this.workspaceId,
        sentAt: { lt: cutoff },
        legalHold: false,
      };
      if (policy.applyTo === "folder" && policy.target) where.folder = policy.target;

      const messages = await prisma.mailMessage.findMany({ where });
      for (const msg of messages) {
        const underHold = await this.checkMessageUnderHold(msg.id);
        if (underHold) continue;
        if (policy.action === "archive") {
          await prisma.mailMessage.update({ where: { id: msg.id }, data: { folder: "ARCHIVE" } });
          archived++;
        } else if (policy.action === "delete") {
          await prisma.mailMessage.delete({ where: { id: msg.id } });
          deleted++;
        } else {
          await prisma.mailMessage.update({ where: { id: msg.id }, data: { retentionReview: true } });
          flagged++;
        }
      }
    }
    return { archived, deleted, flagged };
  }

  async createDiscoverySearch(input: {
    name: string;
    query: string;
    filters: DiscoveryFilters;
  }): Promise<{ id: string; name: string; resultsCount: number }> {
    const results = await this._executeSearch(input.query, input.filters);
    const search = await prisma.mailDiscoverySearch.create({
      data: {
        workspaceId: this.workspaceId,
        name: input.name,
        query: input.query,
        filters: JSON.stringify(input.filters),
        resultsCount: results.length,
      } as never,
    });
    return { id: search.id, name: search.name, resultsCount: search.resultsCount };
  }

  async getDiscoverySearches(): Promise<Array<{ id: string; name: string; query: string; resultsCount: number; savedAt: Date }>> {
    const searches = await prisma.mailDiscoverySearch.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { createdAt: "desc" },
    });
    return searches.map((s) => ({ id: s.id, name: s.name, query: s.query, resultsCount: s.resultsCount, savedAt: s.createdAt }));
  }

  async runDiscoverySearch(searchId: string): Promise<{
    results: Array<{ id: string; subject: string; fromEmail: string; sentAt: Date; snippet: string }>;
    totalCount: number;
  }> {
    const search = await prisma.mailDiscoverySearch.findFirst({
      where: { id: searchId, workspaceId: this.workspaceId },
    });
    if (!search) throw new Error("Discovery search not found");
    const filters = JSON.parse(search.filters as string) as DiscoveryFilters;
    const results = await this._executeSearch(search.query, filters);
    return {
      results: results.map((m) => ({
        id: m.id, subject: m.subject, fromEmail: m.fromEmail, sentAt: m.sentAt, snippet: m.body.slice(0, 200),
      })),
      totalCount: results.length,
    };
  }

  private async _executeSearch(query: string, filters: DiscoveryFilters): Promise<Array<{ id: string; subject: string; fromEmail: string; sentAt: Date; body: string }>> {
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    const and: Record<string, unknown>[] = [];

    if (query) {
      and.push({
        OR: [
          { subject: { contains: query, mode: "insensitive" } },
          { body: { contains: query, mode: "insensitive" } },
        ],
      });
    }
    if (filters.dateRange) {
      and.push({ sentAt: { gte: filters.dateRange.start, lte: filters.dateRange.end } });
    }
    if (filters.senders?.length) {
      and.push({ fromEmail: { in: filters.senders } });
    }
    if (filters.folders?.length) {
      and.push({ folder: { in: filters.folders } });
    }
    if (filters.aiCategories?.length) {
      and.push({ aiCategory: { in: filters.aiCategories } });
    }
    if (filters.aiSentiments?.length) {
      and.push({ aiSentiment: { in: filters.aiSentiments } });
    }
    if (and.length > 0) where.AND = and;

    return prisma.mailMessage.findMany({ where: where as never, orderBy: { sentAt: "desc" } });
  }

  private mapLegalHold(hold: {
    id: string; workspaceId: string; name: string; description: string; status: string; createdBy: string;
    scopeUsers: string[]; scopeKeywords: string[]; notifiedCustodians: string[]; createdAt: Date; releasedAt?: Date | null;
    scopeDateStart: Date; scopeDateEnd: Date; scopeAttachmentTypes: string[];
  }): LegalHold {
    return {
      id: hold.id, workspaceId: hold.workspaceId, name: hold.name, description: hold.description,
      status: hold.status as "active" | "released" | "pending", createdBy: hold.createdBy,
      notifiedCustodians: hold.notifiedCustodians, createdAt: hold.createdAt, releasedAt: hold.releasedAt ?? undefined,
      scope: {
        users: hold.scopeUsers, keywords: hold.scopeKeywords, attachmentTypes: hold.scopeAttachmentTypes,
        dateRange: { start: hold.scopeDateStart, end: hold.scopeDateEnd },
      },
    };
  }

  private mapRetentionPolicy(policy: {
    id: string; workspaceId: string; name: string; retentionPeriodDays: number; action: string; applyTo: string; target?: string | null; enabled: boolean;
  }): RetentionPolicy {
    return {
      id: policy.id, workspaceId: policy.workspaceId, name: policy.name,
      retentionPeriodDays: policy.retentionPeriodDays, action: policy.action as "delete" | "archive" | "review",
      applyTo: policy.applyTo as "all" | "folder" | "label", target: policy.target ?? undefined, enabled: policy.enabled,
    };
  }
}
