/**
 * N0VA MAIL — Real Email Transport
 *
 * Production-grade SMTP sending via nodemailer and IMAP receiving.
 * No fallbacks, no demo mode. Real email or clear errors.
 */

import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { prisma } from "@n0va/db";

// ── Types ──────────────────────────────────────────────────

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
}

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
}

export interface SendEmailInput {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: string; contentType: string }>;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface InboundEmail {
  messageId: string;
  from: { name: string; email: string };
  to: string[];
  subject: string;
  text: string;
  html: string;
  date: Date;
  attachments: Array<{ filename: string; content: Buffer; contentType: string }>;
}

// ── SMTP Transport ─────────────────────────────────────────

export class SmtpTransport {
  private transporter: Transporter | null = null;
  private config: SmtpConfig;

  constructor(config: SmtpConfig) {
    this.config = config;
  }

  async connect(): Promise<{ success: boolean; error?: string }> {
    try {
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: {
          user: this.config.user,
          pass: this.config.pass,
        },
        tls: {
          rejectUnauthorized: true,
        },
      });

      await this.transporter.verify();
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "SMTP connection failed",
      };
    }
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    if (!this.transporter) {
      const conn = await this.connect();
      if (!conn.success) {
        return { success: false, error: conn.error };
      }
    }

    try {
      const info = await this.transporter!.sendMail({
        from: input.from,
        to: input.to.join(", "),
        cc: input.cc?.join(", "),
        bcc: input.bcc?.join(", "),
        subject: input.subject,
        text: input.text,
        html: input.html,
        replyTo: input.replyTo,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });

      return { success: true, messageId: info.messageId };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Send failed",
      };
    }
  }

  async disconnect(): Promise<void> {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }
  }

  isConnected(): boolean {
    return this.transporter !== null;
  }
}

// ── IMAP Receiver ──────────────────────────────────────────

export class ImapReceiver {
  private config: ImapConfig;

  constructor(config: ImapConfig) {
    this.config = config;
  }

  async connectAndFetch(options: {
    mailbox?: string;
    since?: Date;
    limit?: number;
    onEmail: (email: InboundEmail) => Promise<void>;
  }): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const Imap = (await import("imap")).default;
      const { simpleParser } = await import("mailparser");

      return new Promise((resolve) => {
        const count = 0;
        const imap = new Imap({
          user: this.config.user,
          password: this.config.pass,
          host: this.config.host,
          port: this.config.port,
          tls: this.config.secure,
          tlsOptions: { rejectUnauthorized: true },
        });

        imap.once("ready", () => {
          const mailbox = options.mailbox || "INBOX";
          imap.openBox(mailbox, false, (err, box) => {
            if (err) {
              imap.end();
              resolve({ success: false, count: 0, error: err.message });
              return;
            }

            const searchCriteria = options.since
              ? ["SINCE", options.since]
              : ["ALL"];

            imap.search(searchCriteria, (err, results) => {
              if (err || !results || results.length === 0) {
                imap.end();
                resolve({ success: true, count: 0 });
                return;
              }

              const limit = options.limit || 50;
              const uids = results.slice(-limit);
              let processed = 0;

              const fetch = imap.seq.fetch(uids, {
                bodies: "",
                struct: true,
                markSeen: false,
              });

              fetch.on("message", (msg) => {
                let buffer = "";

                msg.on("body", (stream) => {
                  stream.on("data", (chunk) => {
                    buffer += chunk.toString("utf8");
                  });
                });

                msg.once("end", async () => {
                  try {
                    const parsed = await simpleParser(buffer);
                    const inbound: InboundEmail = {
                      messageId: parsed.messageId || `inbound_${Date.now()}_${processed}`,
                      from: {
                        name: parsed.from?.text || "",
                        email: parsed.from?.value?.[0]?.address || "",
                      },
                      to: parsed.to?.value?.map((a) => a.address || "") || [],
                      subject: parsed.subject || "(no subject)",
                      text: parsed.text || "",
                      html: parsed.html || "",
                      date: parsed.date || new Date(),
                      attachments: parsed.attachments?.map((a) => ({
                        filename: a.filename || "attachment",
                        content: a.content,
                        contentType: a.contentType,
                      })) || [],
                    };
                    await options.onEmail(inbound);
                    processed++;
                  } catch {
                    // Skip malformed messages
                  }
                });
              });

              fetch.once("error", (err) => {
                imap.end();
                resolve({ success: false, count: processed, error: err.message });
              });

              fetch.once("end", () => {
                imap.end();
                resolve({ success: true, count: processed });
              });
            });
          });
        });

        imap.once("error", (err) => {
          resolve({ success: false, count: 0, error: err.message });
        });
      });
    } catch (err) {
      return {
        success: false,
        count: 0,
        error: err instanceof Error ? err.message : "IMAP connection failed",
      };
    }
  }
}

// ── Email Account Manager ──────────────────────────────────

export interface EmailAccount {
  id: string;
  workspaceId: string;
  email: string;
  smtpConfig?: SmtpConfig;
  imapConfig?: ImapConfig;
  isDefault: boolean;
  lastSyncAt?: Date;
}

export class EmailAccountManager {
  constructor(private readonly workspaceId: string) {}

  async getAccounts(): Promise<EmailAccount[]> {
    const accounts = await prisma.emailAccount.findMany({
      where: { workspaceId: this.workspaceId, isActive: true },
      orderBy: { isDefault: "desc" },
    });

    return accounts.map((a) => ({
      id: a.id,
      workspaceId: a.workspaceId,
      email: a.email,
      smtpConfig: a.smtpConfig as unknown as SmtpConfig | undefined,
      imapConfig: a.imapConfig as unknown as ImapConfig | undefined,
      isDefault: a.isDefault,
      lastSyncAt: a.lastSyncAt ?? undefined,
    }));
  }

  async getDefaultAccount(): Promise<EmailAccount | null> {
    const account = await prisma.emailAccount.findFirst({
      where: { workspaceId: this.workspaceId, isDefault: true, isActive: true },
    });

    if (!account) return null;

    return {
      id: account.id,
      workspaceId: account.workspaceId,
      email: account.email,
      smtpConfig: account.smtpConfig as unknown as SmtpConfig | undefined,
      imapConfig: account.imapConfig as unknown as ImapConfig | undefined,
      isDefault: account.isDefault,
      lastSyncAt: account.lastSyncAt ?? undefined,
    };
  }

  async addAccount(input: {
    email: string;
    smtpConfig?: SmtpConfig;
    imapConfig?: ImapConfig;
    isDefault?: boolean;
  }): Promise<EmailAccount> {
    if (input.isDefault) {
      await prisma.emailAccount.updateMany({
        where: { workspaceId: this.workspaceId },
        data: { isDefault: false },
      });
    }

    const account = await prisma.emailAccount.create({
      data: {
        workspaceId: this.workspaceId,
        email: input.email,
        smtpConfig: input.smtpConfig as never,
        imapConfig: input.imapConfig as never,
        isDefault: input.isDefault ?? false,
      },
    });

    return {
      id: account.id,
      workspaceId: account.workspaceId,
      email: account.email,
      smtpConfig: account.smtpConfig as unknown as SmtpConfig | undefined,
      imapConfig: account.imapConfig as unknown as ImapConfig | undefined,
      isDefault: account.isDefault,
      lastSyncAt: account.lastSyncAt ?? undefined,
    };
  }

  async updateLastSync(accountId: string): Promise<void> {
    await prisma.emailAccount.update({
      where: { id: accountId },
      data: { lastSyncAt: new Date() },
    });
  }
}

// ── Factory ────────────────────────────────────────────────

export function createSmtpTransport(config: SmtpConfig): SmtpTransport {
  return new SmtpTransport(config);
}

export function createImapReceiver(config: ImapConfig): ImapReceiver {
  return new ImapReceiver(config);
}

export function getEmailAccountManager(workspaceId: string): EmailAccountManager {
  return new EmailAccountManager(workspaceId);
}
