"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Badge, ModuleIcon } from "@n0va/ui";
import { N0VA_MODULES, N0VA_LAYERS, type N0vaLayer, type N0vaModule } from "@n0va/core";

// ---------------------------------------------------------------------------
// Helpers: persisted state
// ---------------------------------------------------------------------------

function usePersisted<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {}
    setHydrated(true);
  }, [key]);

  const update = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {}
    },
    [key],
  );

  void hydrated;
  return [value, update];
}

const LS_FAV = "n0va:launcher:favorites";
const LS_RECENT = "n0va:launcher:recents";
const LS_VIEW = "n0va:launcher:view";
const LS_COLLAPSED = "n0va:launcher:collapsed";
const LS_SHOW_DISABLED = "n0va:launcher:showDisabled";
const LS_HIDDEN = "n0va:launcher:hidden";
const LS_COUNTS = "n0va:launcher:counts";
const LS_DENSITY = "n0va:launcher:density";

const PHASE_LABELS: Record<number, { label: string; tone: "success" | "warning" | "neutral" }> = {
  0: { label: "Foundation", tone: "success" },
  1: { label: "Core", tone: "success" },
  2: { label: "Phase 2", tone: "warning" },
  3: { label: "Phase 3", tone: "neutral" },
  4: { label: "Phase 4", tone: "neutral" },
  5: { label: "Phase 5", tone: "neutral" },
};

function phaseMeta(m: N0vaModule) {
  return PHASE_LABELS[m.phase] ?? { label: "Planned", tone: "neutral" as const };
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  try {
    const re = new RegExp(`(${escapeRegExp(q)})`, "ig");
    const parts = text.split(re);
    if (parts.length === 1) return text;
    return parts.map((part, i) =>
      part.toLowerCase() === q.toLowerCase() ? (
        <mark key={i} className="nv-launcher-highlight">
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  } catch {
    return text;
  }
}

function scoreModule(m: N0vaModule, q: string): number {
  const lq = q.toLowerCase();
  const name = m.name.toLowerCase();
  const codename = m.codename.toLowerCase();
  const desc = m.description.toLowerCase();
  const layer = m.layer.toLowerCase();
  const id = m.id.toLowerCase();
  let s = 0;
  if (name === lq) s += 140;
  else if (name.startsWith(lq)) s += 110;
  else if (name.includes(lq)) s += 65;
  if (id === lq) s += 100;
  else if (id.startsWith(lq)) s += 55;
  else if (id.includes(lq)) s += 32;
  if (codename.includes(lq)) s += 38;
  if (layer.includes(lq)) s += 14;
  if (desc.includes(lq)) s += 9;
  if (m.phase <= 1) s += 2;
  return s;
}

const QUICK_ACTIONS: Record<string, { label: string; href: string }> = {
  docs: { label: "New doc", href: "/m/docs" },
  sheets: { label: "New sheet", href: "/m/sheets" },
  slides: { label: "New deck", href: "/m/slides" },
  tasks: { label: "New task", href: "/m/tasks" },
  calendar: { label: "New event", href: "/m/calendar" },
  mail: { label: "Compose", href: "/m/mail" },
  chat: { label: "New channel", href: "/m/chat" },
  keep: { label: "New note", href: "/m/keep" },
  forms: { label: "New form", href: "/m/forms" },
  sites: { label: "New site", href: "/m/sites" },
  contacts: { label: "Add contact", href: "/m/contacts" },
  pics: { label: "Upload", href: "/m/pics" },
  videos: { label: "Upload", href: "/m/videos" },
};

// ---------------------------------------------------------------------------
// Component — clutterless edition
// ---------------------------------------------------------------------------

export default function LauncherClient({
  enabledMap,
}: {
  enabledMap: Record<string, boolean>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedLayer, setSelectedLayer] = useState<N0vaLayer | "all">("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"default" | "alpha" | "phase" | "recent" | "frequent">("default");
  const searchRef = useRef<HTMLInputElement>(null);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const itemRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [density, setDensity] = usePersisted<"comfortable" | "compact">(LS_DENSITY, "comfortable");
  // clutterless: filters collapsed by default
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const [favorites, setFavorites] = usePersisted<string[]>(LS_FAV, []);
  const [recents, setRecents] = usePersisted<string[]>(LS_RECENT, []);
  const [viewMode, setViewMode] = usePersisted<"grid" | "list">(LS_VIEW, "grid");
  const [collapsed, setCollapsed] = usePersisted<Record<string, boolean>>(LS_COLLAPSED, {});
  const [showDisabled, setShowDisabled] = usePersisted<boolean>(LS_SHOW_DISABLED, false);
  const [hidden, setHidden] = usePersisted<string[]>(LS_HIDDEN, []);
  const [openCounts, setOpenCounts] = usePersisted<Record<string, number>>(LS_COUNTS, {});

  // close settings on outside click
  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [settingsOpen]);

  // "/" to focus search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (e.key === "/" && !isTyping) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setQuery("");
        setActiveIdx(-1);
        (document.activeElement as HTMLElement)?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pushRecent = useCallback(
    (id: string) => {
      const next = [id, ...recents.filter((r) => r !== id)].slice(0, 8);
      setRecents(next);
      const nextCounts = { ...openCounts, [id]: (openCounts[id] ?? 0) + 1 };
      setOpenCounts(nextCounts);
      try {
        const tsRaw = localStorage.getItem("n0va:launcher:recentTs");
        const ts: Record<string, number> = tsRaw ? JSON.parse(tsRaw) : {};
        ts[id] = Date.now();
        localStorage.setItem("n0va:launcher:recentTs", JSON.stringify(ts));
      } catch {}
    },
    [recents, setRecents, openCounts, setOpenCounts],
  );

  const toggleFavorite = useCallback(
    (id: string, e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      const isFav = favorites.includes(id);
      setFavorites(isFav ? favorites.filter((f) => f !== id) : [...favorites, id]);
    },
    [favorites, setFavorites],
  );

  const toggleHidden = useCallback(
    (id: string, e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      const isHidden = hidden.includes(id);
      setHidden(isHidden ? hidden.filter((h) => h !== id) : [...hidden, id]);
      if (!isHidden && favorites.includes(id)) {
        setFavorites(favorites.filter((f) => f !== id));
      }
    },
    [hidden, setHidden, favorites, setFavorites],
  );

  const toggleCollapse = useCallback(
    (layer: string) => {
      setCollapsed({ ...collapsed, [layer]: !collapsed[layer] });
    },
    [collapsed, setCollapsed],
  );

  const totalModules = N0VA_MODULES.length;
  const enabledCount = useMemo(
    () => N0VA_MODULES.filter((m) => enabledMap[m.id] !== false).length,
    [enabledMap],
  );
  const disabledCount = totalModules - enabledCount;
  const hiddenCount = hidden.length;

  const moduleById = useMemo(() => Object.fromEntries(N0VA_MODULES.map((m) => [m.id, m])), []);

  const favoriteModules = useMemo(
    () => favorites.map((id) => moduleById[id]).filter(Boolean) as N0vaModule[],
    [favorites, moduleById],
  );

  const recentModules = useMemo(
    () => recents.map((id) => moduleById[id]).filter(Boolean) as N0vaModule[],
    [recents, moduleById],
  );

  const forYouModules = useMemo(() => {
    const entries = Object.entries(openCounts)
      .filter(([, c]) => c > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id]) => moduleById[id])
      .filter(Boolean) as N0vaModule[];
    return entries.filter((m) => enabledMap[m.id] !== false && !hidden.includes(m.id));
  }, [openCounts, moduleById, enabledMap, hidden]);

  const filtered = useMemo(() => {
    let out = [...N0VA_MODULES];
    if (!showDisabled) out = out.filter((m) => enabledMap[m.id] !== false);
    if (!showHidden && !isEditMode) {
      const hiddenSet = new Set(hidden);
      out = out.filter((m) => !hiddenSet.has(m.id));
    }
    if (selectedLayer !== "all") out = out.filter((m) => m.layer === selectedLayer);
    if (phaseFilter !== "all") out = out.filter((m) => String(m.phase) === phaseFilter);
    if (favoritesOnly) {
      const favSet = new Set(favorites);
      out = out.filter((m) => favSet.has(m.id));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      const scored = out.map((m) => ({ m, score: scoreModule(m, q) })).filter((x) => x.score > 0);
      scored.sort((a, b) => b.score - a.score || a.m.name.localeCompare(b.m.name));
      out = scored.map((x) => x.m);
      if (sortBy === "alpha") out.sort((a, b) => a.name.localeCompare(b.name));
      else if (sortBy === "phase") out.sort((a, b) => a.phase - b.phase || a.name.localeCompare(b.name));
      else if (sortBy === "recent") {
        let ts: Record<string, number> = {};
        try { const raw = localStorage.getItem("n0va:launcher:recentTs"); ts = raw ? JSON.parse(raw) : {}; } catch {}
        out.sort((a, b) => (ts[b.id] ?? 0) - (ts[a.id] ?? 0));
      } else if (sortBy === "frequent") out.sort((a, b) => (openCounts[b.id] ?? 0) - (openCounts[a.id] ?? 0));
      return out;
    }
    if (sortBy === "alpha") out.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "phase") out.sort((a, b) => a.phase - b.phase || a.name.localeCompare(b.name));
    else if (sortBy === "recent") {
      let ts: Record<string, number> = {};
      try { const raw = localStorage.getItem("n0va:launcher:recentTs"); ts = raw ? JSON.parse(raw) : {}; } catch {}
      out.sort((a, b) => (ts[b.id] ?? 0) - (ts[a.id] ?? 0));
    } else if (sortBy === "frequent") out.sort((a, b) => (openCounts[b.id] ?? 0) - (openCounts[a.id] ?? 0));
    else {
      const layerOrder = new Map(N0VA_LAYERS.map((l, i) => [l, i]));
      const favSet = new Set(favorites);
      out.sort((a, b) => {
        const aFav = favSet.has(a.id) ? 0 : 1;
        const bFav = favSet.has(b.id) ? 0 : 1;
        if (aFav !== bFav) return aFav - bFav;
        const aCount = openCounts[a.id] ?? 0;
        const bCount = openCounts[b.id] ?? 0;
        if (aCount !== bCount) return bCount - aCount;
        const la = layerOrder.get(a.layer) ?? 99;
        const lb = layerOrder.get(b.layer) ?? 99;
        if (la !== lb) return la - lb;
        return a.name.localeCompare(b.name);
      });
    }
    return out;
  }, [enabledMap, selectedLayer, phaseFilter, favoritesOnly, query, sortBy, favorites, showDisabled, hidden, showHidden, isEditMode, openCounts]);

  const isFlatMode = query.trim().length > 0 || favoritesOnly || phaseFilter !== "all";
  const grouped = useMemo(() => {
    if (isFlatMode) return [];
    const layers = selectedLayer === "all" ? N0VA_LAYERS : [selectedLayer as N0vaLayer];
    return layers.map((layer) => ({ layer, modules: filtered.filter((m) => m.layer === layer) })).filter((g) => g.modules.length > 0);
  }, [filtered, isFlatMode, selectedLayer]);

  const visibleOrder = useMemo(() => (isFlatMode ? filtered : grouped.flatMap((g) => g.modules)), [filtered, grouped, isFlatMode]);

  const hasActiveFilters = query.trim().length > 0 || selectedLayer !== "all" || phaseFilter !== "all" || favoritesOnly || showDisabled || showHidden;
  const activeFilterCount = (selectedLayer !== "all" ? 1 : 0) + (phaseFilter !== "all" ? 1 : 0) + (favoritesOnly ? 1 : 0) + (showHidden ? 1 : 0) + (showDisabled ? 1 : 0);

  const clearFilters = useCallback(() => {
    setQuery("");
    setSelectedLayer("all");
    setPhaseFilter("all");
    setFavoritesOnly(false);
    setShowDisabled(false);
    setShowHidden(false);
    setSortBy("default");
    setActiveIdx(-1);
    setFiltersExpanded(false);
  }, []);

  useEffect(() => {
    if (query.trim().length > 0 && visibleOrder.length > 0) setActiveIdx(0);
    else if (query.trim().length === 0) setActiveIdx(-1);
  }, [query, visibleOrder.length]);

  useEffect(() => {
    if (activeIdx >= visibleOrder.length) setActiveIdx(visibleOrder.length - 1);
  }, [activeIdx, visibleOrder.length]);

  useEffect(() => {
    if (activeIdx < 0 || activeIdx >= visibleOrder.length) return;
    const id = visibleOrder[activeIdx]?.id;
    if (!id) return;
    const el = itemRefs.current.get(id);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIdx, visibleOrder]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isSearchFocused = document.activeElement === searchRef.current;
      const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      if (isSearchFocused) {
        if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i < 0 ? 0 : i + 1, visibleOrder.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i <= 0 ? 0 : i - 1, 0)); }
        else if (e.key === "Enter" && activeIdx >= 0 && visibleOrder[activeIdx]) { e.preventDefault(); const m = visibleOrder[activeIdx]!; pushRecent(m.id); router.push(`/m/${m.id}`); }
        else if (e.key >= "1" && e.key <= "9" && (e.metaKey || e.ctrlKey)) { const idx = parseInt(e.key, 10) - 1; if (visibleOrder[idx]) { e.preventDefault(); const m = visibleOrder[idx]!; pushRecent(m.id); router.push(`/m/${m.id}`); } }
        return;
      }
      if (isTyping) return;
      if (visibleOrder.length === 0) return;
      if (e.key >= "1" && e.key <= "9" && !e.metaKey && !e.ctrlKey && !e.altKey) { const idx = parseInt(e.key, 10) - 1; if (visibleOrder[idx]) { e.preventDefault(); const m = visibleOrder[idx]!; pushRecent(m.id); router.push(`/m/${m.id}`); } return; }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); setActiveIdx((i) => (i < 0 ? 0 : Math.min(i + 1, visibleOrder.length - 1))); }
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); setActiveIdx((i) => (i < 0 ? 0 : Math.max(i - 1, 0))); }
      else if (e.key === "Enter" && activeIdx >= 0 && visibleOrder[activeIdx]) { e.preventDefault(); const m = visibleOrder[activeIdx]!; pushRecent(m.id); router.push(`/m/${m.id}`); }
      else if (e.key === "Escape" && activeIdx >= 0) setActiveIdx(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visibleOrder, activeIdx, pushRecent, router]);

  const layerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of N0VA_LAYERS) counts[l] = 0;
    for (const m of N0VA_MODULES) {
      if (!showDisabled && enabledMap[m.id] === false) continue;
      if (!showHidden && hidden.includes(m.id)) continue;
      counts[m.layer] = (counts[m.layer] ?? 0) + 1;
    }
    return counts;
  }, [enabledMap, showDisabled, hidden, showHidden]);

  const onPinnedDragStart = useCallback((id: string) => setDraggedId(id), []);
  const onPinnedDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);
  const onPinnedDrop = useCallback((e: React.DragEvent, overId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === overId) return;
    const from = favorites.indexOf(draggedId);
    const to = favorites.indexOf(overId);
    if (from === -1 || to === -1) return;
    const next = [...favorites];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    setFavorites(next);
    setDraggedId(null);
  }, [draggedId, favorites, setFavorites]);
  const onPinnedDragEnd = useCallback(() => setDraggedId(null), []);

  // -----------------------------------------------------------------------
  // Render helpers — decluttered
  // -----------------------------------------------------------------------
  const renderTile = (module: N0vaModule, idx: number) => {
    const meta = phaseMeta(module);
    const isFav = favorites.includes(module.id);
    const isHidden = hidden.includes(module.id);
    const isDisabled = enabledMap[module.id] === false;
    const isRecent = recents.includes(module.id);
    const isActive = visibleOrder[activeIdx]?.id === module.id;
    const q = query.trim();
    const quick = QUICK_ACTIONS[module.id];
    // clutterless: show phase badge only for non-core or hidden/disabled; hide in grouped view
    const showPhase = isHidden || isDisabled || (isFlatMode && meta.tone !== "success") || isEditMode;

    return (
      <Link
        key={module.id}
        href={`/m/${module.id}`}
        ref={(el) => { if (el) itemRefs.current.set(module.id, el as unknown as HTMLAnchorElement); else itemRefs.current.delete(module.id); }}
        onClick={() => pushRecent(module.id)}
        className={`nv-launcher-tile ${viewMode === "list" ? "nv-launcher-tile-list" : ""} ${density === "compact" ? "nv-launcher-tile-compact" : ""} ${isDisabled ? "nv-launcher-tile-disabled" : ""} ${isActive ? "nv-launcher-tile-focused" : ""} ${isHidden ? "nv-launcher-tile-hidden" : ""} ${isEditMode ? "nv-launcher-tile-edit" : ""}`}
        aria-label={`${module.name} — ${module.description}`}
        onFocus={() => { const found = visibleOrder.findIndex((m) => m.id === module.id); if (found >= 0) setActiveIdx(found); }}
        style={{ animationDelay: `${Math.min(idx * 16, 160)}ms` } as React.CSSProperties}
      >
        <div className="nv-launcher-tile-top">
          <ModuleIcon module={module} size={viewMode === "list" ? 36 : density === "compact" ? 36 : 42} />
          <div className="nv-launcher-tile-top-right">
            {showPhase ? <Badge tone={isDisabled || isHidden ? "neutral" : meta.tone}>{isDisabled ? "Disabled" : isHidden ? "Hidden" : meta.label}</Badge> : null}
            <button type="button" aria-label={isFav ? `Unpin ${module.name}` : `Pin ${module.name}`} aria-pressed={isFav} title={isFav ? "Unpin" : "Pin"} className={`nv-launcher-pin ${isFav ? "nv-launcher-pin-active" : ""}`} onClick={(e) => toggleFavorite(module.id, e)}>
              <span aria-hidden>{isFav ? "★" : "☆"}</span>
            </button>
            {isEditMode ? (
              <button type="button" aria-label={isHidden ? `Unhide ${module.name}` : `Hide ${module.name}`} title={isHidden ? "Unhide" : "Hide"} className={`nv-launcher-hide ${isHidden ? "nv-launcher-hide-active" : ""}`} onClick={(e) => toggleHidden(module.id, e)}>
                <span aria-hidden>{isHidden ? "👁" : "—"}</span>
              </button>
            ) : null}
          </div>
        </div>

        <div className="nv-launcher-tile-body">
          <div className="nv-launcher-tile-name">
            {q ? highlightText(module.name, q) : module.name}
            {isRecent && !isFav && !isEditMode ? <span className="nv-launcher-recent-dot" title="Recently used" /> : null}
          </div>
          <div className="nv-launcher-tile-desc">{q ? highlightText(module.description, q) : module.description}</div>
        </div>

        {/* clutterless: foot only in flat/search context, otherwise hide layer/codename */}
        {isFlatMode ? (
          <div className="nv-launcher-tile-foot nv-launcher-tile-foot-minimal">
            <span className="nv-launcher-tile-layer">{module.layer.replace(/^L\d+\s*/, "")}</span>
            <span className="nv-launcher-tile-codename">{q ? highlightText(module.codename, q) : module.codename}</span>
          </div>
        ) : null}
        {quick && !isEditMode ? (
          <Link href={quick.href} onClick={(e) => { e.stopPropagation(); pushRecent(module.id); }} className="nv-launcher-quick" title={quick.label} aria-label={quick.label}>+ {quick.label}</Link>
        ) : null}
      </Link>
    );
  };

  const renderPinnedTile = (module: N0vaModule, idx: number) => {
    const meta = phaseMeta(module);
    const isActive = visibleOrder[activeIdx]?.id === module.id;
    const q = query.trim();
    const isDragging = draggedId === module.id;
    const showPhase = true;
    return (
      <Link key={module.id} href={`/m/${module.id}`} draggable onDragStart={() => onPinnedDragStart(module.id)} onDragOver={onPinnedDragOver} onDrop={(e) => onPinnedDrop(e, module.id)} onDragEnd={onPinnedDragEnd} ref={(el) => { if (el) itemRefs.current.set(module.id, el as unknown as HTMLAnchorElement); else itemRefs.current.delete(module.id); }} onClick={() => pushRecent(module.id)} className={`nv-launcher-tile ${viewMode === "list" ? "nv-launcher-tile-list" : ""} ${density === "compact" ? "nv-launcher-tile-compact" : ""} ${isActive ? "nv-launcher-tile-focused" : ""} ${isDragging ? "nv-launcher-tile-dragging" : ""}`} aria-label={`${module.name}`} title="Drag to reorder" style={{ animationDelay: `${Math.min(idx * 16, 160)}ms` } as React.CSSProperties}>
        <div className="nv-launcher-tile-top">
          <ModuleIcon module={module} size={viewMode === "list" ? 36 : density === "compact" ? 36 : 42} />
          <div className="nv-launcher-tile-top-right">
            {showPhase ? <Badge tone={meta.tone}>{meta.label}</Badge> : null}
            <span className="nv-launcher-drag-handle" aria-hidden title="Drag">⋮⋮</span>
            <button type="button" aria-label={`Unpin ${module.name}`} aria-pressed={true} title="Unpin" className="nv-launcher-pin nv-launcher-pin-active" onClick={(e) => toggleFavorite(module.id, e)}><span aria-hidden>★</span></button>
          </div>
        </div>
        <div className="nv-launcher-tile-body">
          <div className="nv-launcher-tile-name">{q ? highlightText(module.name, q) : module.name}</div>
          <div className="nv-launcher-tile-desc">{q ? highlightText(module.description, q) : module.description}</div>
        </div>
        {isFlatMode ? (
          <div className="nv-launcher-tile-foot nv-launcher-tile-foot-minimal">
            <span className="nv-launcher-tile-layer">{module.layer.replace(/^L\d+\s*/, "")}</span>
            <span className="nv-launcher-tile-codename">{module.codename}</span>
          </div>
        ) : null}
      </Link>
    );
  };

  return (
    <div className={`nv-launcher-enhanced nv-launcher-clutterless ${density === "compact" ? "nv-launcher-density-compact" : ""}`} style={{ maxWidth: 1120, margin: "0 auto" }}>
      {/* ── Header — minimal ───────────────────────────────── */}
      <div className="nv-launcher-header nv-launcher-header-minimal">
        <div className="nv-launcher-header-text">
          <h1 className="nv-launcher-title">Workspace</h1>
          <p className="nv-launcher-subtitle">One system. Every module. <span className="nv-kbd">⌘K</span> to jump.</p>
        </div>
        <div className="nv-launcher-header-actions">
          <div className="nv-launcher-viewtoggle" role="group" aria-label="View">
            <button type="button" aria-pressed={viewMode === "grid"} className={`nv-launcher-viewbtn ${viewMode === "grid" ? "nv-launcher-viewbtn-active" : ""}`} onClick={() => setViewMode("grid")} title="Grid">⊞</button>
            <button type="button" aria-pressed={viewMode === "list"} className={`nv-launcher-viewbtn ${viewMode === "list" ? "nv-launcher-viewbtn-active" : ""}`} onClick={() => setViewMode("list")} title="List">☰</button>
          </div>
          <div ref={settingsRef} className="nv-launcher-settings-wrap">
            <button type="button" className={`nv-launcher-settings-btn ${settingsOpen ? "nv-launcher-settings-btn-active" : ""}`} onClick={() => setSettingsOpen((v) => !v)} aria-label="Launcher settings" title="Settings">⋯</button>
            {settingsOpen ? (
              <div className="nv-launcher-settings-menu" role="menu">
                <button role="menuitem" className={`nv-launcher-settings-item ${density === "compact" ? "nv-launcher-settings-item-active" : ""}`} onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")}>◧ {density === "compact" ? "Comfortable" : "Compact"} density</button>
                <button role="menuitem" className={`nv-launcher-settings-item ${isEditMode ? "nv-launcher-settings-item-active" : ""}`} onClick={() => { setIsEditMode((v) => !v); setSettingsOpen(false); }}>{isEditMode ? "✓ Exit edit" : "✎ Customize"}</button>
                <button role="menuitem" className="nv-launcher-settings-item" onClick={() => { clearFilters(); setSettingsOpen(false); }}>↺ Clear filters</button>
                <div className="nv-launcher-settings-sep" />
                <div className="nv-launcher-settings-hint">{filtered.length} shown · {hiddenCount} hidden · {enabledCount} enabled</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Search — hero, minimal meta ─────────────────────── */}
      <div className="nv-launcher-search-wrap">
        <div className={`nv-launcher-search nv-launcher-search-minimal ${activeIdx >= 0 ? "nv-launcher-search-active" : ""}`}>
          <span className="nv-launcher-search-icon" aria-hidden>⌕</span>
          <input ref={searchRef} className="nv-launcher-search-input" placeholder="Search modules…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search modules" autoComplete="off" spellCheck={false} />
          {query ? (
            <button type="button" className="nv-launcher-search-clear" onClick={() => { setQuery(""); setActiveIdx(-1); searchRef.current?.focus(); }} aria-label="Clear">×</button>
          ) : (
            <span className="nv-launcher-search-hint"><span className="nv-kbd">/</span></span>
          )}
        </div>
        <div className="nv-launcher-search-meta nv-launcher-search-meta-minimal">
          <span className="nv-launcher-search-count-muted">{query ? `${filtered.length} results` : `${filtered.length} modules`}{activeFilterCount > 0 ? ` · ${activeFilterCount} filter${activeFilterCount>1?"s":""}` : ""}</span>
          <span className="nv-launcher-search-count-muted nv-launcher-search-kbd-hint"><span className="nv-kbd">↑↓</span> <span className="nv-kbd">↵</span></span>
        </div>
      </div>

      {/* ── Toolbar — progressive disclosure ─────────────────── */}
      <div className="nv-launcher-toolbar">
        <div className="nv-launcher-toolbar-left">
          <button type="button" className={`nv-launcher-filter-toggle ${filtersExpanded ? "nv-launcher-filter-toggle-active" : ""} ${activeFilterCount>0 ? "nv-launcher-filter-toggle-hasactive" : ""}`} onClick={() => setFiltersExpanded((v) => !v)} aria-expanded={filtersExpanded}>
            Filters {activeFilterCount>0 ? <span className="nv-launcher-filter-badge">{activeFilterCount}</span> : null} <span className="nv-launcher-filter-chevron">{filtersExpanded ? "▴" : "▾"}</span>
          </button>
          {/* minimal layer chips — always visible but muted, no counts */}
          <div className="nv-launcher-chips nv-launcher-chips-minimal" role="group" aria-label="Layer">
            <button type="button" className={`nv-launcher-chip nv-launcher-chip-minimal ${selectedLayer === "all" ? "nv-launcher-chip-active" : ""}`} onClick={() => setSelectedLayer("all")}>All</button>
            {N0VA_LAYERS.filter((l) => (layerCounts[l] ?? 0) > 0 || showDisabled).slice(0, 6).map((layer) => (
              <button key={layer} type="button" className={`nv-launcher-chip nv-launcher-chip-minimal ${selectedLayer === layer ? "nv-launcher-chip-active" : ""}`} onClick={() => setSelectedLayer(layer)} title={layer}>
                {layer.replace(/^L\d+\s*/, "").split(" ")[0]}
              </button>
            ))}
          </div>
        </div>
        <div className="nv-launcher-toolbar-right">
          <label className="nv-launcher-select-wrap nv-launcher-select-wrap-minimal" title="Sort">
            <select className="nv-launcher-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} aria-label="Sort">
              <option value="default">Smart</option>
              <option value="alpha">A–Z</option>
              <option value="recent">Recent</option>
              <option value="frequent">Frequent</option>
            </select>
          </label>
        </div>
      </div>

      {filtersExpanded ? (
        <div className="nv-launcher-filters nv-launcher-filters-expanded">
          <div className="nv-launcher-chips" role="group" aria-label="Filter by layer (expanded)">
            <button type="button" className={`nv-launcher-chip ${selectedLayer === "all" ? "nv-launcher-chip-active" : ""}`} onClick={() => setSelectedLayer("all")}>All <span className="nv-launcher-chip-count">{showDisabled ? totalModules : enabledCount}</span></button>
            {N0VA_LAYERS.map((layer) => {
              const count = layerCounts[layer] ?? 0;
              if (count === 0 && !showDisabled && !showHidden) return null;
              const label = layer.replace(/^L\d+\s*/, "");
              return (
                <button key={layer} type="button" className={`nv-launcher-chip ${selectedLayer === layer ? "nv-launcher-chip-active" : ""}`} onClick={() => setSelectedLayer(layer)} title={layer}>
                  <span className="nv-launcher-chip-dot" data-layer={layer} />
                  {label}
                  <span className="nv-launcher-chip-count">{count}</span>
                </button>
              );
            })}
          </div>
          <div className="nv-launcher-controls">
            <label className="nv-launcher-select-wrap" title="Phase"><span className="nv-launcher-select-label">Phase</span><select className="nv-launcher-select" value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)} aria-label="Phase"><option value="all">All phases</option><option value="0">Foundation</option><option value="1">Core</option><option value="2">Phase 2</option><option value="3">Phase 3</option><option value="4">Phase 4</option><option value="5">Phase 5</option></select></label>
            <button type="button" className={`nv-launcher-toggle ${favoritesOnly ? "nv-launcher-toggle-active" : ""}`} onClick={() => setFavoritesOnly((v) => !v)} aria-pressed={favoritesOnly}>★ Pinned only</button>
            <label className={`nv-launcher-toggle ${showHidden ? "nv-launcher-toggle-active" : ""}`}><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} style={{ position: "absolute", opacity: 0, pointerEvents: "none" }} aria-label="Show hidden" />👁 Hidden</label>
            <label className={`nv-launcher-toggle ${showDisabled ? "nv-launcher-toggle-active" : ""}`}><input type="checkbox" checked={showDisabled} onChange={(e) => setShowDisabled(e.target.checked)} style={{ position: "absolute", opacity: 0, pointerEvents: "none" }} aria-label="Show disabled" />Show disabled</label>
            {hasActiveFilters ? <button type="button" className="nv-launcher-clear" onClick={clearFilters}>Clear</button> : null}
          </div>
        </div>
      ) : null}

      {isEditMode ? (
        <div className="nv-launcher-editbar" role="status">
          <span className="nv-launcher-editbar-title">Customize</span>
          <span className="nv-launcher-editbar-desc">Hide modules you don’t use. Stars pin. Hidden stays dimmed until you toggle 👁 Hidden.</span>
          <div className="nv-launcher-editbar-actions">
            {hiddenCount > 0 ? <button type="button" className="nv-btn nv-btn-secondary nv-btn-sm" onClick={() => setHidden([])}>Restore</button> : null}
            <button type="button" className="nv-btn nv-btn-primary nv-btn-sm" onClick={() => setIsEditMode(false)}>Done</button>
          </div>
        </div>
      ) : null}

      {/* ── For You — minimal ────────────────────────────────── */}
      {!hasActiveFilters && !isEditMode && forYouModules.length > 0 ? (
        <section className="nv-launcher-section nv-launcher-section-foryou nv-launcher-section-minimal" aria-label="For you">
          <div className="nv-launcher-section-head nv-launcher-section-head-minimal">
            <h2 className="nv-launcher-section-title">For you</h2>
            <span className="nv-launcher-section-count">{forYouModules.length}</span>
          </div>
          <div className={`nv-launcher ${viewMode === "list" ? "nv-launcher-listmode" : ""}`}>
            {forYouModules.map((m, i) => renderTile(m, i))}
          </div>
        </section>
      ) : null}

      {/* ── Pinned ───────────────────────────────────────────── */}
      {!hasActiveFilters && !isEditMode && favoriteModules.length > 0 ? (
        <section className="nv-launcher-section nv-launcher-section-pinned nv-launcher-section-minimal" aria-label="Pinned">
          <div className="nv-launcher-section-head nv-launcher-section-head-minimal">
            <h2 className="nv-launcher-section-title">Pinned</h2>
            <span className="nv-launcher-section-count">{favoriteModules.length}</span>
            <button type="button" className="nv-launcher-section-action" onClick={() => setFavorites([])} title="Unpin all">Clear</button>
          </div>
          <div className={`nv-launcher ${viewMode === "list" ? "nv-launcher-listmode" : ""}`}>
            {favoriteModules.map((m, i) => renderPinnedTile(m, i))}
          </div>
        </section>
      ) : null}

      {/* ── Recents — capped, minimal ────────────────────────── */}
      {!hasActiveFilters && !isEditMode && !favoritesOnly && recentModules.length > 0 ? (
        <section className="nv-launcher-section nv-launcher-section-recent nv-launcher-section-minimal" aria-label="Recent">
          <div className="nv-launcher-section-head nv-launcher-section-head-minimal">
            <h2 className="nv-launcher-section-title">Recent</h2>
            <span className="nv-launcher-section-count">{Math.min(recentModules.length, 6)}</span>
            <button type="button" className="nv-launcher-section-action" onClick={() => { setRecents([]); try { localStorage.removeItem("n0va:launcher:recentTs"); } catch {} }}>Clear</button>
          </div>
          <div className={`nv-launcher ${viewMode === "list" ? "nv-launcher-listmode" : ""}`}>
            {recentModules.slice(0, 6).map((m, i) => renderTile(m, i))}
          </div>
        </section>
      ) : null}

      {/* ── Main grid ────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="nv-launcher-empty nv-launcher-empty-minimal" role="status">
          <div className="nv-launcher-empty-icon">∅</div>
          <div className="nv-launcher-empty-title">No matches</div>
          <p className="nv-launcher-empty-desc">Try another search or adjust filters.</p>
          <div className="nv-launcher-empty-actions">
            <button type="button" className="nv-btn nv-btn-secondary nv-btn-sm" onClick={clearFilters}>Clear filters</button>
            {hiddenCount > 0 ? <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" onClick={() => setShowHidden(true)}>Show hidden</button> : null}
          </div>
        </div>
      ) : isFlatMode ? (
        <section className="nv-launcher-section" aria-label="Results">
          <div className="nv-launcher-section-head nv-launcher-section-head-minimal">
            <h2 className="nv-launcher-section-title">{favoritesOnly ? "Pinned" : query ? "Results" : "Filtered"}</h2>
            <span className="nv-launcher-section-count">{filtered.length}</span>
          </div>
          <div className={`nv-launcher ${viewMode === "list" ? "nv-launcher-listmode" : ""}`}>{filtered.map((m, i) => renderTile(m, i))}</div>
        </section>
      ) : (
        grouped.map((group) => {
          const isCollapsed = !!collapsed[group.layer];
          return (
            <section key={group.layer} className="nv-launcher-section" aria-label={group.layer}>
              <button type="button" className="nv-launcher-layer-head" onClick={() => toggleCollapse(group.layer)} aria-expanded={!isCollapsed} aria-controls={`nv-layer-${group.layer.replace(/\s+/g, "-")}`}>
                <span className="nv-launcher-layer-chevron" aria-hidden>{isCollapsed ? "▸" : "▾"}</span>
                <h2 className="nv-launcher-layer-title">{group.layer}</h2>
                <span className="nv-launcher-layer-count">{group.modules.length}</span>
                <span className="nv-launcher-layer-line" aria-hidden />
              </button>
              {!isCollapsed ? (
                <div id={`nv-layer-${group.layer.replace(/\s+/g, "-")}`} className={`nv-launcher ${viewMode === "list" ? "nv-launcher-listmode" : ""}`}>
                  {group.modules.map((m, i) => renderTile(m, i))}
                </div>
              ) : null}
            </section>
          );
        })
      )}

      <div className="nv-launcher-footer nv-launcher-footer-minimal">
        <span className="nv-launcher-footer-tip">Press <span className="nv-kbd">/</span> to search · <span className="nv-kbd">⌘K</span> to jump</span>
        <a href="/launcher" className="nv-link" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Top ↑</a>
      </div>
    </div>
  );
}
