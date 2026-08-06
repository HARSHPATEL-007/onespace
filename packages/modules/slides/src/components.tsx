"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, cn } from "@n0va/ui";
import type { Presentation, Slide } from "@n0va/db";
import type { Block } from "./server";

export interface SlidesActions {
  create: (formData: FormData) => Promise<void>;
  rename: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
  addSlide: (formData: FormData) => Promise<void>;
  saveBlocks: (formData: FormData) => Promise<void>;
  removeSlide: (formData: FormData) => Promise<void>;
  moveSlide: (formData: FormData) => Promise<void>;
  setTheme: (formData: FormData) => Promise<void>;
}

const THEMES: Record<string, { bg: string; fg: string; accent: string }> = {
  dark: { bg: "#0f1115", fg: "#f5f6fa", accent: "#7c5cfc" },
  light: { bg: "#ffffff", fg: "#1a1c23", accent: "#7c5cfc" },
  ocean: { bg: "#0b1e2d", fg: "#e8f4fd", accent: "#38bdf8" },
  forest: { bg: "#0d1f17", fg: "#e9f7ef", accent: "#34d399" },
  sunset: { bg: "#2a0e1e", fg: "#fff0f5", accent: "#fb7185" },
};

export function SlidesList({
  presentations,
  actions,
}: {
  presentations: Array<Presentation & { _count: { slides: number } }>;
  actions: SlidesActions;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA SLIDES</h1>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setCreating(true)}>
          + New presentation
        </Button>
      </div>

      {presentations.length === 0 ? (
        <div className="nv-empty">
          <div>No presentations yet</div>
          <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
            Create your first deck
          </Button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--nv-space-3)" }}>
          {presentations.map((p) => {
            const t = THEMES[p.theme] ?? THEMES.dark!;
            return (
              <div key={p.id} className="nv-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div
                  style={{
                    aspectRatio: "16/9",
                    borderRadius: "var(--nv-radius-md)",
                    background: t.bg,
                    color: t.fg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 24px",
                    textAlign: "center",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{p.title}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <a href={`/m/slides/${p.id}`} style={{ fontWeight: 800, textDecoration: "none", color: "inherit", flex: 1 }}>
                    {p.title}
                  </a>
                  <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{p._count.slides} slides</span>
                </div>
                <form action={actions.remove} onSubmit={() => setTimeout(() => router.refresh(), 50)}>
                  <input type="hidden" name="id" value={p.id} />
                  <Button variant="ghost" size="sm">
                    Delete
                  </Button>
                </form>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New presentation"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-pres-form">
              Create
            </Button>
          </>
        }
      >
        <form
          id="create-pres-form"
          action={(fd) => {
            void actions.create(fd).then(() => {
              setCreating(false);
              setTimeout(() => router.refresh(), 50);
            });
          }}
          style={{ minWidth: 320 }}
        >
          <input className="nv-input" name="title" placeholder="Presentation title" autoFocus required />
        </form>
      </Dialog>
    </div>
  );
}

export function SlidesEditor({
  presentation,
  slides,
  actions,
}: {
  presentation: Presentation & { slides: Slide[] };
  slides: Slide[];
  actions: SlidesActions;
}) {
  const router = useRouter();
  const [activeId, setActiveId] = useState(slides[0]?.id ?? null);
  const [blocks, setBlocks] = useState<Block[]>(
    (slides.find((s) => s.id === (slides[0]?.id ?? ""))?.blocks ?? []) as Block[],
  );
  const [saved, setSaved] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [playIndex, setPlayIndex] = useState(0);
  const [renaming, setRenaming] = useState(false);

  const active = slides.find((s) => s.id === activeId) ?? null;
  const theme = THEMES[presentation.theme] ?? THEMES.dark!;

  const selectSlide = (s: Slide) => {
    setActiveId(s.id);
    setBlocks((s.blocks ?? []) as Block[]);
    setSaved(true);
  };

  const updateBlock = (i: number, patch: Partial<Block>) => {
    setBlocks((prev) => prev.map((b, idx) => (idx === i ? ({ ...b, ...patch } as Block) : b)));
    setSaved(false);
  };

  const addBlock = (type: Block["type"]) => {
    const content = type === "title" ? "New title" : type === "subtitle" ? "Subtitle" : type === "quote" ? "A quote worth sharing" : type === "bullets" ? "• First point\n• Second point" : "Write your text here…";
    setBlocks((prev) => [...prev, { type, content }]);
    setSaved(false);
  };

  const save = () => {
    if (!active) return;
    const fd = new FormData();
    fd.set("slideId", active.id);
    fd.set("blocks", JSON.stringify(blocks));
    void actions.saveBlocks(fd).then(() => setSaved(true));
  };

  const play = () => {
    setPlayIndex(Math.max(0, slides.findIndex((s) => s.id === activeId)));
    setPlaying(true);
  };

  const ordered = useMemo(() => [...slides].sort((a, b) => a.sortOrder - b.sortOrder), [slides]);

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--nv-space-4)", flexWrap: "wrap" }}>
        <a href="/m/slides" className="nv-link" style={{ fontSize: "var(--nv-font-sm)" }}>
          ← All presentations
        </a>
        <span style={{ fontWeight: 800, fontSize: "var(--nv-font-lg)" }}>{presentation.title}</span>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={() => setRenaming(true)}>
          Rename
        </Button>
        <Button variant="secondary" size="sm" onClick={play}>
          ▶ Present
        </Button>
      </div>

      <div style={{ display: "flex", gap: "var(--nv-space-4)" }}>
        {/* Slide strip */}
        <div
          style={{
            width: 200,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            overflowY: "auto",
            maxHeight: "calc(100dvh - 220px)",
            paddingRight: 4,
          }}
        >
          {ordered.map((s, i) => (
            <div
              key={s.id}
              onClick={() => selectSlide(s)}
              style={{
                border: `2px solid ${s.id === activeId ? "var(--nv-color-primary)" : "var(--nv-color-border)"}`,
                borderRadius: "var(--nv-radius-md)",
                padding: 6,
                cursor: "pointer",
                background: "var(--nv-color-surface)",
              }}
            >
              <div
                style={{
                  aspectRatio: "16/9",
                  borderRadius: 6,
                  background: theme.bg,
                  color: theme.fg,
                  padding: "8px 10px",
                  fontSize: 10,
                  fontWeight: 700,
                  overflow: "hidden",
                }}
              >
                {(s.blocks as Block[])?.[0]?.content ?? `Slide ${i + 1}`}
              </div>
              <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 4, display: "flex", gap: 4 }}>
                Slide {i + 1}
                <span style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                  <button
                    type="button"
                    style={{ border: "none", background: "none", cursor: "pointer", color: "inherit" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const fd = new FormData();
                      fd.set("slideId", s.id);
                      fd.set("direction", "up");
                      void actions.moveSlide(fd).then(() => router.refresh());
                    }}
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    style={{ border: "none", background: "none", cursor: "pointer", color: "inherit" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const fd = new FormData();
                      fd.set("slideId", s.id);
                      fd.set("direction", "down");
                      void actions.moveSlide(fd).then(() => router.refresh());
                    }}
                    title="Move down"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    style={{ border: "none", background: "none", cursor: "pointer", color: "inherit" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const fd = new FormData();
                      fd.set("slideId", s.id);
                      void actions.removeSlide(fd).then(() => router.refresh());
                    }}
                    title="Delete slide"
                  >
                    ✕
                  </button>
                </span>
              </div>
            </div>
          ))}
          <form
            action={actions.addSlide}
            onSubmit={() => setTimeout(() => router.refresh(), 100)}
          >
            <input type="hidden" name="presentationId" value={presentation.id} />
            <Button variant="secondary" size="sm" style={{ width: "100%" }}>
              + Add slide
            </Button>
          </form>
        </div>

        {/* Canvas */}
        <div
          style={{
            flex: 1,
            aspectRatio: "16/9",
            background: theme.bg,
            color: theme.fg,
            borderRadius: "var(--nv-radius-lg)",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "var(--nv-space-8)",
            boxShadow: "var(--nv-shadow-lg)",
            position: "relative",
          }}
        >
          {blocks.map((b, i) => (
            <div
              key={i}
              style={
                b.type === "title"
                  ? { fontSize: 44, fontWeight: 900, lineHeight: 1.15, marginBottom: 18 }
                  : b.type === "subtitle"
                    ? { fontSize: 22, opacity: 0.75, marginBottom: 10 }
                    : b.type === "quote"
                      ? { fontSize: 26, fontStyle: "italic", borderLeft: `4px solid ${theme.accent}`, paddingLeft: 16, margin: "12px 0" }
                      : b.type === "bullets"
                        ? { fontSize: 20, whiteSpace: "pre-wrap", lineHeight: 1.6 }
                        : { fontSize: 18, lineHeight: 1.55, opacity: 0.9, whiteSpace: "pre-wrap" }
              }
            >
              {b.content}
            </div>
          ))}
          <div style={{ position: "absolute", bottom: 14, right: 18, fontSize: 12, opacity: 0.5 }}>
            {ordered.findIndex((s) => s.id === activeId) + 1} / {ordered.length}
          </div>
        </div>

        {/* Block editor */}
        <div
          style={{
            width: 320,
            flexShrink: 0,
            background: "var(--nv-color-surface)",
            border: "1px solid var(--nv-color-border)",
            borderRadius: "var(--nv-radius-lg)",
            padding: "var(--nv-space-4)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            overflowY: "auto",
            maxHeight: "calc(100dvh - 220px)",
          }}
        >
          <div style={{ fontWeight: 800 }}>Edit slide</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["title", "subtitle", "text", "bullets", "quote"] as const).map((t) => (
              <Button key={t} variant="ghost" size="sm" onClick={() => addBlock(t)}>
                + {t}
              </Button>
            ))}
          </div>
          {blocks.map((b, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--nv-color-text-faint)", marginBottom: 4, textTransform: "uppercase" }}>
                  {b.type}
                </div>
                <textarea
                  className="nv-input"
                  rows={b.type === "bullets" || b.type === "text" ? 5 : 2}
                  value={b.content}
                  onChange={(e) => updateBlock(i, { content: e.target.value })}
                />
              </div>
              <Button variant="ghost" size="sm" onClick={() => setBlocks((prev) => prev.filter((_, idx) => idx !== i))}>
                ✕
              </Button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={save} disabled={saved} style={{ flex: 1 }}>
              {saved ? "Saved" : "Save slide"}
            </Button>
          </div>
          <div style={{ fontWeight: 800, marginTop: 8 }}>Theme</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(THEMES).map(([key, t]) => (
              <button
                key={key}
                type="button"
                title={key}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("id", presentation.id);
                  fd.set("theme", key);
                  void actions.setTheme(fd).then(() => router.refresh());
                }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: `2px solid ${presentation.theme === key ? "var(--nv-color-primary)" : "var(--nv-color-border)"}`,
                  background: t.bg,
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Present mode */}
      {playing && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#000",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
          onClick={() => {
            setPlayIndex((i) => (i + 1) % ordered.length);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === " ") setPlayIndex((i) => (i + 1) % ordered.length);
            if (e.key === "ArrowLeft") setPlayIndex((i) => (i - 1 + ordered.length) % ordered.length);
            if (e.key === "Escape") setPlaying(false);
          }}
          tabIndex={0}
        >
          <div
            style={{
              width: "min(1100px, 92vw)",
              aspectRatio: "16/9",
              background: theme.bg,
              color: theme.fg,
              borderRadius: 12,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: "center",
              padding: "var(--nv-space-8)",
            }}
          >
            {((ordered[playIndex]?.blocks ?? []) as Block[]).map((b, i) => (
              <div
                key={i}
                style={
                  b.type === "title"
                    ? { fontSize: 52, fontWeight: 900, lineHeight: 1.15, marginBottom: 18 }
                    : b.type === "subtitle"
                      ? { fontSize: 26, opacity: 0.75, marginBottom: 10 }
                      : b.type === "quote"
                        ? { fontSize: 30, fontStyle: "italic", borderLeft: `4px solid ${theme.accent}`, paddingLeft: 16, margin: "12px 0" }
                        : b.type === "bullets"
                          ? { fontSize: 24, whiteSpace: "pre-wrap", lineHeight: 1.6 }
                          : { fontSize: 22, lineHeight: 1.55, opacity: 0.9, whiteSpace: "pre-wrap" }
                }
              >
                {b.content}
              </div>
            ))}
          </div>
          <button
            type="button"
            style={{ position: "absolute", top: 16, right: 16, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", borderRadius: 8, padding: "6px 14px", cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              setPlaying(false);
            }}
          >
            Exit (Esc)
          </button>
        </div>
      )}

      <Dialog
        open={renaming}
        onClose={() => setRenaming(false)}
        title="Rename presentation"
        actions={
          <>
            <Button variant="secondary" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button type="submit" form="rename-pres-form">
              Save
            </Button>
          </>
        }
      >
        <form
          id="rename-pres-form"
          action={(fd) => {
            fd.set("id", presentation.id);
            void actions.rename(fd).then(() => {
              setRenaming(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 320 }}
        >
          <input className="nv-input" name="title" defaultValue={presentation.title} autoFocus required />
        </form>
      </Dialog>
    </div>
  );
}
