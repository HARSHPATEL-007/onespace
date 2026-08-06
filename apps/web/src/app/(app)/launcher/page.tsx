import Link from "next/link";
import { Badge, LauncherGrid, ModuleIcon } from "@n0va/ui";
import { N0VA_MODULES, N0VA_LAYERS } from "@n0va/core";

const PHASE_LABELS: Record<number, { label: string; tone: "success" | "warning" | "neutral" }> = {
  0: { label: "Foundation", tone: "success" },
  1: { label: "Core", tone: "success" },
  2: { label: "Phase 2", tone: "warning" },
  3: { label: "Phase 3", tone: "neutral" },
  4: { label: "Phase 4", tone: "neutral" },
};

export default function LauncherPage() {
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800, letterSpacing: "0.01em" }}>
          N0VA Workspace
        </h1>
        <p style={{ color: "var(--nv-color-text-muted)", marginTop: 6, fontSize: "var(--nv-font-sm)" }}>
          One Enterprise System. A Modular Suite. Press{" "}
          <span className="nv-kbd">⌘K</span> to jump anywhere.
        </p>
      </div>

      {N0VA_LAYERS.map((layer) => {
        const modules = N0VA_MODULES.filter((m) => m.layer === layer);
        if (modules.length === 0) return null;
        return (
          <div key={layer} style={{ marginBottom: "var(--nv-space-6)" }}>
            <h2
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--nv-color-text-muted)",
                marginBottom: "var(--nv-space-3)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {layer}
            </h2>
            <LauncherGrid>
              {modules.map((module) => {
                const phase = PHASE_LABELS[module.phase] ?? { label: "Planned", tone: "neutral" as const };
                return (
                  <Link key={module.id} href={`/m/${module.id}`} className="nv-launcher-tile">
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                      <ModuleIcon module={module} />
                      <Badge tone={phase.tone}>{phase.label}</Badge>
                    </div>
                    <div className="nv-launcher-tile-name">{module.name}</div>
                    <div className="nv-launcher-tile-desc">{module.description}</div>
                  </Link>
                );
              })}
            </LauncherGrid>
          </div>
        );
      })}
    </div>
  );
}