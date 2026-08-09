// Type declarations for packages without @types
declare module "imap" {
  interface ImapConfig {
    user: string;
    password: string;
    host: string;
    port: number;
    tls?: boolean;
    tlsOptions?: { rejectUnauthorized?: boolean };
    autotls?: string;
    connTimeout?: number;
    authTimeout?: number;
    keepalive?: boolean | { interval?: number; idleInterval?: number; forceNoop?: boolean };
  }

  interface ImapMessage {
    on(event: string, callback: (...args: unknown[]) => void): void;
    once(event: string, callback: (...args: unknown[]) => void): void;
  }

  interface ImapFetch {
    on(event: string, callback: (...args: unknown[]) => void): void;
    once(event: string, callback: (...args: unknown[]) => void): void;
  }

  class Imap {
    constructor(config: ImapConfig);
    connect(): void;
    openBox(name: string, readOnly: boolean, callback: (err: Error | null, box: unknown) => void): void;
    search(criteria: unknown[], callback: (err: Error | null, results: number[]) => void): void;
    seq: { fetch(seq: number | number[], options: { bodies: string; struct: boolean; markSeen: boolean }): ImapFetch };
    end(): void;
    once(event: string, callback: (...args: unknown[]) => void): void;
    on(event: string, callback: (...args: unknown[]) => void): void;
  }

  export default Imap;
}

declare module "mailparser" {
  interface ParsedMail {
    messageId?: string;
    from?: { text: string; value: Array<{ address: string; name: string }> };
    to?: { text: string; value: Array<{ address: string; name: string }> };
    subject?: string;
    text?: string;
    html?: string;
    date?: Date;
    attachments?: Array<{
      filename?: string;
      content: Buffer;
      contentType: string;
    }>;
  }

  export function simpleParser(source: string): Promise<ParsedMail>;
}
