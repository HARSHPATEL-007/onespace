"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { N0VA_MODULES, N0VA_LAYERS, type N0vaLayer, type N0vaModule } from "@n0va/core";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------- Button ---------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        "nv-btn",
        `nv-btn-${variant}`,
        `nv-btn-${size}`,
        block && "nv-btn-block",
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="nv-spinner" /> : children}
    </button>
  );
}

/* ---------- Form controls ---------- */

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("nv-input", props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn("nv-textarea", props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn("nv-select", props.className)} />;
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="nv-field">
      {label ? <span className="nv-label">{label}</span> : null}
      {children}
      {hint ? <span className="nv-field-hint">{hint}</span> : null}
      {error ? <span className="nv-field-error">{error}</span> : null}
    </label>
  );
}

/* ---------- Surface ---------- */

export function Card({
  children,
  className,
  padded = false,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <div className={cn("nv-card", padded && "nv-card-pad", className)}>{children}</div>;
}

type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger";

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={cn("nv-badge", `nv-badge-${tone}`)}>{children}</span>;
}

const AVATAR_COLORS = [
  "#4f46e5",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

export function Avatar({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  return (
    <span className={cn("nv-avatar", `nv-avatar-${size}`)} style={{ background: color, backgroundColor: color }}>
      {initials || "?"}
    </span>
  );
}

export function Spinner() {
  return <span role="status" aria-label="Loading" className="nv-spinner" />;
}

/* ---------- Table ---------- */

export function Table({ children }: { children: ReactNode }) {
  return (
    <table className="nv-table">
      {children}
    </table>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>;
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TableRow({ children }: { children: ReactNode }) {
  return <tr>{children}</tr>;
}

export function TableHeaderCell({
  children,
  className,
  style,
}: {
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <th className={className} style={style}>
      {children}
    </th>
  );
}

export function TableCell({
  children,
  className,
  style,
}: {
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td className={className} style={style}>
      {children}
    </td>
  );
}

/* ---------- Tabs ---------- */

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="nv-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          className={cn("nv-tab", active === tab.id && "nv-tab-active")}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Dialog ---------- */

export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="nv-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="nv-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="nv-dialog-title">{title}</div>
        <div className="nv-dialog-body">{children}</div>
        {actions ? <div className="nv-dialog-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

/* ---------- Dropdown (button + menu) ---------- */

export function Dropdown({
  trigger,
  children,
  align = "end",
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="nv-dropdown" style={{ position: "relative", display: "inline-block" }}>
      <span
        style={{ display: "inline-block", cursor: "pointer" }}
        onMouseDown={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => (o ? o : true)); }}
        title="Open menu"
      >
        {trigger}
      </span>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            [align]: 0,
            minWidth: 180,
            background: "var(--nv-color-surface)",
            border: "1px solid var(--nv-color-border)",
            borderRadius: "var(--nv-radius-md)",
            boxShadow: "var(--nv-shadow-md)",
            padding: 4,
            zIndex: 40,
          }}
          onClick={() => setOpen(false)}
        >
          {Children.map(children, (child) =>
            isValidElement<{ onSelect?: () => void }>(child)
              ? cloneElement(child, {
                  onSelect: () => {
                    child.props.onSelect?.();
                    setOpen(false);
                  },
                })
              : child
          )}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onSelect,
  danger = false,
}: {
  children: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      className="nv-sidebar-item"
      style={{
        color: danger ? "var(--nv-color-danger)" : undefined,
        padding: "8px 12px",
        width: "100%",
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        onSelect?.();
      }}
    >
      {children}
    </button>
  );
}

/* ---------- Module icon ---------- */

const TILE_COLORS = [
  ["#4f46e5", "#6366f1"],
  ["#0ea5e9", "#38bdf8"],
  ["#10b981", "#34d399"],
  ["#f59e0b", "#fbbf24"],
  ["#ef4444", "#f87171"],
  ["#8b5cf6", "#a78bfa"],
  ["#ec4899", "#f472b6"],
  ["#14b8a6", "#2dd4bf"],
  ["#0f766e", "#14b8a6"],
];

export function ModuleIcon({
  module,
  size = 40,
}: {
  module: N0vaModule;
  size?: number;
}) {
  let hash = 0;
  for (const ch of module.id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const [from, to] = TILE_COLORS[Math.abs(hash) % TILE_COLORS.length] ?? TILE_COLORS[0]!;
  const initials = module.name
    .replace("N0VA ", "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className="nv-launcher-tile-icon"
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(10, Math.round(size / 3.3)),
        fontSize: Math.round(size / 2.6),
        background: `linear-gradient(135deg, ${from}, ${to})`,
      }}
    >
      {initials}
    </span>
  );
}

/* ---------- Launcher grid ---------- */

export function LauncherGrid({ children }: { children: ReactNode }) {
  return <div className="nv-launcher">{children}</div>;
}

/* ---------- Command palette (Cmd+K) ---------- */

export function CommandPalette({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (module: N0vaModule) => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const results = useMemo(
    () =>
      N0VA_MODULES.filter(
        (m) =>
          m.name.toLowerCase().includes(query.toLowerCase()) ||
          m.codename.toLowerCase().includes(query.toLowerCase()) ||
          m.layer.toLowerCase().includes(query.toLowerCase()),
      ).slice(0, 12),
    [query],
  );

  if (!open) return null;

  return (
    <div
      className="nv-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="nv-dialog" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "var(--nv-space-4)" }}>
          <Input
            placeholder="Jump to a module…"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && results[0]) onSelect(results[0]);
            }}
          />
        </div>
        <div style={{ maxHeight: 380, overflowY: "auto", padding: "0 var(--nv-space-2) var(--nv-space-2)" }}>
          {results.length === 0 ? (
            <div className="nv-empty">No module matches "{query}"</div>
          ) : (
            results.map((m) => (
              <button key={m.id} className="nv-palette-item" onClick={() => onSelect(m)}>
                <ModuleIcon module={m} size={28} />
                <span className="nv-palette-item-name">{m.name}</span>
                <span className="nv-palette-item-layer">{m.layer}</span>
              </button>
            ))
          )}
        </div>
        <div
          style={{
            display: "flex",
            gap: "var(--nv-space-4)",
            padding: "var(--nv-space-3) var(--nv-space-4)",
            borderTop: "1px solid var(--nv-color-border)",
            fontSize: "var(--nv-font-xs)",
            color: "var(--nv-color-text-faint)",
          }}
        >
          <span>
            <span className="nv-kbd">↑</span> <span className="nv-kbd">↓</span> navigate
          </span>
          <span>
            <span className="nv-kbd">↵</span> open
          </span>
          <span>
            <span className="nv-kbd">esc</span> close
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Sidebar ---------- */

export interface SidebarSection {
  layer: N0vaLayer;
  modules: N0vaModule[];
}

export function groupByLayer(modules: N0vaModule[]): SidebarSection[] {
  return N0VA_LAYERS.map((layer) => ({
    layer,
    modules: modules.filter((m) => m.layer === layer),
  })).filter((s) => s.modules.length > 0);
}

export function SidebarItem({
  module,
  active,
  onClick,
}: {
  module: N0vaModule;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <a
      href={`/m/${module.id}`}
      className={cn("nv-sidebar-item", active && "nv-sidebar-item-active")}
      onClick={onClick}
    >
      {module.name.replace("N0VA ", "")}
    </a>
  );
}

/* ---------- Module placeholder ---------- */

export function ModulePlaceholder({
  module,
  phaseLabel,
}: {
  module: N0vaModule;
  phaseLabel: string;
}) {
  return (
    <div className="nv-module-placeholder">
      <ModuleIcon module={module} size={64} />
      <div className="nv-module-placeholder-title">{module.name}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Badge tone="primary">{module.codename}</Badge>
        <Badge>{module.layer}</Badge>
        <Badge tone="warning">{phaseLabel}</Badge>
      </div>
      <p className="nv-module-placeholder-desc">{module.description}</p>
    </div>
  );
}

export function useIsomorphicLayout(): boolean {
  const id = useId();
  return id.length > 0;
}