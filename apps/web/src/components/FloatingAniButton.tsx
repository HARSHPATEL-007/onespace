"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type FabPlacement = "bottom_right" | "bottom_left" | "hidden";
type FabAction = { id: string; label: string; href?: string; onSelect?: () => void };

const FAB_RULES = {
  max_primary: 5,
  keyboard_equiv: "Alt+Space",
} as const;

const STORAGE_KEY_PLACEMENT = "n0va:fab:placement";
const STORAGE_KEY_HIDDEN_UNTIL = "n0va:fab:hiddenUntil";

function getModuleActions(moduleId: string | undefined): FabAction[] {
  switch (moduleId) {
    case "docs":
      return [
        { id: "summarize", label: "Summarize" },
        { id: "find_actions", label: "Find action items" },
        { id: "conflicts", label: "Find conflicting dates" },
        { id: "ask", label: "Ask ANI" },
      ];
    case "sheets":
      return [
        { id: "explain", label: "Explain" },
        { id: "analyze", label: "Analyze" },
        { id: "create_chart", label: "Create chart" },
        { id: "anomalies", label: "Find anomalies" },
        { id: "ask", label: "Ask ANI" },
      ];
    case "mail":
      return [
        { id: "summarize_thread", label: "Summarize thread" },
        { id: "draft_reply", label: "Draft reply" },
        { id: "find_tasks", label: "Create task" },
        { id: "ask", label: "Ask ANI" },
      ];
    case "calendar":
      return [
        { id: "find_time", label: "Find time" },
        { id: "summarize_day", label: "Summarize day" },
        { id: "ask", label: "Ask ANI" },
      ];
    case "chat":
      return [
        { id: "summarize", label: "Summarize thread" },
        { id: "extract_tasks", label: "Extract tasks" },
        { id: "ask", label: "Ask ANI" },
      ];
    case "tasks":
      return [
        { id: "prioritize", label: "Prioritize" },
        { id: "create", label: "Create task" },
        { id: "ask", label: "Ask ANI" },
      ];
    default:
      return [
        { id: "ask", label: "Ask ANI" },
        { id: "summarize", label: "Summarize" },
        { id: "create", label: "Create" },
      ];
  }
}

export function FloatingAniButton() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<FabPlacement>("bottom_right");
  const [hidden, setHidden] = useState(false);
  const [showPlacementMenu, setShowPlacementMenu] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const activeModuleId = pathname.startsWith("/m/") ? pathname.split("/")[2] : undefined;
  const isLauncher = pathname === "/launcher" || pathname.startsWith("/launcher");

  // hydrate placement
  useEffect(() => {
    try {
      const p = localStorage.getItem(STORAGE_KEY_PLACEMENT) as FabPlacement | null;
      if (p === "bottom_right" || p === "bottom_left" || p === "hidden") setPlacement(p);
      const hiddenUntil = localStorage.getItem(STORAGE_KEY_HIDDEN_UNTIL);
      if (hiddenUntil && Date.now() < parseInt(hiddenUntil, 10)) setHidden(true);
    } catch {}
  }, []);

  const persistPlacement = useCallback((next: FabPlacement) => {
    setPlacement(next);
    try {
      localStorage.setItem(STORAGE_KEY_PLACEMENT, next);
      if (next === "hidden") {
        localStorage.setItem(STORAGE_KEY_HIDDEN_UNTIL, String(Date.now() + 24 * 60 * 60 * 1000));
        setHidden(true);
      } else {
        localStorage.removeItem(STORAGE_KEY_HIDDEN_UNTIL);
        setHidden(false);
      }
    } catch {}
  }, []);

  // keyboard equivalent: Alt+Space (and Ctrl+Shift+A as alias) – does not require pointer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isAltSpace = e.altKey && (e.code === "Space" || e.key === " ");
      const isCtrlShiftA = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "a";
      if (isAltSpace || isCtrlShiftA) {
        if (hidden || placement === "hidden") return;
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hidden, placement]);

  // close on outside click, restore focus
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        fabRef.current &&
        !fabRef.current.contains(e.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const actions = useMemo(() => {
    const base = getModuleActions(activeModuleId);
    // enforce max 3-5 primary, context-aware, no auto side effects
    return base.slice(0, FAB_RULES.max_primary);
  }, [activeModuleId]);

  const contextLabel = useMemo(() => {
    if (isLauncher) return "Launcher";
    if (!activeModuleId) return "Workspace";
    return activeModuleId.replace(/-/g, " ");
  }, [activeModuleId, isLauncher]);

  const handleAction = useCallback(
    (action: FabAction) => {
      setOpen(false);
      // no automatic side effects – navigate or open ANI with preview
      if (action.id === "ask") {
        // open ANI: navigate to ANI module with context
        router.push(`/m/ani`);
        return;
      }
      if (action.href) {
        router.push(action.href);
        return;
      }
      // for demo, route to module with query param indicating intent
      const target = activeModuleId ? `/m/${activeModuleId}` : "/launcher";
      const qs = new URLSearchParams({ ani_action: action.id, ani_context: contextLabel }).toString();
      router.push(`${target}?${qs}`);
    },
    [activeModuleId, contextLabel, router],
  );

  if (hidden || placement === "hidden") {
    return (
      <button
        aria-label="Show ANI assistant"
        title="Show ANI"
        onClick={() => persistPlacement("bottom_right")}
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 50,
          borderRadius: "9999px",
          padding: "8px 10px",
          fontSize: 12,
          background: "var(--nv-color-surface)",
          border: "1px solid var(--nv-color-border)",
          cursor: "pointer",
        }}
      >
        Show ANI
      </button>
    );
  }

  const positionStyle: React.CSSProperties =
    placement === "bottom_left"
      ? { position: "fixed", bottom: 24, left: 24, zIndex: 50 }
      : { position: "fixed", bottom: 24, right: 24, zIndex: 50 };

  return (
    <div ref={fabRef} style={positionStyle} data-testid="floating-ani">
      {/* Menu – appears above FAB, max 5 actions, clear labels, not icon-only */}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="ANI quick actions"
          aria-describedby="fab-context"
          style={{
            marginBottom: 12,
            minWidth: 260,
            maxWidth: 320,
            background: "var(--nv-color-surface)",
            border: "1px solid var(--nv-color-border)",
            borderRadius: "var(--nv-radius-lg)",
            boxShadow: "var(--nv-shadow-md)",
            padding: 8,
          }}
        >
          <div
            id="fab-context"
            style={{
              fontSize: 12,
              color: "var(--nv-color-text-faint)",
              padding: "4px 8px 8px",
              borderBottom: "1px solid var(--nv-color-border)",
              marginBottom: 4,
            }}
          >
            Current context: {contextLabel}
            <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.8 }}>· {actions.length} actions</span>
          </div>

          {actions.map((a) => (
            <button
              key={a.id}
              role="menuitem"
              onClick={() => handleAction(a)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: "var(--nv-radius-sm)",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 500,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--nv-color-surface-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span>{a.label}</span>
              <span aria-hidden style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
                ›
              </span>
            </button>
          ))}

          <div
            style={{
              marginTop: 4,
              paddingTop: 8,
              borderTop: "1px solid var(--nv-color-border)",
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => router.push("/m/ani")}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: "var(--nv-radius-sm)",
                border: "1px solid var(--nv-color-border)",
                background: "var(--nv-color-surface-2)",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              More
            </button>
            <button
              onClick={() => setShowPlacementMenu((v) => !v)}
              aria-label="Change ANI button placement"
              title="Placement"
              style={{
                padding: "8px 10px",
                borderRadius: "var(--nv-radius-sm)",
                border: "1px solid var(--nv-color-border)",
                background: "transparent",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              ⋯
            </button>
            <button
              onClick={() => {
                setOpen(false);
                persistPlacement("hidden");
              }}
              aria-label="Hide ANI button"
              title="Hide"
              style={{
                padding: "8px 10px",
                borderRadius: "var(--nv-radius-sm)",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 13,
                color: "var(--nv-color-text-faint)",
              }}
            >
              Hide
            </button>
          </div>

          {showPlacementMenu && (
            <div
              role="group"
              aria-label="Placement"
              style={{
                marginTop: 8,
                padding: 8,
                borderRadius: "var(--nv-radius-sm)",
                background: "var(--nv-color-surface-2)",
                display: "flex",
                gap: 6,
              }}
            >
              <button
                onClick={() => {
                  persistPlacement("bottom_right");
                  setShowPlacementMenu(false);
                }}
                aria-pressed={placement === "bottom_right"}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: 9999,
                  border: placement === "bottom_right" ? "2px solid var(--nv-color-primary)" : "1px solid var(--nv-color-border)",
                  background: "var(--nv-color-surface)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Bottom right
              </button>
              <button
                onClick={() => {
                  persistPlacement("bottom_left");
                  setShowPlacementMenu(false);
                }}
                aria-pressed={placement === "bottom_left"}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: 9999,
                  border: placement === "bottom_left" ? "2px solid var(--nv-color-primary)" : "1px solid var(--nv-color-border)",
                  background: "var(--nv-color-surface)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Bottom left
              </button>
            </div>
          )}

          <div style={{ marginTop: 8, fontSize: 11, color: "var(--nv-color-text-faint)", padding: "0 4px" }}>
            No automatic side effects. <span style={{ whiteSpace: "nowrap" }}>Keyboard: Alt+Space</span>
          </div>
        </div>
      )}

      {/* FAB – clear label, not icon-only, keyboard + screen-reader equiv, does not obscure focused content */}
      <button
        ref={buttonRef}
        aria-label="Open ANI assistant"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="fab-menu"
        title={`ANI assistant — ${contextLabel} (Alt+Space)`}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "14px 18px",
          borderRadius: 9999,
          background: "var(--nv-color-primary, #4f46e5)",
          color: "white",
          border: "none",
          boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.12)",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: 0.2,
          minWidth: 84,
          justifyContent: "center",
          // ensure target size >=44px WCAG 2.2 and not obscuring
          minHeight: 44,
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.preventDefault();
            setOpen(false);
          }
        }}
      >
        <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>
          +
        </span>
        <span>ANI</span>
      </button>

      {/* live region for screen reader */}
      <div aria-live="polite" aria-atomic="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}>
        {open ? `ANI menu opened, ${actions.length} actions for ${contextLabel}` : ""}
      </div>
    </div>
  );
}
