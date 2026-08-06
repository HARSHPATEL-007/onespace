"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Dropdown, MenuItem, cn } from "@n0va/ui";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { Doc, DocComment } from "@n0va/db";

export interface DocsActions {
  create: (formData: FormData) => Promise<void>;
  rename: (formData: FormData) => Promise<void>;
  togglePin: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
  save: (formData: FormData) => Promise<void>;
  comment: (formData: FormData) => Promise<void>;
}

export interface EditorActions {
  rename: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
  save: (formData: FormData) => Promise<void>;
  comment: (formData: FormData) => Promise<void>;
}

export function DocsList({
  docs,
  actions,
}: {
  docs: Array<Doc & { _count: { comments: number } }>;
  actions: DocsActions;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [renaming, setRenaming] = useState<Doc | null>(null);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA DOCS</h1>
        <div style={{ flex: 1 }} />
        <form action={actions.create} onSubmit={() => setTimeout(() => router.push("/m/docs"), 300)}>
          <Button size="sm" type="submit">+ New document</Button>
        </form>
      </div>

      {docs.length === 0 ? (
        <div className="nv-empty">
          <div>No documents yet</div>
          <form action={actions.create}>
            <Button variant="secondary" type="submit">Create your first document</Button>
          </form>
        </div>
      ) : (
        <div className="nv-card">
          <table className="nv-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Comments</th>
                <th>Version</th>
                <th>Modified</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <a href={`/m/docs/${doc.id}`} style={{ fontWeight: 600, textDecoration: "none", color: "inherit" }}>
                      {doc.pinned ? "📌 " : ""}
                      {doc.title || "Untitled"}
                    </a>
                  </td>
                  <td>{doc._count.comments}</td>
                  <td>v{doc.version}</td>
                  <td>{doc.updatedAt.toLocaleString()}</td>
                  <td>
                    <Dropdown trigger={<Button variant="ghost" size="sm">⋯</Button>}>
                      <MenuItem onSelect={() => setRenaming(doc)}>Rename</MenuItem>
                      <form action={actions.togglePin} onSubmit={() => setTimeout(refresh, 50)}>
                        <input type="hidden" name="id" value={doc.id} />
                        <MenuItem>{doc.pinned ? "Unpin" : "Pin"}</MenuItem>
                      </form>
                      <form action={actions.remove} onSubmit={() => setTimeout(refresh, 50)}>
                        <input type="hidden" name="id" value={doc.id} />
                        <MenuItem danger>Delete</MenuItem>
                      </form>
                    </Dropdown>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename document"
        actions={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button type="submit" form="rename-doc-form">Save</Button>
          </>
        }
      >
        <form
          id="rename-doc-form"
          action={actions.rename}
          onSubmit={() => {
            setRenaming(null);
            setTimeout(refresh, 50);
          }}
        >
          <input type="hidden" name="id" value={renaming?.id ?? ""} />
          <input
            className="nv-input"
            name="title"
            required
            defaultValue={renaming?.title ?? ""}
            autoFocus
          />
        </form>
      </Dialog>
    </div>
  );
}

export function DocEditor({
  doc,
  comments,
  actions,
  userId,
}: {
  doc: Doc;
  comments: DocComment[];
  actions: EditorActions;
  userId: string;
}) {
  const router = useRouter();
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentAuthor, setCommentAuthor] = useState("");

  const editor = useEditor({
    extensions: [StarterKit],
    content: doc.content ? JSON.parse(doc.content) : undefined,
    editorProps: {
      attributes: {
        class: "nv-doc-editor",
      },
    },
    onUpdate: () => {
      setSavedAt(null);
    },
  });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editor) return;
    const save = () => {
      const fd = new FormData();
      fd.set("id", doc.id);
      fd.set("content", JSON.stringify(editor.getJSON()));
      void actions.save(fd).then(() => setSavedAt(new Date()));
    };
    const onEdit = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(save, 2000);
    };
    editor.on("transaction", onEdit);
    return () => {
      editor.off("transaction", onEdit);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [editor, doc.id, actions]);

  const submitComment = (fd: FormData) => {
    fd.set("docId", doc.id);
    if (!commentAuthor) return;
    void actions.comment(fd).then(() => {
      setCommentText("");
      router.refresh();
    });
  };

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <a href="/m/docs" className="nv-link" style={{ fontSize: "var(--nv-font-sm)" }}>← All documents</a>
        <span style={{ fontSize: "var(--nv-font-xs)", color: "var(--nv-color-text-faint)" }}>
          {savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : "Editing…"}
        </span>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={() => router.push(`/m/docs/${doc.id}?view=history`)}>
          History (v{doc.version})
        </Button>
      </div>

      <input
        className="nv-input"
        style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800, border: "none", background: "none", padding: 0, marginBottom: 12 }}
        defaultValue={doc.title}
        onBlur={(e) => {
          if (e.target.value !== doc.title) {
            const fd = new FormData();
            fd.set("id", doc.id);
            fd.set("title", e.target.value);
            void actions.rename(fd);
          }
        }}
      />

      <div className="nv-card" style={{ padding: "var(--nv-space-5)" }}>
        <Toolbar editor={editor} />
        <div style={{ minHeight: 420 }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      <div className="nv-card" style={{ padding: "var(--nv-space-4)", marginTop: "var(--nv-space-4)" }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Comments ({comments.length})</div>
        <form action={submitComment}>
          <input type="hidden" name="authorName" value={commentAuthor} />
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="nv-input"
              name="authorName"
              placeholder="Your name"
              value={commentAuthor}
              onChange={(e) => setCommentAuthor(e.target.value)}
              style={{ maxWidth: 160 }}
              required
            />
            <input
              className="nv-input"
              name="text"
              placeholder="Add a comment…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              required
            />
            <Button size="md" type="submit">Comment</Button>
          </div>
        </form>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {comments.map((c) => (
            <div key={c.id} style={{ background: "var(--nv-color-surface-2)", padding: "8px 12px", borderRadius: "var(--nv-radius-md)", fontSize: "var(--nv-font-sm)" }}>
              <div style={{ fontWeight: 700, fontSize: 12 }}>{c.authorName}</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{c.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  const Btn = ({ label, onClick, active, title }: { label: string; onClick: () => void; active?: boolean; title?: string }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{
        minWidth: 30,
        height: 30,
        borderRadius: 6,
        border: "none",
        background: active ? "var(--nv-color-primary-alpha)" : "transparent",
        color: active ? "var(--nv-color-primary)" : "var(--nv-color-text-muted)",
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 13,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", gap: 2, alignItems: "center", borderBottom: "1px solid var(--nv-color-border)", paddingBottom: 10, marginBottom: 14, flexWrap: "wrap" }}>
      <Btn label="B" title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
      <Btn label="I" title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <Btn label="S" title="Strike" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} />
      <span style={{ width: 1, height: 20, background: "var(--nv-color-border)", margin: "0 6px" }} />
      <Btn label="H1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
      <Btn label="H2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <Btn label="H3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
      <span style={{ width: 1, height: 20, background: "var(--nv-color-border)", margin: "0 6px" }} />
      <Btn label="•" title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <Btn label="1." title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <Btn label="❝" title="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <Btn label="—" title="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
      <span style={{ width: 1, height: 20, background: "var(--nv-color-border)", margin: "0 6px" }} />
      <Btn label="↺" title="Undo" onClick={() => editor.chain().focus().undo().run()} />
      <Btn label="↻" title="Redo" onClick={() => editor.chain().focus().redo().run()} />
    </div>
  );
}