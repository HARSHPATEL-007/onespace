import { auth } from "@n0va/auth";
import { unfurlUrl } from "@n0va/modules-rich-content/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const url: string | undefined = body.url;

  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  try {
    const result = await unfurlUrl(url);
    if (!result) return NextResponse.json({ error: "Could not unfurl URL" }, { status: 404 });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unfurl failed" }, { status: 500 });
  }
}
