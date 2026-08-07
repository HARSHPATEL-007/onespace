import { notFound } from "next/navigation";
import { Button } from "@n0va/ui";
import { DocsService } from "@n0va/modules-docs/server";
import { DocEditor } from "@n0va/modules-docs/components";
import { requireWorkspace } from "@/lib/context";
import {
  renameDocAction,
  deleteDocAction,
  saveDocContentAction,
  addCommentAction,
  getRevisionsAction,
  restoreRevisionAction,
} from "../actions";

export default async function DocPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const { id } = await params;
  const { view } = await searchParams;
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new DocsService(workspaceId, userId, role);
  let doc;
  try {
    doc = await svc.get(id);
  } catch {
    notFound();
  }
  if (!doc) notFound();

  if (view === "history") {
    const revisions = await svc.revisionsWithAuthors(id);
    return (
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <a href={`/m/docs/${id}`} className="nv-link" style={{ fontSize: "var(--nv-font-sm)" }}>← Back to editor</a>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800, marginTop: 12 }}>
          {doc.title} — version history
        </h1>
        <div className="nv-card" style={{ padding: "var(--nv-space-4)" }}>
          {revisions.length === 0 ? (
            <div className="nv-empty">No revisions yet</div>
          ) : (
            revisions.map((r, i) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--nv-color-border)",
                }}
              >
                <div style={{ minWidth: 110 }}>v{doc.version - i}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "var(--nv-color-text-muted)", fontSize: "var(--nv-font-sm)" }}>
                    {new Date(r.createdAt).toLocaleString()} · {r.authorName}
                  </div>
                  {r.preview && (
                    <div
                      style={{
                        color: "var(--nv-color-text-faint)",
                        fontSize: "var(--nv-font-sm)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.preview}
                    </div>
                  )}
                </div>
                <form action={restoreRevisionAction}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="revisionId" value={r.id} />
                  <Button variant="secondary" size="sm" type="submit">Restore</Button>
                </form>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  const comments = await svc.comments(id);
  return (
    <DocEditor
      doc={doc}
      comments={comments}
      userId={userId}
      actions={{
        rename: renameDocAction,
        remove: deleteDocAction,
        save: saveDocContentAction,
        comment: addCommentAction,
        getRevisions: getRevisionsAction,
        restore: restoreRevisionAction,
      }}
    />
  );
}
