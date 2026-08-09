import { NextResponse } from "next/server";
import { prisma } from "@n0va/db";
import { getMailEngine } from "@n0va/modules-mail";

/**
 * POST /api/mail/receive
 * Receives an inbound email via webhook (from Mailgun, SendGrid, SES, etc.)
 *
 * Body: { from, to, subject, text, html, headers?, remoteIp? }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { from, to, subject, text, html } = body;

    if (!from || !to || !subject) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const workspaceId = body.workspaceId || "default";
    const engine = getMailEngine(workspaceId);

    // 1. Build raw MIME
    const rawMime = buildRawMime(from, to, subject, text, html);

    // 2. Run full receive pipeline
    const result = await engine.receiveMail(
      rawMime,
      from,
      Array.isArray(to) ? to : [to],
      body.remoteIp || "127.0.0.1",
    );

    // 3. Emit webhook
    await engine.webhooks.emit({
      type: "email.received",
      workspaceId,
      data: { messageId: result.messageId, from, subject },
      timestamp: new Date(),
    });

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Receive failed" },
      { status: 500 },
    );
  }
}

function buildRawMime(from: string, to: string | string[], subject: string, text?: string, html?: string): string {
  const toList = Array.isArray(to) ? to.join(", ") : to;
  let msg = `From: ${from}\r\nTo: ${toList}\r\nSubject: ${subject}\r\nMessage-ID: <${Date.now()}@n0va.io>\r\nDate: ${new Date().toUTCString()}\r\nMIME-Version: 1.0\r\n`;

  if (html) {
    const boundary = `----=_${Date.now()}`;
    msg += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
    msg += `--${boundary}\r\nContent-Type: text/plain; charset="utf-8"\r\n\r\n${text || html.replace(/<[^>]+>/g, "")}\r\n\r\n`;
    msg += `--${boundary}\r\nContent-Type: text/html; charset="utf-8"\r\n\r\n${html}\r\n\r\n--${boundary}--\r\n`;
  } else {
    msg += `Content-Type: text/plain; charset="utf-8"\r\n\r\n${text || ""}\r\n`;
  }

  return msg;
}
