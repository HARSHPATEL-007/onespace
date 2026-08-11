"use client";
interface Embed { id: string; sourceType: string; sourceId: string; title: string; description: string | null; thumbnailUrl: string | null; url: string; metadata: Record<string, unknown>; lastUpdatedAt: string; }
const CFG: Record<string, { icon: string; color: string; label: string }> = { DOC: { icon: "📄", color: "#4f46e5", label: "Doc" }, SHEET: { icon: "📊", color: "#10b981", label: "Sheet" }, CRM_RECORD: { icon: "👤", color: "#f59e0b", label: "CRM" }, GITHUB_ITEM: { icon: "🐙", color: "#333", label: "GitHub" }, TICKET: { icon: "🎫", color: "#ef4444", label: "Ticket" }, CALENDAR_EVENT: { icon: "📅", color: "#1A73E8", label: "Calendar" }, TASK: { icon: "✅", color: "#7c5cfc", label: "Task" }, IMAGE: { icon: "🖼️", color: "#8b5cf6", label: "Image" }, VIDEO: { icon: "🎬", color: "#ec4899", label: "Video" }, LINK: { icon: "🔗", color: "#8E8E93", label: "Link" } };

export function LiveEmbedCard({ embed, onOpen }: { embed: Embed; onOpen?: () => void }) {
  const cfg = CFG[embed.sourceType] ?? CFG.LINK!;
  return (
    <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", overflow: "hidden", background: "var(--nv-color-surface)", maxWidth: 320 }}>
      {embed.thumbnailUrl && <img src={embed.thumbnailUrl} alt="" style={{ width: "100%", height: 120, objectFit: "cover" }} />}
      <div style={{ padding: "var(--nv-space-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 14 }}>{cfg.icon}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.03em" }}>{cfg.label}</span>
          <span style={{ fontSize: 9, color: "var(--nv-color-text-faint)", marginLeft: "auto" }}>Updated {new Date(embed.lastUpdatedAt).toLocaleDateString()}</span>
        </div>
        <div style={{ fontSize: "var(--nv-font-sm)", fontWeight: 600, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{embed.title}</div>
        {embed.description && <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{embed.description}</div>}
        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
          <a href={embed.url} target="_blank" rel="noopener" style={{ fontSize: 11, padding: "3px 8px", borderRadius: "var(--nv-radius-sm)", background: "var(--nv-color-primary-alpha)", color: "var(--nv-color-primary)", textDecoration: "none" }}>Open</a>
          {onOpen && <button onClick={onOpen} style={{ fontSize: 11, padding: "3px 8px", borderRadius: "var(--nv-radius-sm)", border: "1px solid var(--nv-color-border)", background: "transparent", cursor: "pointer", color: "var(--nv-color-text)" }}>Expand</button>}
        </div>
      </div>
    </div>
  );
}
