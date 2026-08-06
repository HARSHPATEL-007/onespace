"use client";

import { useRouter } from "next/navigation";
import type { CatalogApp } from "./server";

export function AppCatalog({ apps, onLaunch }: { apps: CatalogApp[]; onLaunch?: (formData: FormData) => void }) {
  const router = useRouter();

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA APPSET</h1>
        <span className="nv-badge nv-badge-amber">{apps.length} apps</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {apps.map((app) => (
          <button
            key={app.id}
            onClick={() => {
              const fd = new FormData();
              fd.set("id", app.id);
              onLaunch?.(fd);
              router.push(app.url);
            }}
            className="nv-card"
            style={{
              width: 210,
              padding: 16,
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              transition: "transform 0.12s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: app.accent,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                {app.name.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{app.name}</div>
                <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", display: "flex", gap: 6, alignItems: "center" }}>
                  {app.category}
                  {app.badge && <span className="nv-badge nv-badge-green" style={{ fontSize: 10 }}>{app.badge}</span>}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--nv-color-text-muted)", lineHeight: 1.45, minHeight: 34 }}>{app.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
