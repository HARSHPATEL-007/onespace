"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  Dropdown,
  Field,
  Input,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Textarea,
  cn,
} from "@n0va/ui";
import type { Contact } from "@n0va/db";

export interface ContactActions {
  create: (formData: FormData) => Promise<void>;
  update: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
  toggleFavorite: (formData: FormData) => Promise<void>;
}

export function ContactsApp({
  initialContacts,
  actions,
}: {
  initialContacts: Contact[];
  actions: ContactActions;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; contact: Contact } | null>(null);
  const [selected, setSelected] = useState<Contact | null>(null);

  const contacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialContacts.filter((c) => {
      if (favoriteOnly && !c.isFavorite) return false;
      if (!q) return true;
      return [c.firstName, c.lastName, c.email, c.company, c.title].some((v) => v?.toLowerCase().includes(q));
    });
  }, [initialContacts, search, favoriteOnly]);

  const refresh = () => router.refresh();

  const exportCsv = () => {
    const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
    const rows = [
      ["firstName", "lastName", "email", "phone", "company", "title", "labels", "notes"],
      ...contacts.map((c) => [
        c.firstName,
        c.lastName ?? "",
        c.email ?? "",
        c.phone ?? "",
        c.company ?? "",
        c.title ?? "",
        c.labels.join("; "),
        c.notes ?? "",
      ]),
    ];
    const blob = new Blob([rows.map((r) => r.map(escape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "contacts.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA CONTACTS</h1>
        <div style={{ flex: 1 }} />
        <Input
          placeholder="Search contacts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 260 }}
        />
        <Button
          variant={favoriteOnly ? "primary" : "secondary"}
          size="sm"
          onClick={() => setFavoriteOnly((v) => !v)}
        >
          ★ Favorites
        </Button>
        <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
          + New contact
        </Button>
        <Button variant="secondary" size="sm" onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      <div className="nv-card">
        {contacts.length === 0 ? (
          <div className="nv-empty">
            <div>No contacts found</div>
            <div style={{ fontSize: "var(--nv-font-xs)" }}>Create your first contact to get started.</div>
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Company</TableHeaderCell>
                <TableHeaderCell>Labels</TableHeaderCell>
                <TableHeaderCell style={{ width: 110 }}></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>
                    <div onClick={() => setSelected(contact)} style={{ cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Avatar name={`${contact.firstName} ${contact.lastName ?? ""}`} size="sm" />
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            {contact.firstName} {contact.lastName}
                            {contact.isFavorite ? <span style={{ color: "var(--nv-color-warning)" }}> ★</span> : null}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{contact.title}</div>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div onClick={() => setSelected(contact)} style={{ cursor: "pointer" }}>
                      {contact.email ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div onClick={() => setSelected(contact)} style={{ cursor: "pointer" }}>
                      {contact.company ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div onClick={() => setSelected(contact)} style={{ cursor: "pointer" }}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {contact.labels.map((label) => (
                          <Badge key={label}>{label}</Badge>
                        ))}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Dropdown
                      trigger={<Button variant="ghost" size="sm">⋯</Button>}
                    >
                      <form action={actions.toggleFavorite} onSubmit={() => setTimeout(refresh, 50)}>
                        <input type="hidden" name="id" value={contact.id} />
                        <MenuItem>{contact.isFavorite ? "Remove favorite" : "Add favorite"}</MenuItem>
                      </form>
                      <MenuItem onSelect={() => setDialog({ mode: "edit", contact })}>Edit</MenuItem>
                      <form action={actions.remove} onSubmit={() => setTimeout(refresh, 50)}>
                        <input type="hidden" name="id" value={contact.id} />
                        <MenuItem danger>Delete</MenuItem>
                      </form>
                    </Dropdown>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <ContactDialog
        key={dialog?.mode === "edit" ? dialog.contact.id : dialog?.mode ?? "none"}
        mode={dialog?.mode ?? null}
        contact={dialog?.mode === "edit" ? dialog.contact : null}
        actions={actions}
        onClose={() => {
          setDialog(null);
          refresh();
        }}
      />

      <ContactDetailDrawer
        contact={selected}
        actions={actions}
        onClose={() => setSelected(null)}
        onEdit={() => {
          if (selected) setDialog({ mode: "edit", contact: selected });
          setSelected(null);
        }}
        onDeleted={() => {
          setSelected(null);
          refresh();
        }}
      />
    </div>
  );
}

function ContactDialog({
  mode,
  contact,
  actions,
  onClose,
}: {
  mode: "create" | "edit" | null;
  contact: Contact | null;
  actions: ContactActions;
  onClose: () => void;
}) {
  const action = mode === "edit" ? actions.update : actions.create;
  const title = mode === "edit" ? "Edit contact" : "New contact";

  return (
    <Dialog
      open={mode !== null}
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="contact-form">
            {mode === "edit" ? "Save changes" : "Create contact"}
          </Button>
        </>
      }
    >
      <form
        id="contact-form"
        action={action}
        onSubmit={() => setTimeout(onClose, 50)}
      >
        <input type="hidden" name="id" value={contact?.id ?? ""} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--nv-space-3)" }}>
          <Field label="First name">
            <Input name="firstName" required defaultValue={contact?.firstName ?? ""} />
          </Field>
          <Field label="Last name">
            <Input name="lastName" defaultValue={contact?.lastName ?? ""} />
          </Field>
        </div>
        <Field label="Email">
          <Input type="email" name="email" defaultValue={contact?.email ?? ""} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--nv-space-3)" }}>
          <Field label="Company">
            <Input name="company" defaultValue={contact?.company ?? ""} />
          </Field>
          <Field label="Title">
            <Input name="title" defaultValue={contact?.title ?? ""} />
          </Field>
        </div>
        <Field label="Labels (comma separated)">
          <Input name="labels" defaultValue={contact?.labels.join(", ") ?? ""} placeholder="team, client, vip" />
        </Field>
        <Field label="Notes">
          <Textarea name="notes" rows={3} defaultValue={contact?.notes ?? ""} />
        </Field>
      </form>
    </Dialog>
  );
}

function ContactDetailDrawer({
  contact,
  actions,
  onClose,
  onEdit,
  onDeleted,
}: {
  contact: Contact | null;
  actions: ContactActions;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  if (!contact) return null;
  const fullName = `${contact.firstName} ${contact.lastName ?? ""}`.trim();
  const orgLine = [contact.title, contact.company].filter(Boolean).join(" @ ");
  return (
    <div
      className="nv-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={fullName}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(400px, calc(100vw - 24px))",
          background: "var(--nv-color-surface)",
          borderLeft: "1px solid var(--nv-color-border)",
          boxShadow: "var(--nv-shadow-lg)",
          padding: "var(--nv-space-5)",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: "var(--nv-space-4)" }}>
          <span style={{ fontSize: "var(--nv-font-lg)", fontWeight: 700 }}>Contact details</span>
          <div style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-4)" }}>
          <Avatar name={fullName} size="lg" />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "var(--nv-font-lg)", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {contact.firstName} {contact.lastName}
              {contact.isFavorite ? <span style={{ color: "var(--nv-color-warning)" }}> ★</span> : null}
            </div>
            {orgLine ? <div style={{ fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-faint)" }}>{orgLine}</div> : null}
          </div>
        </div>
        {contact.email ? (
          <div style={{ marginBottom: "var(--nv-space-3)" }}>
            <div style={{ fontSize: "var(--nv-font-xs)", fontWeight: 600, color: "var(--nv-color-text-faint)", marginBottom: 2 }}>Email</div>
            <a href={`mailto:${contact.email}`} className="nv-link">{contact.email}</a>
          </div>
        ) : null}
        {contact.phone ? (
          <div style={{ marginBottom: "var(--nv-space-3)" }}>
            <div style={{ fontSize: "var(--nv-font-xs)", fontWeight: 600, color: "var(--nv-color-text-faint)", marginBottom: 2 }}>Phone</div>
            <div>{contact.phone}</div>
          </div>
        ) : null}
        {contact.labels.length > 0 ? (
          <div style={{ marginBottom: "var(--nv-space-3)" }}>
            <div style={{ fontSize: "var(--nv-font-xs)", fontWeight: 600, color: "var(--nv-color-text-faint)", marginBottom: 4 }}>Labels</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {contact.labels.map((label) => (
                <Badge key={label}>{label}</Badge>
              ))}
            </div>
          </div>
        ) : null}
        <div>
          <div style={{ fontSize: "var(--nv-font-xs)", fontWeight: 600, color: "var(--nv-color-text-faint)", marginBottom: 4 }}>Notes</div>
          {contact.notes ? (
            contact.notes.split("\n").filter(Boolean).map((paragraph, i) => (
              <p key={i} style={{ margin: "0 0 8px", whiteSpace: "pre-wrap" }}>{paragraph}</p>
            ))
          ) : (
            <div style={{ color: "var(--nv-color-text-faint)" }}>—</div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: "var(--nv-space-4)" }}>
          <Button variant="secondary" size="sm" onClick={onEdit}>Edit</Button>
          <form action={actions.remove} onSubmit={() => setTimeout(onDeleted, 50)}>
            <input type="hidden" name="id" value={contact.id} />
            <Button variant="danger" size="sm" type="submit">Delete</Button>
          </form>
        </div>
      </div>
    </div>
  );
}