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

  const contacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialContacts.filter((c) => {
      if (favoriteOnly && !c.isFavorite) return false;
      if (!q) return true;
      return [c.firstName, c.lastName, c.email, c.company, c.title].some((v) => v?.toLowerCase().includes(q));
    });
  }, [initialContacts, search, favoriteOnly]);

  const refresh = () => router.refresh();

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
                  </TableCell>
                  <TableCell>{contact.email ?? "—"}</TableCell>
                  <TableCell>{contact.company ?? "—"}</TableCell>
                  <TableCell>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {contact.labels.map((label) => (
                        <Badge key={label}>{label}</Badge>
                      ))}
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