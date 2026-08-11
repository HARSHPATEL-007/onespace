import { z } from "zod";
import { prisma } from "@n0va/db";

const MODULE = "search";

export const searchQuerySchema = z.object({
  query: z.string().min(1).max(500),
  module: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export interface SearchResult {
  id: string;
  module: string;
  title: string;
  snippet: string;
  targetId: string;
  targetType: string;
  createdAt: Date;
  rank: number;
}

export class SearchService {
  constructor(private readonly workspaceId: string) {}

  async search(params: z.infer<typeof searchQuerySchema>) {
    const { query, module, limit, offset } = searchQuerySchema.parse(params);
    const terms = query.trim().split(/\s+/).filter(Boolean);
    const whereClause = terms
      .map((t) => `("title" ILIKE '%${t}%' OR "body" ILIKE '%${t}%')`)
      .join(" AND ");

    const moduleFilter = module ? `AND "module" = '${module}'` : "";

    const results = await prisma.$queryRawUnsafe<Array<{
      id: string;
      module: string;
      title: string;
      snippet: string;
      targetId: string;
      targetType: string;
      createdAt: Date;
      rank: number;
    }>>(
      `SELECT id, module, title, snippet, target_id AS "targetId", target_type AS "targetType", created_at AS "createdAt", ts_rank(search_vector, plainto_tsquery('english', $1)) AS rank
       FROM "SearchIndex"
       WHERE "workspaceId" = $2 AND search_vector @@ plainto_tsquery('english', $1) ${moduleFilter}
       ORDER BY rank DESC
       LIMIT $3 OFFSET $4`,
      query,
      this.workspaceId,
      limit,
      offset,
    );

    return results;
  }

  async index(input: {
    module: string;
    targetType: string;
    targetId: string;
    title: string;
    body?: string;
  }) {
    return prisma.searchIndex.upsert({
      where: { module_targetId: { module: input.module, targetId: input.targetId } },
      update: {
        workspaceId: this.workspaceId,
        title: input.title,
        body: input.body,
        targetType: input.targetType,
        searchVector: undefined,
      },
      create: {
        workspaceId: this.workspaceId,
        module: input.module,
        targetType: input.targetType,
        targetId: input.targetId,
        title: input.title,
        body: input.body,
        searchVector: undefined,
      },
    });
  }

  async remove(module: string, targetId: string) {
    return prisma.searchIndex.deleteMany({
      where: { workspaceId: this.workspaceId, module, targetId },
    });
  }

  async reindex(module?: string) {
    return prisma.searchIndex.deleteMany({
      where: { workspaceId: this.workspaceId, ...(module ? { module } : {}) },
    });
  }
}

export { MODULE };
