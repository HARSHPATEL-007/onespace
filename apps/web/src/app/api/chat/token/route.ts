import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { NextResponse } from "next/server";
import { SignJWT } from "jose";

/**
 * Generate a short-lived JWT token for WebSocket authentication.
 * The Rust gateway validates this token to identify the user.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get the user's active workspace from the cookie
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const workspaceId = cookieStore.get("n0va.workspace")?.value;

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  // Verify membership
  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: session.user.id, status: "ACTIVE" },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Generate a short-lived token (5 minutes) for WebSocket auth
  const secret =
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "change-me-in-production";
  const key = new TextEncoder().encode(secret);

  const token = await new SignJWT({
    sub: session.user.id,
    workspace_id: workspaceId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);

  return NextResponse.json({
    token,
    workspaceId,
    userId: session.user.id,
    wsUrl: process.env.NEXT_PUBLIC_CHAT_WS_URL || "ws://localhost:8080",
  });
}
