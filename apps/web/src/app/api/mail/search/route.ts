import { NextResponse } from "next/server";
import { actionContext } from "@/lib/action-context";
import { parseSearchQuery, executeSearch, getSearchSuggestions } from "@n0va/modules-mail";

/**
 * POST /api/mail/search
 * Advanced search with operator grammar.
 * Body: { query: string, folder?: string, limit?: number, offset?: number, sortBy?: string }
 */
export async function POST(req: Request) {
  try {
    const { workspaceId } = await actionContext();
    const body = await req.json();

    const searchQuery = parseSearchQuery(body.query || "");
    const results = await executeSearch(searchQuery, {
      workspaceId,
      folder: body.folder,
      limit: body.limit || 50,
      offset: body.offset || 0,
      sortBy: body.sortBy || "relevance",
    });

    return NextResponse.json({
      query: body.query,
      operators: searchQuery.operators,
      freeText: searchQuery.freeText,
      results,
      total: results.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/mail/search/suggestions?q=partial
 * Returns search operator suggestions for autocomplete.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const suggestions = getSearchSuggestions(q);
  return NextResponse.json({ suggestions });
}
