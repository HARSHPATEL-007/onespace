"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Dropdown, MenuItem } from "@n0va/ui";
import type { LearningItem } from "@n0va/db";
import type { LearningSetWithItems, SourcePick } from "./server";

export interface LearningActions {
  create?: (formData: FormData) => Promise<string | void>;
  updateMeta: (formData: FormData) => Promise<void>;
  remove?: (formData: FormData) => Promise<void>;
  addItem: (formData: FormData) => Promise<void>;
  removeItem: (formData: FormData) => Promise<void>;
  moveItem: (formData: FormData) => Promise<void>;
}

export function LearningSets({ sets, actions }: { sets: LearningSetWithItems[]; actions: LearningActions }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>BOOKLM EDUCATION</h1>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setCreating(true)}>+ New set</Button>
      </div>

      {sets.length === 0 ? (
        <div className="nv-empty" style={{ minHeight: 280 }}>
          <div>No learning sets yet</div>
          <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>Create one</Button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--nv-space-3)" }}>
          {sets.map((s) => (
            <div key={s.id} className="nv-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontWeight: 800 }}>📚 {s.title}</span>
              <div style={{ fontSize: 13, color: "var(--nv-color-text-faint)", minHeight: 34 }}>{s.description || "No description"}</div>
              <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
                {s.items.length} source{s.items.length === 1 ? "" : "s"}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <a href={`/m/booklm/${s.id}`} style={{ textDecoration: "none", flex: 1 }}>
                  <Button style={{ width: "100%" }}>Open</Button>
                </a>
                <Dropdown
                  trigger={
                    <Button variant="ghost" size="sm">⋯</Button>
                  }
                >
                  <MenuItem
                    danger
                    onSelect={() => {
                      const fd = new FormData();
                      fd.set("setId", s.id);
                      void actions.remove?.(fd).then(() => router.refresh());
                    }}
                  >
                    Delete set
                  </MenuItem>
                </Dropdown>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New learning set"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" form="create-set-form">Create</Button>
          </>
        }
      >
        <form
          id="create-set-form"
          action={(fd) => {
            void actions.create?.(fd).then((id) => {
              setCreating(false);
              if (id) router.push(`/m/booklm/${id}`);
            });
          }}
          style={{ minWidth: 320, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input className="nv-input" name="title" placeholder="e.g. Algebra basics" autoFocus required />
          <input className="nv-input" name="description" placeholder="What will you learn? (optional)" />
        </form>
      </Dialog>
    </div>
  );
}

const KIND_ICON: Record<LearningItem["kind"], string> = { DOC: "📄", VIDEO: "🎬", LINK: "🔗", NOTE: "📝" };

export function LearningSetView({
  set,
  docPicks,
  videoPicks,
  actions,
}: {
  set: LearningSetWithItems;
  docPicks: SourcePick[];
  videoPicks: SourcePick[];
  actions: LearningActions;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<LearningItem["kind"]>("LINK");
  const [study, setStudy] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const addForm = useMemo(() => {
    if (adding) {
      return (
        <form
          id="add-item-form"
          action={(fd) => {
            void actions.addItem(fd).then(() => {
              setAdding(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 360, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input type="hidden" name="setId" value={set.id} />
          <select className="nv-input" name="kind" value={kind} onChange={(e) => setKind(e.target.value as LearningItem["kind"])}>
            <option value="LINK">Link</option>
            <option value="DOC">From a doc</option>
            <option value="VIDEO">From a video</option>
            <option value="NOTE">Note</option>
          </select>
          {kind === "DOC" && (
            <select className="nv-input" name="refId" defaultValue="">
              <option value="" disabled>Pick a doc…</option>
              {docPicks.map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
          )}
          {kind === "VIDEO" && (
            <select className="nv-input" name="refId" defaultValue="">
              <option value="" disabled>Pick a video…</option>
              {videoPicks.map((v) => (
                <option key={v.id} value={v.id}>{v.title}</option>
              ))}
            </select>
          )}
          <input className="nv-input" name="title" placeholder="Title" required />
          {kind === "LINK" && <input className="nv-input" name="source" placeholder="https://…" />}
          <textarea className="nv-input" name="notes" rows={3} placeholder="What should you remember?" style={{ resize: "vertical" }} />
        </form>
      );
    }
    return null;
  }, [adding, kind, set.id, docPicks, videoPicks, actions]); // eslint-disable-line react-hooks/exhaustive-deps

  const studyDeck = set.items.filter((i) => i.title || i.notes);
  const card = studyDeck[cardIndex];

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--nv-space-4)", flexWrap: "wrap" }}>
        <a href="/m/booklm" className="nv-link" style={{ fontSize: "var(--nv-font-sm)" }}>← All sets</a>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>{set.title}</h1>
        <div style={{ flex: 1 }} />
        {studyDeck.length > 1 && (
          <Button variant="secondary" size="sm" onClick={() => { setStudy(true); setCardIndex(0); setFlipped(false); }}>
            🎴 Study mode
          </Button>
        )}
        <Button size="sm" onClick={() => setAdding(true)}>+ Add source</Button>
      </div>
      <div style={{ fontSize: 13, color: "var(--nv-color-text-faint)", marginBottom: "var(--nv-space-4)" }}>{set.description}</div>

      {study ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--nv-space-4)", minHeight: 380 }}>
          <div
            onClick={() => setFlipped((f) => !f)}
            style={{
              width: 420,
              minHeight: 240,
              maxWidth: "100%",
              background: "var(--nv-color-surface)",
              border: "1px solid var(--nv-color-border)",
              borderRadius: "var(--nv-radius-lg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 32,
              cursor: "pointer",
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              fontSize: 18,
              textAlign: "center",
              fontWeight: flipped ? 400 : 700,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {flipped ? card?.notes || "No notes on the back — flip again!" : card?.title}
          </div>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
            {cardIndex + 1} / {studyDeck.length} · click the card to flip
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="secondary" size="sm" disabled={cardIndex === 0} onClick={() => { setCardIndex((i) => i - 1); setFlipped(false); }}>← Previous</Button>
            <Button variant="ghost" size="sm" onClick={() => { setStudy(false); setFlipped(false); }}>Exit</Button>
            <Button variant="secondary" size="sm" disabled={cardIndex >= studyDeck.length - 1} onClick={() => { setCardIndex((i) => i + 1); setFlipped(false); }}>Next →</Button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {set.items.length === 0 && <div className="nv-empty" style={{ minHeight: 200 }}><div>No sources yet — add a doc, video, link or note.</div></div>}
          {set.items.map((item, idx) => (
            <div key={item.id} className="nv-card" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ fontSize: 20 }}>{KIND_ICON[item.kind]}</span>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ fontWeight: 700 }}>
                  {item.kind === "DOC" && item.refId ? (
                    <a className="nv-link" href={`/m/docs/${item.refId}`}>{item.title}</a>
                  ) : item.kind === "VIDEO" && item.refId ? (
                    <a className="nv-link" href={`/m/videos/${item.refId}`}>{item.title}</a>
                  ) : item.kind === "LINK" && item.source ? (
                    <a className="nv-link" href={item.source} target="_blank" rel="noreferrer">{item.title} ↗</a>
                  ) : (
                    item.title
                  )}
                </div>
                {item.notes && <div style={{ fontSize: 13, color: "var(--nv-color-text-faint)", whiteSpace: "pre-wrap" }}>{item.notes}</div>}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="nv-link" style={{ fontSize: 12 }} disabled={idx === 0} onClick={() => { const fd = new FormData(); fd.set("setId", set.id); fd.set("itemId", item.id); fd.set("dir", "up"); void actions.moveItem(fd).then(() => router.refresh()); }}>↑</button>
                <button className="nv-link" style={{ fontSize: 12 }} disabled={idx === set.items.length - 1} onClick={() => { const fd = new FormData(); fd.set("setId", set.id); fd.set("itemId", item.id); fd.set("dir", "down"); void actions.moveItem(fd).then(() => router.refresh()); }}>↓</button>
                <button className="nv-link" style={{ fontSize: 12, color: "var(--nv-color-danger)" }} onClick={() => { const fd = new FormData(); fd.set("setId", set.id); fd.set("itemId", item.id); void actions.removeItem(fd).then(() => router.refresh()); }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add learning source"
        actions={<>
          <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
          <Button type="submit" form="add-item-form">Add</Button>
        </>}
      >
        {addForm}
      </Dialog>
    </div>
  );
}
