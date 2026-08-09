import { NextResponse } from "next/server";
import { MailEngine, getMailEngine } from "@n0va/modules-mail";
import { actionContext } from "@/lib/action-context";

/**
 * POST /api/mail/send
 * Sends an email via SMTP. Works with any SMTP provider.
 *
 * Body: { to, subject, text?, html?, cc?, bcc?, replyTo? }
 */
export async function POST(req: Request) {
  try {
    const { workspaceId, userId } = await actionContext();
    const body = await req.json();

    const engine = getMailEngine(workspaceId, {
      smtpHost: process.env.SMTP_HOST,
      smtpPort: Number(process.env.SMTP_PORT || 587),
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
      smtpSecure: process.env.SMTP_SECURE === "true",
    });

    // 1. Store in database + run security pipeline + AI analysis
    const result = await engine.sendMail(
      {
        body: "",
        to: Array.isArray(body.to) ? body.to : [body.to],
        subject: body.subject,
        text: body.text,
        html: body.html,
        cc: body.cc,
        bcc: body.bcc,
        replyTo: body.replyTo,
      } as any,
      userId,
    );

    // 2. Actually send via SMTP
    const smtpResult = await engine.sendViaSmtp({
      from: body.from || `outbox@${body.to?.split("@")[1] || "n0va.io"}`,
      to: Array.isArray(body.to) ? body.to : [body.to],
      subject: body.subject,
      text: body.text,
      html: body.html,
      cc: body.cc,
      bcc: body.bcc,
    } as any);

    return NextResponse.json({
      ...result,
      smtp: smtpResult,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Send failed" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/mail/send
 * Returns SMTP configuration status.
 */
export async function GET() {
  const configured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  return NextResponse.json({
    smtpConfigured: configured,
    host: process.env.SMTP_HOST || null,
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || null,
  });
}
