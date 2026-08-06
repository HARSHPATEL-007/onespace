"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Dropdown } from "@n0va/ui";
import type { SitePage } from "@n0va/db";
import type { PageBlock } from "./server";

export interface SiteActions {
  create: (formData: FormData) => Promise<void>;
  rename: (formData: FormData) => Promise<void>;
  setPublished: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
  addPage: (formData: FormData) => Promise<void>;
  updatePage: (formData: FormData) => Promise<void>;
  removePage: (formData: FormData) => Promise<void>;
  movePage: (formData: FormData) => Promise<void>;
}

export interface SiteMeta {
  id: string;
  name: string;
  description: string;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
  pages: SitePage[];
}

export function RenderBlocks({ blocks }: { blocks: PageBlock[] | null }) {
  const items = Array.isArray(blocks) ? blocks : [];
  if (items.length === 0) return <p style={{ color: "var(--nv-color-text-faint)" }}>This page has no content yet.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {items.map((b) => {
        switch (b.type) {
          case "heading":
            return <h2 key={b.id} style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>{b.content || "Untitled section"}</h2>;
          case "quote":
            return <blockquote key={b.id} style={{ margin: 0, padding: "10px 16px", borderLeft: "3px solid var(--nv-color-primary)", background: "var(--nv-color-surface)", borderRadius: 8, fontStyle: "italic" }}>{b.content}</blockquote>;
          case "bullets":
            return (
              <ul key={b.id} style={{ margin: 0, paddingLeft: 20 }}>
                {b.bullets.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            );
          default:
            return <p key={b.id} style={{ margin: 0, lineHeight: 1.7 }}>{b.content}</p>;
        }
      })}
    </div>
  );
}

function parseBlocks(value: unknown): PageBlock[] {
  return Array.isArray(value) ? (value as PageBlock[]) : [];
}

export function SitesList({ sites, actions }: { sites: SiteMeta[]; actions: SiteActions }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA SITES</h1>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setCreating(true)}>+ New site</Button>
      </div>

      {sites.length === 0 ? (
        <div className="nv-empty" style={{ minHeight: 280 }}>
          <div>No sites yet</div>
          <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>Create your first site</Button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--nv-space-3)" }}>
          {sites.map((s) => (
            <div key={s.id} className="nv-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 800 }}>{s.name}</span>
                <span className={s.published ? "nv-badge nv-badge-green" : "nv-badge"}>{s.published ? "Published" : "Draft"}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--nv-color-text-faint)", minHeight: 34 }}>{s.description || "No description"}</div>
              <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{s.pages.length} page{s.pages.length === 1 ? "" : "s"}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                <a href={`/m/sites/${s.id}`} style={{ textDecoration: "none", flex: 1 }}>
                  <Button style={{ width: "100%" }}>Edit</Button>
                </a>
                <Dropdown
                  items={[
                    {
                      label: s.published ? "Unpublish" : "Publish",
                      onSelect: () => {
                        const fd = new FormData();
                        fd.set("siteId", s.id);
                        fd.set("published", s.published ? "false" : "true");
                        void actions.setPublished(fd).then(() => router.refresh());
                      },
                    },
                    {
                      label: "Delete site",
                      danger: true,
                      onSelect: () => {
                        const fd = new FormData();
                        fd.set("siteId", s.id);
                        void actions.remove(fd).then(() => router.refresh());
                      },
                    },
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New site"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" form="create-site-form">Create</Button>
          </>
        }
      >
        <form
          id="create-site-form"
          action={(fd) => {
            void actions.create(fd).then((id) => {
              setCreating(false);
              if (id) router.push(`/m/sites/${id}`);
            });
          }}
          style={{ minWidth: 320, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input className="nv-input" name="name" placeholder="Site name" autoFocus required />
          <input className="nv-input" name="description" placeholder="Short description (optional)" />
        </form>
      </Dialog>
    </div>
  );
}

const BLOCK_LABELS: Record<PageBlock["type"], string> = {
  heading: "Heading",
  text: "Text",
  quote: "Quote",
  bullets: "Bullet list",
};

export function SiteBuilder({ site, actions }: { site: SiteMeta; actions: SiteActions }) {
  const router = useRouter();
  const [name, setName] = useState(site.name);
  const [description, setDescription] = useState(site.description);
  const [pageId, setPageId] = useState(site.pages[0]?.id ?? "");
  const page = site.pages.find((p) => p.id === pageId) ?? site.pages[0];
  const [blocks, setBlocks] = useState<PageBlock[]>(() => (page ? parseBlocks(page.blocks) : []));
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!page) return;
    setBlocks(parseBlocks(page.blocks));
  }, [pageId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!page) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const fd = new FormData();
      fd.set("siteId", site.id);
      fd.set("pageId", page.id);
      fd.set("blocks", JSON.stringify(blocks));
      void actions.updatePage(fd).then(() => setSavedAt(new Date().toLocaleTimeString()));
    }, 1200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [blocks]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMeta = () => {
    const fd = new FormData();
    fd.set("siteId", site.id);
    fd.set("name", name);
    fd.set("description", description);
    void actions.rename(fd).then(() => setSavedAt(new Date().toLocaleTimeString()));
  };

  if (!page) return <div className="nv-empty" style={{ minHeight: 280 }}><div>This site has no pages.</div></div>;

  const updateBlock = (id: string, patch: Partial<PageBlock>) =>
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const addBlock = (type: PageBlock["type"]) =>
    setBlocks((prev) => [
      ...prev,
      { id: `b-${Math.random().toString(36).slice(2, 8)}`, type, content: type === "heading" ? "New section" : "", bullets: [] },
    ]);

  const removeBlock = (id: string) => setBlocks((prev) => prev.filter((b) => b.id !== id));

  const moveBlock = (id: string, dir: "up" | "down") =>
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      const j = dir === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const isCurrent = (p: SitePage) => p.id === (page.id);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--nv-space-4)", flexWrap: "wrap" }}>
        <a href="/m/sites" className="nv-link" style={{ fontSize: "var(--nv-font-sm)" }}>← All sites</a>
        <input className="nv-input" value={name} onChange={(e) => setName(e.target.value)} onBlur={saveMeta} style={{ width: 260, fontWeight: 700 }} />
        <span className={site.published ? "nv-badge nv-badge-green" : "nv-badge"}>{site.published ? "Published" : "Draft"}</span>
        <div style={{ flex: 1 }} />
        {savedAt && <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Saved {savedAt}</span>}
        <a href={`/m/sites/${site.id}/preview`} style={{ textDecoration: "none" }}>
          <Button variant="secondary" size="sm">Preview</Button>
        </a>
        <Button
          size="sm"
          onClick={() => {
            const fd = new FormData();
            fd.set("siteId", site.id);
            fd.set("published", site.published ? "false" : "true");
            void actions.setPublished(fd).then(() => router.refresh());
          }}
        >
          {site.published ? "Unpublish" : "Publish"}
        </Button>
      </div>

      <div style={{ display: "flex", gap: "var(--nv-space-4)", alignItems: "flex-start" }}>
        {/* Pages sidebar */}
        <div className="nv-card" style={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "var(--nv-color-text-faint)" }}>Pages</div>
          {site.pages.map((p, idx) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                onClick={() => setPageId(p.id)}
                style={{
                  flex: 1,
                  textAlign: "left",
                  padding: "7px 10px",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  fontWeight: isCurrent(p) ? 700 : 500,
                  background: isCurrent(p) ? "var(--nv-color-primary-alpha)" : "transparent",
                  color: isCurrent(p) ? "var(--nv-color-primary)" : "inherit",
                  fontSize: "var(--nv-font-sm)",
                }}
              >
                {p.title}
              </button>
              <Dropdown
                size="sm"
                items={[
                  {
                    label: "Rename…",
                    onSelect: () => {
                      const t = window.prompt("Page title", p.title);
                      if (t?.trim()) {
                        const fd = new FormData();
                        fd.set("siteId", site.id);
                        fd.set("pageId", p.id);
                        fd.set("title", t.trim());
                        void actions.updatePage(fd).then(() => router.refresh());
                      }
                    },
                  },
                  { label: "Move up", onSelect: () => { const fd = new FormData(); fd.set("siteId", site.id); fd.set("pageId", p.id); fd.set("dir", "up"); void actions.movePage(fd).then(() => router.refresh()); }, disabled: idx === 0 },
                  { label: "Move down", onSelect: () => { const fd = new FormData(); fd.set("siteId", site.id); fd.set("pageId", p.id); fd.set("dir", "down"); void actions.movePage(fd).then(() => router.refresh()); }, disabled: idx === site.pages.length - 1 },
                  { label: "Delete page", danger: true, onSelect: () => { const fd = new FormData(); fd.set("siteId", site.id); fd.set("pageId", p.id); void actions.removePage(fd).then(() => router.refresh()); } },
                ]}
              />
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => { const fd = new FormData(); fd.set("siteId", site.id); void actions.addPage(fd).then(() => router.refresh()); }}>+ Add page</Button>
        </div>

        {/* Editor */}
        <div className="nv-card" style={{ flex: 1, minHeight: 420, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input className="nv-input" value={page.title} onChange={(e) => { const fd = new FormData(); fd.set("siteId", site.id); fd.set("pageId", page.id); fd.set("title", e.target.value); void actions.updatePage(fd); }} style={{ fontWeight: 800, fontSize: 16 }} />
            <Dropdown
              items={[
                { label: BLOCK_LABELS.heading, onSelect: () => addBlock("heading") },
                { label: BLOCK_LABELS.text, onSelect: () => addBlock("text") },
                { label: BLOCK_LABELS.quote, onSelect: () => addBlock("quote") },
                { label: BLOCK_LABELS.bullets, onSelect: () => addBlock("bullets") },
              ]}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {blocks.map((b, idx) => (
              <div key={b.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--nv-color-text-faint)" }}>{BLOCK_LABELS[b.type]}</span>
                    <div style={{ flex: 1 }} />
                    <button className="nv-link" style={{ fontSize: 11 }} onClick={() => moveBlock(b.id, "up")}>↑</button>
                    <button className="nv-link" style={{ fontSize: 11 }} onClick={() => moveBlock(b.id, "down")}>↓</button>
                    <button className="nv-link" style={{ fontSize: 11, color: "var(--nv-color-danger)" }} onClick={() => removeBlock(b.id)}>✕</button>
                  </div>
                  {b.type === "bullets" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {(b.bullets ?? []).map((x, bi) => (
                        <input
                          key={bi}
                          className="nv-input"
                          value={x}
                          placeholder="Bullet item"
                          onChange={(e) => updateBlock(b.id, { bullets: (b.bullets ?? []).map((y, yi) => (yi === bi ? e.target.value : y)) })}
                        />
                      ))}
                      <button className="nv-link" style={{ textAlign: "left", fontSize: 12 }} onClick={() => updateBlock(b.id, { bullets: [...(b.bullets ?? []), ""] })}>+ item</button>
                    </div>
                  ) : (
                    <textarea
                      className="nv-input"
                      value={b.content}
                      rows={b.type === "heading" ? 1 : 3}
                      placeholder={b.type === "quote" ? "A quote worth sharing…" : "Start writing…"}
                      onChange={(e) => updateBlock(b.id, { content: e.target.value })}
                      style={{ resize: "vertical" }}
                    />
                  )}
                </div>
              </div>
            ))}
            {blocks.length === 0 && <div style={{ fontSize: 13, color: "var(--nv-color-text-faint)" }}>Empty page — add a block above.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SitePreview({ site }: { site: SiteMeta }) {
  const [pageId, setPageId] = useState(site.pages[0]?.id ?? "");
  const page = site.pages.find((p) => p.id === pageId) ?? site.pages[0];
  const blocks = useMemo(() => (page ? parseBlocks(page.blocks) : []), [page]);

  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: "#1a1c23", fontFamily: "var(--nv-font-family)" }}>
      <header style={{ borderBottom: "1px solid #e8e8ee", padding: "0 32px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", gap: 24, height: 64 }}>
          <span style={{ fontWeight: 900, fontSize: 18 }}>{site.name}</span>
          <nav style={{ display: "flex", gap: 18, fontSize: 14 }}>
            {site.pages.map((p) => (
              <button
                key={p.id}
                onClick={() => setPageId(p.id)}
                style={{ background: "none", border: "none", cursor: "pointer", fontWeight: p.id === page?.id ? 700 : 500, color: "inherit", padding: 0 }}
              >
                {p.title}
              </button>
            ))}
          </nav>
          <div style={{ flex: 1 }} />
          <a href={`/m/sites/${site.id}`} className="nv-link" style={{ fontSize: 13 }}>Edit →</a>
        </div>
      </header>
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "48px 32px" }}>
        <h1 style={{ fontSize: 40, fontWeight: 900, marginBottom: 24 }}>{page?.title}</h1>
        <RenderBlocks blocks={blocks} />
      </main>
      <footer style={{ borderTop: "1px solid #e8e8ee", padding: "24px 32px", textAlign: "center", fontSize: 13, color: "#8b8f9a" }}>
        Published with N0VA Sites {site.published ? "" : "(preview — site is still a draft)"}
      </footer>
    </div>
  );
}
