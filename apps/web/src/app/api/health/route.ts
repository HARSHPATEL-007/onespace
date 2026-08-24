import { NextResponse } from "next/server";
import { prisma } from "@n0va/db";

export async function GET() {
  const started = Date.now();
  let db: "up" | "down" = "down";
  let redis: "up" | "down" | "unknown" = "unknown";
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "up";
  } catch {
    db = "down";
  }
  try {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    const { createClient } = await import("redis");
    const c = createClient({ url, socket: { connectTimeout: 1200 } });
    await c.connect();
    await c.ping();
    await c.quit();
    redis = "up";
  } catch {
    redis = "down";
  }
  const ok = db === "up";
  return NextResponse.json(
    { ok, db, redis, uptimeMs: Date.now() - started, version: process.env.npm_package_version ?? "0.1.0", timestamp: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
