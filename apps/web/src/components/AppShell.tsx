"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Avatar,
  Button,
  CommandPalette,
  Dropdown,
  Input,
  MenuItem,
  ModuleIcon,
  groupByLayer,
  SidebarItem,
  cn,
} from "@n0va/ui";
import { N0VA_MODULES, WORKSPACE_COOKIE, type N0vaModule } from "@n0va/core";
import { setActiveWorkspace, signOutAction } from "@/app/actions";
import type { Workspace, Role } from "@prisma/client";

interface ShellProps {
  user: { name?: string | null; email?: string | null };
  workspaces: Array<{ workspace: Workspace; role: Role }>;
  activeWorkspace: Workspace;
  children: React.ReactNode;
  enabledModuleIds?: string[];
}

const CORE_MODULE_IDS = new Set([
  "launcher",
  "mail",
  "chat",
  "calendar",
  "tasks",
  "keep",
  "contacts",
  "docs",
  "sheets",
  "forms",
  "events",
  "cloud-storage",
  "ani",
]);

export function AppShell({ user, workspaces, activeWorkspace, children, enabledModuleIds }: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [launcherQuery, setLauncherQuery] = useState("");

  const activeModuleId = pathname.startsWith("/m/") ? pathname.split("/")[2] : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "escape" && launcherOpen) {
        setLauncherOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [launcherOpen]);

  // quick overlay search — score-ranked
  const overlayModules = useMemo(() => {
    const enabledSet = enabledModuleIds ? new Set(enabledModuleIds) : null;
    let list = N0VA_MODULES.filter((m) => !enabledSet || enabledSet.has(m.id));
    const q = launcherQuery.trim().toLowerCase();
    if (!q) return list.slice(0, 24);
    const scored = list
      .map((m) => {
        let s = 0;
        const name = m.name.toLowerCase();
        const id = m.id.toLowerCase();
        const code = m.codename.toLowerCase();
        if (name === q) s += 120;
        else if (name.startsWith(q)) s += 100;
        else if (name.includes(q)) s += 60;
        if (id.includes(q)) s += 35;
        if (code.includes(q)) s += 30;
        if (m.layer.toLowerCase().includes(q)) s += 10;
        if (m.description.toLowerCase().includes(q)) s += 5;
        return { m, s };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    return scored.map((x) => x.m).slice(0, 24);
  }, [launcherQuery, enabledModuleIds]);

  useEffect(() => {
    if (!launcherOpen) setLauncherQuery("");
  }, [launcherOpen]);

  const sidebarModules = N0VA_MODULES.filter(
    (m) => (CORE_MODULE_IDS.has(m.id) || m.id === "n0va1o") && (enabledModuleIds ? enabledModuleIds.includes(m.id) : true),
  );
  const sections = groupByLayer(sidebarModules);

  const onSelectModule = (m: N0vaModule) => {
    setPaletteOpen(false);
    router.push(`/m/${m.id}`);
  };

  return (
    <div className="nv-shell">
      <aside className="nv-sidebar">
        <a href="/launcher" className="nv-sidebar-logo" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="nv-sidebar-logo-mark">N</span>
          N0VA Workspace
        </a>
        <a href="/launcher" className={cn("nv-sidebar-item", pathname === "/launcher" && "nv-sidebar-item-active")}>
          Launcher
        </a>
        <div className="nv-divider" style={{ margin: "4px 0" }} />
        {sections.map((section) => (
          <div key={section.layer}>
            <div className="nv-sidebar-section">{section.layer}</div>
            {section.modules.map((m) => (
              <SidebarItem key={m.id} module={m} active={activeModuleId === m.id} />
            ))}
          </div>
        ))}
        <div className="nv-sidebar-spacer" />
        <a href="/launcher" className="nv-sidebar-item">
          All 40 modules…
        </a>
      </aside>

      <div className="nv-main">
        <header className="nv-header">
          <button
            className="nv-sidebar-item"
            style={{ width: "auto", background: "none" }}
            onClick={() => setPaletteOpen(true)}
          >
            <span className="nv-kbd">⌘K</span>
            <span style={{ color: "var(--nv-color-text-faint)" }}>Jump to module…</span>
          </button>
          <button
            className="nv-header-launcher-btn"
            aria-label="Open launcher"
            title="Open launcher — 9-dot grid"
            onClick={() => setLauncherOpen(true)}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <circle cx="3" cy="3" r="2" fill="currentColor" opacity="0.95" />
              <circle cx="9" cy="3" r="2" fill="currentColor" opacity="0.95" />
              <circle cx="15" cy="3" r="2" fill="currentColor" opacity="0.95" />
              <circle cx="3" cy="9" r="2" fill="currentColor" opacity="0.95" />
              <circle cx="9" cy="9" r="2" fill="currentColor" opacity="0.95" />
              <circle cx="15" cy="9" r="2" fill="currentColor" opacity="0.95" />
              <circle cx="3" cy="15" r="2" fill="currentColor" opacity="0.95" />
              <circle cx="9" cy="15" r="2" fill="currentColor" opacity="0.95" />
              <circle cx="15" cy="15" r="2" fill="currentColor" opacity="0.95" />
            </svg>
          </button>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {workspaces.length > 0 ? (
              <Dropdown
                trigger={
                  <Button variant="secondary" size="sm">
                    {activeWorkspace.name}
                  </Button>
                }
              >
                {workspaces.map(({ workspace }) => (
                  <form key={workspace.id} action={setActiveWorkspace}>
                    <input type="hidden" name="workspaceId" value={workspace.id} />
                    <MenuItem>{workspace.name}</MenuItem>
                  </form>
                ))}
              </Dropdown>
            ) : null}

            <Dropdown
              trigger={
                <button
                  style={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    borderRadius: "var(--nv-radius-full)",
                  }}
                >
                  <Avatar name={user.name ?? user.email ?? "User"} />
                </button>
              }
            >
              <div style={{ padding: "8px 12px" }}>
                <div style={{ fontWeight: 700 }}>{user.name ?? "User"}</div>
                <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{user.email}</div>
              </div>
              <MenuItem onSelect={() => router.push("/launcher")}>Launcher</MenuItem>
              <form action={signOutAction}>
                <MenuItem danger>Sign out</MenuItem>
              </form>
            </Dropdown>
          </div>
        </header>

        <main className="nv-content">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onSelect={onSelectModule} />

      {launcherOpen && (
        <div
          className="nv-launcher-overlay-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setLauncherOpen(false);
          }}
          role="presentation"
        >
          <div
            className="nv-launcher-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="N0VA Launcher"
            onKeyDown={(e) => {
              if (e.key === "Escape") setLauncherOpen(false);
              if (e.key === "Enter" && overlayModules[0] && (e.target as HTMLElement)?.tagName === "INPUT") {
                const first = overlayModules[0];
                setLauncherOpen(false);
                router.push(`/m/${first.id}`);
              }
            }}
          >
            <div className="nv-launcher-overlay-head">
              <div>
                <div className="nv-launcher-overlay-title">Launcher</div>
                <div className="nv-launcher-overlay-sub">Jump to any N0VA module — search or pick</div>
              </div>
              <button
                className="nv-launcher-overlay-close"
                aria-label="Close launcher"
                onClick={() => setLauncherOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="nv-launcher-overlay-search">
              <span className="nv-launcher-search-icon" aria-hidden>
                ⌕
              </span>
              <input
                autoFocus
                className="nv-launcher-search-input"
                placeholder="Search modules… (Mail, Project Iris, L2 Intelligence)"
                value={launcherQuery}
                onChange={(e) => setLauncherQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && overlayModules[0]) {
                    e.preventDefault();
                    const m = overlayModules[0]!;
                    setLauncherOpen(false);
                    router.push(`/m/${m.id}`);
                  }
                }}
                aria-label="Search modules in launcher overlay"
              />
              {launcherQuery ? (
                <button
                  type="button"
                  className="nv-launcher-search-clear"
                  onClick={() => setLauncherQuery("")}
                  aria-label="Clear"
                >
                  ×
                </button>
              ) : (
                <span className="nv-launcher-overlay-hint">
                  <span className="nv-kbd">Esc</span> close
                </span>
              )}
            </div>

            <div className="nv-launcher-overlay-grid" role="list">
              {overlayModules.length === 0 ? (
                <div className="nv-launcher-overlay-empty">No modules match “{launcherQuery}”</div>
              ) : (
                overlayModules.map((m: N0vaModule) => (
                  <a
                    key={m.id}
                    href={`/m/${m.id}`}
                    role="listitem"
                    className="nv-launcher-overlay-tile"
                    onClick={() => setLauncherOpen(false)}
                  >
                    <ModuleIcon module={m} size={40} />
                    <span className="nv-launcher-overlay-tile-name">{m.name.replace("N0VA ", "")}</span>
                    <span className="nv-launcher-overlay-tile-layer">{m.layer.replace(/^L\d+\s*/, "")}</span>
                  </a>
                ))
              )}
            </div>

            <div className="nv-launcher-overlay-foot">
              <a href="/launcher" className="nv-link" onClick={() => setLauncherOpen(false)}>
                Open full launcher →
              </a>
              <span className="nv-launcher-overlay-foot-hint">
                <span className="nv-kbd">⌘K</span> palette · <span className="nv-kbd">/</span> search on launcher page
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}