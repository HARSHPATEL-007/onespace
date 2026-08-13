import { auth } from "@n0va/auth";
import { NextResponse } from "next/server";
import { getEventBus } from "@/lib/eventbus";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bus = getEventBus();
  const [stats, health] = await Promise.all([bus.stats(), bus.broker.health()]);
  return NextResponse.json({ stats, broker: { name: bus.broker.name, ...health } });
}