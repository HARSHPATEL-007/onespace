"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Dropdown, Field, Input, MenuItem, Textarea, cn } from "@n0va/ui";
import type { Note } from "@n0va/db";
import { NOTE_COLORS, type NoteColor } from "./server";

export interface KeepActions {
  create: (formData: FormData) => Promise<void>;
  update: (formData: FormData) => Promise<void>;
  togglePin: (formData: FormData) => Promise<void>;
  archive: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
}

const COLOR_HEX: Record<string, string> = {
  default: "var(--nv-color-surface)",
  red: "#fde8e8",
  orange: "#fdeeda",
  yellow: "#fef9c3",
  green: "#e5f7e5",
  teal: "#d9f3f0",
  blue: "#ddebfc",
  purple: "#ece4fb",
  pink: "#fde3f0",
  gray: "#eceff3",
};

export function KeepApp({
  notes,
  actions,
  archived = false,
}: {
  notes: Note[];
  actions: KeepActions;
  archived?: boolean;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<{ mode: "create" } | { mode: "edit"; note: Note } | null>(null);
  const refresh = () => router.refresh();

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>
          N0VA KEEP {archived ? "— Archive" : ""}
        </h1>
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onClick={() => router.push(`/m/keep${archived ? "" : "?view=archived"}`)}>
          {archived ? "← Back to notes" : "Archive"}
        </Button>
        <Button size="sm" onClick={() => setEditor({ mode: "create" })}>
          + New note
        </Button>
      </div>

      {notes.length === 0 ? (
        <div className="nv-empty">
          <div>No notes here</div>
          <div style={{ fontSize: "var(--nv-font-xs)" }}>Capture a thought — it only takes a second.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "var(--nv-space-4)" }}>
          {notes.map((note) => (
            <div
              key={note.id}
              className="nv-card"
              style={{
                padding: "var(--nv-space-4)",
                background: COLOR_HEX[note.color] ?? COLOR_HEX.default,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, fontWeight: 700 }}>
                  {note.pinned ? "📌 " : ""}
                  {note.title || "Untitled"}
                </div>
                <Dropdown
                  trigger={<Button variant="ghost" size="sm">⋯</Button>}
                >
                  <MenuItem onSelect={() => setEditor({ mode: "edit", note })}>Edit</MenuItem>
                  <form action={actions.togglePin} onSubmit={() => setTimeout(refresh, 50)}>
                    <input type="hidden" name="id" value={note.id} />
                    <MenuItem>{note.pinned ? "Unpin" : "Pin"}</MenuItem>
                  </form>
                  <form action={actions.archive} onSubmit={() => setTimeout(refresh, 50)}>
                    <input type="hidden" name="id" value={note.id} />
                    <MenuItem>{archived ? "Restore" : "Archive"}</MenuItem>
                  </form>
                  <form action={actions.remove} onSubmit={() => setTimeout(refresh, 50)}>
                    <input type="hidden" name="id" value={note.id} />
                    <MenuItem danger>Delete</MenuItem>
                  </form>
                </Dropdown>
              </div>
              {note.body ? (
                <div style={{ fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-muted)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {note.body.length > 400 ? `${note.body.slice(0, 400)}…` : note.body}
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {note.labels.map((label) => (
                  <span key={label} style={{ fontSize: 11, background: "rgba(0,0,0,0.08)", padding: "2px 8px", borderRadius: 999, fontWeight: 600 }}>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <NoteDialog
        key={editor?.mode === "edit" ? editor.note.id : editor?.mode ?? "none"}
        mode={editor?.mode ?? null}
        note={editor?.mode === "edit" ? editor.note : null}
        actions={actions}
        onClose={() => {
          setEditor(null);
          refresh();
        }}
      />
    </div>
  );
}

function NoteDialog({
  mode,
  note,
  actions,
  onClose,
}: {
  mode: "create" | "edit" | null;
  note: Note | null;
  actions: KeepActions;
  onClose: () => void;
}) {
  const [color, setColor] = useState<NoteColor>((note?.color as NoteColor) ?? "default");
  const action = mode === "edit" ? actions.update : actions.create;

  return (
    <Dialog
      open={mode !== null}
      onClose={onClose}
      title={mode === "edit" ? "Edit note" : "New note"}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="note-form">{mode === "edit" ? "Save" : "Create"}</Button>
        </>
      }
    >
      <form id="note-form" action={action} onSubmit={() => setTimeout(onClose, 50)}>
        <input type="hidden" name="id" value={note?.id ?? ""} />
        <input type="hidden" name="color" value={color} />
        <Field label="Title">
          <Input name="title" defaultValue={note?.title ?? ""} autoFocus />
        </Field>
        <Field label="Body">
          <Textarea name="body" rows={5} defaultValue={note?.body ?? ""} />
        </Field>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: "var(--nv-space-4)" }}>
          <span style={{ fontSize: "var(--nv-font-xs)", fontWeight: 600, color: "var(--nv-color-text-muted)" }}>
            Color:
          </span>
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => setColor(c)}
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                border: c === color ? "2px solid var(--nv-color-primary)" : "1px solid var(--nv-color-border)",
                background: COLOR_HEX[c] ?? COLOR_HEX.default,
                cursor: "pointer",
              }}
            />
          ))}
        </div>
        <Field label="Labels (comma separated)">
          <Input name="labels" defaultValue={note?.labels.join(", ") ?? ""} />
        </Field>
      </form>
    </Dialog>
  );
}