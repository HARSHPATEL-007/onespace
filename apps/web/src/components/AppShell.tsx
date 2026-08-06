"use client";

import { useEffect, useState } from "react";
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
  "cloud-storage",
  "ani",
]);

export function AppShell({ user, workspaces, activeWorkspace, children }: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const activeModuleId = pathname.startsWith("/m/") ? pathname.split("/")[2] : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sidebarModules = N0VA_MODULES.filter(
    (m) => CORE_MODULE_IDS.has(m.id) || m.id === "n0va1o",
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
    </div>
  );
}