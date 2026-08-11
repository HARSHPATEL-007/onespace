import { auth } from "@n0va/auth";
import { analyzeMessage } from "@n0va/modules-rich-content/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { content } = body;

  if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });

  const result = analyzeMessage(content);
  return NextResponse.json(result);
}
