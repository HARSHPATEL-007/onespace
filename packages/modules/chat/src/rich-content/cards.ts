/**
 * Card Renderer Spec — secure, compact-by-default, expand-on-demand
 * Block-kit style JSON that renders consistently across desktop/mobile/presentation.
 * Renderer layer must sanitize, never execute scripts.
 */

export type CardIcon = string;

export interface CardField {
  label: string;
  value: string;
  truncate?: number; // max chars
}

export interface CardAction {
  id: string; // stable action_id
  label: string;
  style: "primary" | "secondary" | "destructive" | "ghost";
  value?: string;
  confirm?: { title: string; text: string; confirmLabel?: string };
  // provenance: who can trigger, who did trigger
  requiresRole?: string;
  provenance?: string; // "Triggered by <name> at <time>"
}

export interface CardSelectOption { label: string; value: string; icon?: string; }

export interface CardSelect {
  id: string;
  placeholder: string;
  options: CardSelectOption[];
  value?: string;
}

export interface CardDatePicker {
  id: string;
  placeholder: string;
  initialDate?: string; // ISO
  value?: string;
}

export interface RichCard {
  version: 1;
  id: string; // url or objectId
  kind: string; // n0va_doc | og | github | etc
  collapsed: boolean; // default compact
  icon: CardIcon;
  title: string;
  summaryLine: string; // one clear summary per UX rule
  description?: string | null;
  imageUrl?: string | null;
  siteName?: string | null;
  fields: CardField[]; // optional structured fields (compact preview shows 1-2)
  actions: CardAction[]; // max 1 primary per UX rule, others secondary/ghost
  selects?: CardSelect[];
  datePickers?: CardDatePicker[];
  // Trust metadata
  source: { url: string; domain?: string; objectType?: string; objectId?: string; fetchedAt?: string };
  // Policy badges
  policy?: { watermark?: boolean; retention?: string | null; classification?: string | null };
  // Provenance for interactive actions
  provenance?: { actorId?: string; actorName?: string; triggeredAt?: string };
}

export function toCardFromPreview(
  preview: { url: string; kind: string; title: string | null; description: string | null; imageUrl: string | null; siteName: string | null; structured: Record<string, unknown> | null; fetchedAt: string },
  opts: { collapsed: boolean; policy?: RichCard["policy"]; sourceDomain?: string },
): RichCard {
  const icon = iconForKind(preview.kind);
  const fields: CardField[] = [];
  const actions: CardAction[] = [];
  const s = preview.structured ?? {};

  // Build one clear summary line (UX rule)
  let summaryLine = preview.title ?? preview.description?.slice(0, 80) ?? preview.url;
  const site = preview.siteName ?? opts.sourceDomain ?? "";

  // Kind-specific fields and primary action
  switch (preview.kind) {
    case "n0va_doc": {
      fields.push({ label: "Author", value: String(s.author ?? "—") });
      fields.push({ label: "Last edit", value: s.lastEdit ? new Date(String(s.lastEdit)).toLocaleDateString() : "—" });
      if (s.excerpt) fields.push({ label: "Excerpt", value: String(s.excerpt).slice(0, 160) });
      actions.push({ id: "open", label: "Open", style: "primary", value: preview.url });
      break;
    }
    case "n0va_sheet": {
      fields.push({ label: "Updated", value: s.freshness ? new Date(String(s.freshness)).toLocaleDateString() : "—" });
      fields.push({ label: "Range", value: String(s.rangePreview ?? "—") });
      actions.push({ id: "open", label: "Open sheet", style: "primary", value: preview.url });
      break;
    }
    case "n0va_task": {
      fields.push({ label: "Status", value: String(s.status ?? "open") });
      fields.push({ label: "Priority", value: String(s.priority ?? "MEDIUM") });
      if (s.dueDate) fields.push({ label: "Due", value: new Date(String(s.dueDate)).toLocaleDateString() });
      if (String(s.status) !== "done") actions.push({ id: "open", label: "Open task", style: "primary", value: preview.url });
      break;
    }
    case "n0va_meeting": {
      fields.push({ label: "When", value: s.startAt ? new Date(String(s.startAt)).toLocaleString() : "—" });
      fields.push({ label: "Attendees", value: String(Array.isArray(s.attendees) ? `${(s.attendees as unknown[]).length} attendees` : "—") });
      actions.push({ id: "open", label: "Open meeting", style: "primary", value: preview.url });
      break;
    }
    case "n0va_crm": {
      if (s.company) fields.push({ label: "Company", value: String(s.company) });
      if (s.email) fields.push({ label: "Email", value: String(s.email) });
      if (s.stage) fields.push({ label: "Stage", value: String(s.stage) });
      if (s.value) fields.push({ label: "Value", value: String(s.value) });
      actions.push({ id: "open", label: "Open", style: "primary", value: preview.url });
      break;
    }
    case "n0va_file": {
      fields.push({ label: "Type", value: String(s.mimeType ?? "file") });
      fields.push({ label: "Size", value: s.sizeBytes ? `${(Number(s.sizeBytes)/1024).toFixed(1)} KB` : "—" });
      actions.push({ id: "open", label: "Open file", style: "primary", value: preview.url });
      break;
    }
    case "n0va_approval": {
      fields.push({ label: "Type", value: String(s.requestType ?? "GENERAL") });
      fields.push({ label: "Status", value: String(s.status ?? "PENDING") });
      if (s.amount) fields.push({ label: "Amount", value: String(s.amount) });
      actions.push({ id: "approve", label: "Approve", style: "primary", value: String(s.objectId ?? preview.url), confirm: { title: "Confirm approval", text: "Approve this request?" } });
      actions.push({ id: "reject", label: "Reject", style: "secondary", value: String(s.objectId ?? preview.url) });
      break;
    }
    case "github":
    case "jira":
    case "og":
    default: {
      // Generic web preview: one summary line + one primary action "Open"
      if (preview.description) summaryLine = preview.description.slice(0, 120);
      actions.push({ id: "open", label: site ? `Open on ${site}` : "Open", style: "secondary", value: preview.url });
      break;
    }
  }

  // UX: avoid over-wide cards — trim title, keep fields to 2-3 in collapsed mode
  const title = (preview.title ?? summaryLine).slice(0, 80);
  const description = preview.description ? preview.description.slice(0, 200) : null;

  return {
    version: 1,
    id: preview.url,
    kind: preview.kind,
    collapsed: opts.collapsed,
    icon,
    title,
    summaryLine: summaryLine.slice(0, 120),
    description,
    imageUrl: preview.imageUrl,
    siteName: preview.siteName,
    fields: opts.collapsed ? fields.slice(0, 2) : fields.slice(0, 4),
    actions: limitActions(actions),
    source: { url: preview.url, domain: opts.sourceDomain, objectType: s.objectType ? String(s.objectType) : undefined, objectId: s.objectId ? String(s.objectId) : undefined, fetchedAt: preview.fetchedAt },
    policy: opts.policy,
  };
}

function iconForKind(kind: string): string {
  switch (kind) {
    case "n0va_doc": return "📄";
    case "n0va_sheet": return "📊";
    case "n0va_task": return "✅";
    case "n0va_meeting": return "📅";
    case "n0va_crm": return "👤";
    case "n0va_file": return "📎";
    case "n0va_approval": return "✔️";
    case "github": return "🐙";
    case "jira": return "🎫";
    default: return "🔗";
  }
}

function limitActions(actions: CardAction[]): CardAction[] {
  if (actions.length <= 2) return actions;
  // UX: one primary, rest secondary/ghost, max 3 visible (others in overflow)
  const primary = actions.find((a) => a.style === "primary");
  const rest = actions.filter((a) => a !== primary);
  const limited = primary ? [primary, ...rest.slice(0, 2)] : rest.slice(0, 3);
  return limited;
}

// For interactive messages (buttons/selects/date pickers), render as card actions:
export function interactiveToCard(interactive: {
  id: string;
  title: string;
  summaryLine: string;
  kind: "approval" | "task" | "poll" | "generic";
  fields?: CardField[];
  actions: CardAction[];
  selects?: CardSelect[];
  datePickers?: CardDatePicker[];
  provenance?: RichCard["provenance"];
}): RichCard {
  return {
    version: 1,
    id: interactive.id,
    kind: `interactive_${interactive.kind}`,
    collapsed: false,
    icon: interactive.kind === "approval" ? "✔️" : interactive.kind === "poll" ? "📊" : "▫️",
    title: interactive.title.slice(0, 80),
    summaryLine: interactive.summaryLine.slice(0, 120),
    fields: (interactive.fields ?? []).slice(0, 4),
    actions: limitActions(interactive.actions),
    selects: interactive.selects,
    datePickers: interactive.datePickers,
    source: { url: interactive.id },
    provenance: interactive.provenance,
  };
}
