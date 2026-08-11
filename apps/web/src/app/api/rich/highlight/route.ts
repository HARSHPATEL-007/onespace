import { auth } from "@n0va/auth";
import { renderHighlightedCode, getSupportedLanguages } from "@n0va/modules-rich-content/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { code, language, showLineNumbers } = body;

  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const html = renderHighlightedCode(code, language ?? "text", showLineNumbers ?? true);
  return NextResponse.json({ html });
}

export async function GET() {
  return NextResponse.json({ languages: getSupportedLanguages() });
}
