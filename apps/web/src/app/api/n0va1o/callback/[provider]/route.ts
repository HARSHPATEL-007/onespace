import { prisma } from "@n0va/db";
import { N0va1oService } from "@n0va/modules-n0va1o/server";
import { OAUTH_PROVIDERS, verifyOAuthState } from "@n0va/modules-n0va1o/gateway";
import { NextResponse, type NextRequest } from "next/server";

function getEnv() {
  return {
    url: process.env["N0VA1O_PUBLIC_URL"] ?? "http://localhost:3100",
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;

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

  // Verify the signed OAuth state (CSRF protection)
  const stateResult = verifyOAuthState(state);
  if (!stateResult.valid) {
    return NextResponse.json({ error: "Invalid OAuth state — possible CSRF attack" }, { status: 403 });
  }

  const { workspaceId } = stateResult;

  // The state is authenticated. Look up integration by provider + workspace.
  const integration = await prisma.integration.findFirst({
    where: { workspaceId, provider, enabled: true },
  });
  if (!integration) {
    return NextResponse.json({ error: "No active integration found for this provider" }, { status: 404 });
  }

  try {
    const service = new N0va1oService(workspaceId, integration.createdById ?? "", "OWNER");
    const result = await service.handleOAuthCallback(provider, code, state);

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