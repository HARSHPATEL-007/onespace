import { prisma } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "cloud-search";

export interface SearchHit {
  module: string;
  moduleLabel: string;
  id: string;
  title: string;
  snippet: string;
  href: string;
  updatedAt: Date;
}

interface Labels {
  contacts: string;
  "cloud-storage": string;
  keep: string;
  tasks: string;
  docs: string;
  mail: string;
  calendar: string;
  forms: string;
}

const LABELS: Labels = {
  contacts: "CONTACTS",
  "cloud-storage": "CLOUD STORAGE",
  keep: "KEEP",
  tasks: "TASKS",
  docs: "DOCS",
  mail: "MAIL",
  calendar: "CALENDAR",
  forms: "FORMS",
};

function snippet(text: string | null | undefined, query: string, len = 120): string {
  if (!text) return "";
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  const start = idx > 40 ? idx - 40 : 0;
  const out = text.slice(start, start + len).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + out;
}

export class CloudSearchService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert() {
    if (!(await can(this.workspaceId, this.role, MODULE, "READ"))) {
      throw new Error("Missing READ permission for cloud-search");
    }
  }

  async search(query: string, limit = 8): Promise<SearchHit[]> {
    await this.assert();
    const q = query.trim();
    if (q.length < 2) return [];
    const where = { contains: q, mode: "insensitive" as const };
    const hits: SearchHit[] = [];

    const [contacts, notes, tasks, docs, mail, files, events, forms] = await Promise.all([
      prisma.contact.findMany({
        where: { workspaceId: this.workspaceId, OR: [{ firstName: where }, { lastName: where }, { email: where }, { company: where }] },
        take: limit,
      }),
      prisma.note.findMany({
        where: { workspaceId: this.workspaceId, OR: [{ title: where }, { body: where }] },
        take: limit,
      }),
      prisma.task.findMany({
        where: { workspaceId: this.workspaceId, OR: [{ title: where }, { notes: where }] },
        take: limit,
      }),
      prisma.doc.findMany({
        where: { workspaceId: this.workspaceId, OR: [{ title: where }, { content: where }] },
        take: limit,
      }),
      prisma.mailMessage.findMany({
        where: { workspaceId: this.workspaceId, OR: [{ subject: where }, { body: where }, { fromEmail: where }] },
        take: limit,
      }),
      prisma.storageItem.findMany({
        where: { workspaceId: this.workspaceId, name: where },
        take: limit,
      }),
      prisma.calendarEvent.findMany({
        where: { workspaceId: this.workspaceId, OR: [{ title: where }, { description: where }] },
        take: limit,
      }),
      prisma.form.findMany({
        where: { workspaceId: this.workspaceId, name: where },
        take: limit,
      }),
    ]);

    for (const c of contacts) {
      const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ");
      hits.push({ module: "contacts", moduleLabel: LABELS.contacts, id: c.id, title: fullName || c.email || "Contact", snippet: snippet(c.company ?? "", q), href: "/m/contacts", updatedAt: c.updatedAt });
    }
    for (const n of notes) hits.push({ module: "keep", moduleLabel: LABELS.keep, id: n.id, title: n.title || "Untitled note", snippet: snippet(n.body ?? "", q), href: "/m/keep", updatedAt: n.updatedAt });
    for (const t of tasks) hits.push({ module: "tasks", moduleLabel: LABELS.tasks, id: t.id, title: t.title, snippet: snippet(t.notes ?? "", q), href: "/m/tasks", updatedAt: t.updatedAt });
    for (const d of docs) {
      const plain = (d.content ?? "").replace(/"text":"([^"]+)"/g, "$1").replace(/[{}\[\]]/g, " ");
      hits.push({ module: "docs", moduleLabel: LABELS.docs, id: d.id, title: d.title || "Untitled", snippet: snippet(plain, q), href: `/m/docs/${d.id}`, updatedAt: d.updatedAt });
    }
    for (const m of mail) hits.push({ module: "mail", moduleLabel: LABELS.mail, id: m.id, title: m.subject || "(no subject)", snippet: snippet(m.body, q), href: "/m/mail?folder=INBOX", updatedAt: m.sentAt });
    for (const f of files) hits.push({ module: "cloud-storage", moduleLabel: LABELS["cloud-storage"], id: f.id, title: f.name, snippet: "", href: "/m/cloud-storage", updatedAt: f.updatedAt });
    for (const e of events) hits.push({ module: "calendar", moduleLabel: LABELS.calendar, id: e.id, title: e.title, snippet: snippet(e.description ?? "", q), href: "/m/calendar", updatedAt: e.updatedAt });
    for (const fo of forms) hits.push({ module: "forms", moduleLabel: LABELS.forms, id: fo.id, title: fo.name, snippet: snippet(fo.description ?? "", q), href: "/m/forms", updatedAt: fo.updatedAt });

    return hits.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 50);
  }

  async scopes() {
    await this.assert();
    return Object.entries(LABELS).map(([module, label]) => ({ module, label }));
  }
}
