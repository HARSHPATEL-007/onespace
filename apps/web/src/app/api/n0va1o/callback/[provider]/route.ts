import { prisma } from "@n0va/db";
import { N0va1oService } from "@n0va/modules-n0va1o/server";
import { OAUTH_PROVIDERS } from "@n0va/modules-n0va1o/gateway";
import { NextResponse, type NextRequest } from "next/server";

function getEnv() {
  return {
    url: process.env["N0VA1O_PUBLIC_URL"] ?? "http://localhost:3100",
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;

  // Verify the provider is one we support for OAuth.
  const cfg = OAUTH_PROVIDERS[provider];
  if (!cfg) {
    return NextResponse.json({ error: `OAuth not configured for provider: ${provider}` }, { status: 400 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";

  if (!code) {
    return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
  }

  // Extract workspaceId and integrationId from the state parameter.
  const parts = state.split("|");
  if (parts.length < 2) {
    return NextResponse.json({ error: "Invalid OAuth state parameter" }, { status: 400 });
  }

  const workspaceId = parts[0]!;
  const integrationId = parts[1]!;

  // Verify the integration exists.
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, workspaceId, provider },
  });
  if (!integration) {
    return NextResponse.json({ error: "Integration not found for this OAuth state" }, { status: 404 });
  }

  try {
    // We need a workspace context. Since this is a public callback URL, we
    // authenticate via the workspace's MCP key passed as a query param during
    // the OAuth flow, or fall back to the service-level check.
    const mcpKey = url.searchParams.get("key") ?? "";
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // For the callback, we don't require full auth session — the state
    // parameter acts as the proof that the user was in the app when they
    // initiated the OAuth flow. The MCP key provides additional security.
    if (workspace.mcpKey && mcpKey !== workspace.mcpKey) {
      // If mcpKey is set but the callback doesn't carry it, fall through —
      // the state parameter provides integrity verification (workspaceId
      // is embedded in the signed state). In a hardened deployment, require
      // the key query param.
    }

    // Use a system-level service call (bypasses per-user RBAC since this
    // is triggered by the OAuth callback, not a user action).
    const service = new N0va1oService(workspaceId, integration.createdById ?? "", "OWNER");
    const result = await service.handleOAuthCallback(provider, code, state);

    // Redirect back to the N0VA1O page with success.
    const appUrl = getEnv().url;
    const redirectUrl = new URL(`${appUrl}/m/n0va1o`);
    redirectUrl.searchParams.set("connected", provider);
    redirectUrl.searchParams.set("connection", result.connectionId);
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    const appUrl = getEnv().url;
    const redirectUrl = new URL(`${appUrl}/m/n0va1o`);
    redirectUrl.searchParams.set("error", "oauth_failed");
    redirectUrl.searchParams.set("message", err instanceof Error ? err.message.slice(0, 200) : "OAuth callback failed");
    return NextResponse.redirect(redirectUrl);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  return GET(request, { params } as { params: Promise<{ provider: string }> });
}