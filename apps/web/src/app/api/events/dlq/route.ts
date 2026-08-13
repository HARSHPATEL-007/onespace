import { auth } from "@n0va/auth";
import { NextResponse } from "next/server";
import { dlqItems, retryDlqItem } from "@n0va/modules-events/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ items: await dlqItems(100) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const ok = await retryDlqItem(id);
  return NextResponse.json({ ok });
}