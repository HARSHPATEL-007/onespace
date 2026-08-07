import type { PageBlock } from "./server";

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

export function parseBlocks(value: unknown): PageBlock[] {
  return Array.isArray(value) ? (value as PageBlock[]) : [];
}
