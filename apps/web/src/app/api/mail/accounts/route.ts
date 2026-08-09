import { NextResponse } from "next/server";
import { actionContext } from "@/lib/action-context";
import { EmailAccountManager, SmtpTransport } from "@n0va/modules-mail";

/**
 * GET /api/mail/accounts
 * List all email accounts for the workspace.
 */
export async function GET() {
  try {
    const { workspaceId } = await actionContext();
    const manager = new EmailAccountManager(workspaceId);
    const accounts = await manager.getAccounts();

    // Mask sensitive config data
    const safeAccounts = accounts.map((a) => ({
      ...a,
      smtpConfig: a.smtpConfig ? { host: a.smtpConfig.host, port: a.smtpConfig.port, user: a.smtpConfig.user, secure: a.smtpConfig.secure } : undefined,
      imapConfig: a.imapConfig ? { host: a.imapConfig.host, port: a.imapConfig.port, user: a.imapConfig.user, secure: a.imapConfig.secure } : undefined,
    }));

    return NextResponse.json({ accounts: safeAccounts });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list accounts" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/mail/accounts
 * Add a new email account with SMTP/IMAP configuration.
 * Body: { email: string, smtpConfig?: { host, port, user, pass, secure }, imapConfig?: { host, port, user, pass, secure }, isDefault?: boolean }
 */
export async function POST(req: Request) {
  try {
    const { workspaceId } = await actionContext();
    const body = await req.json();
    const manager = new EmailAccountManager(workspaceId);

    const account = await manager.addAccount({
      email: body.email,
      smtpConfig: body.smtpConfig,
      imapConfig: body.imapConfig,
      isDefault: body.isDefault,
    });

    return NextResponse.json({
      ...account,
      smtpConfig: account.smtpConfig ? { host: account.smtpConfig.host, port: account.smtpConfig.port, user: account.smtpConfig.user, secure: account.smtpConfig.secure } : undefined,
      imapConfig: account.imapConfig ? { host: account.imapConfig.host, port: account.imapConfig.port, user: account.imapConfig.user, secure: account.imapConfig.secure } : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add account" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/mail/accounts/test
 * Test SMTP/IMAP connection without saving.
 * Body: { smtpConfig?: { host, port, user, pass, secure }, imapConfig?: { host, port, user, pass, secure } }
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const results: { smtp?: { success: boolean; error?: string }; imap?: { success: boolean; error?: string } } = {};

    if (body.smtpConfig) {
      const transport = new SmtpTransport(body.smtpConfig);
      results.smtp = await transport.connect();
    }

    if (body.imapConfig) {
      try {
        const { ImapReceiver } = await import("@n0va/modules-mail");
        const receiver = new ImapReceiver(body.imapConfig);
        const result = await receiver.connectAndFetch({ limit: 1, onEmail: async () => {} });
        results.imap = { success: result.success, error: result.error };
      } catch (err) {
        results.imap = { success: false, error: err instanceof Error ? err.message : "IMAP test failed" };
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Test failed" },
      { status: 500 },
    );
  }
}
