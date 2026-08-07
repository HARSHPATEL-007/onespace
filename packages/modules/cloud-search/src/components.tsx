"use client";

import { useEffect, useState } from "react";
import { Button } from "@n0va/ui";
import type { SearchHit } from "./server";

const RECENTS_KEY = "n0va-search-recent";
const RECENTS_MAX = 6;

export function SearchPanel({
  initialHits,
  scopes,
}: {
  initialHits: SearchHit[];
  scopes: Array<{ module: string; label: string }>;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>(initialHits);
  const [searching, setSearching] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [activeScopes, setActiveScopes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const stored = window.localStorage.getItem(RECENTS_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as unknown;
      setRecents(Array.isArray(parsed) ? (parsed as string[]) : []);
    } catch {}
  }, []);

  useEffect(() => {
    if (recents.length === 0) {
      window.localStorage.removeItem(RECENTS_KEY);
      return;
    }
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(recents.slice(0, RECENTS_MAX)));
  }, [recents]);

  const runSearch = async (q: string) => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const data = (await res.json()) as SearchHit[];
      setHits(data.map((h) => ({ ...h, updatedAt: new Date(h.updatedAt) })));
    } finally {
      setSearching(false);
    }
  };

  const submitSearch = (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    void runSearch(trimmed);
    setRecents((prev) => [trimmed, ...prev.filter((r) => r.toLowerCase() !== trimmed.toLowerCase())].slice(0, RECENTS_MAX));
  };

  const toggleScope = (module: string) => {
    setActiveScopes((prev) => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  };

  const scopedHits = activeScopes.size === 0 ? hits : hits.filter((h) => activeScopes.has(h.module));

  const grouped = scopedHits.reduce<Record<string, SearchHit[]>>((acc, h) => {
    (acc[h.moduleLabel] ??= []).push(h);
    return acc;
  }, {});

  const chipStyle = (active: boolean) => ({
    fontSize: 11,
    padding: "3px 10px",
    borderRadius: 999,
    border: `1px solid ${active ? "var(--nv-color-primary-alpha)" : "var(--nv-color-border)"}`,
    background: active ? "var(--nv-color-primary-alpha)" : "transparent",
    color: active ? "var(--nv-color-primary)" : "var(--nv-color-text-muted)",
    cursor: "pointer",
    fontFamily: "inherit",
  });

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800, marginBottom: "var(--nv-space-4)" }}>
        N0VA CLOUD SEARCH
      </h1>
      <div style={{ display: "flex", gap: 8, marginBottom: "var(--nv-space-4)" }}>
        <input
          className="nv-input"
          style={{ flex: 1, fontSize: "var(--nv-font-lg)", padding: "10px 14px" }}
          placeholder="Search docs, mail, tasks, notes, contacts…"
          value={query}
          autoFocus
          onChange={(e) => {
            setQuery(e.target.value);
            void runSearch(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitSearch(query);
          }}
        />
        <Button onClick={() => submitSearch(query)} disabled={searching}>
          {searching ? "…" : "Search"}
        </Button>
      </div>

      {recents.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: "var(--nv-space-4)", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--nv-color-text-faint)", letterSpacing: "0.06em" }}>
            RECENT
          </span>
          {recents.map((r) => (
            <button
              key={r}
              type="button"
              style={chipStyle(false)}
              onClick={() => {
                setQuery(r);
                void runSearch(r);
              }}
            >
              {r}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRecents([])}
            style={{ fontSize: 11, color: "var(--nv-color-text-faint)", cursor: "pointer", background: "none", border: "none", padding: "3px 6px", fontFamily: "inherit" }}
          >
            Clear
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: "var(--nv-space-4)", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" style={chipStyle(activeScopes.size === 0)} onClick={() => setActiveScopes(new Set())}>
          All
        </button>
        {scopes.map((s) => (
          <button
            key={s.module}
            type="button"
            style={chipStyle(activeScopes.has(s.module))}
            onClick={() => toggleScope(s.module)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {query.trim().length < 2 ? (
        <div className="nv-empty">
          <div>Type at least 2 characters to search your workspace</div>
        </div>
      ) : hits.length === 0 && !searching ? (
        <div className="nv-empty">
          <div>No results for "{query}"</div>
        </div>
      ) : scopedHits.length === 0 && !searching ? (
        <div className="nv-empty">
          <div>No results for "{query}" in selected scopes</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--nv-space-3)" }}>
          {Object.entries(grouped).map(([label, group]) => (
            <div key={label}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--nv-color-text-faint)", marginBottom: 6, letterSpacing: "0.06em" }}>
                {label.toUpperCase()} · {group.length}
              </div>
              <div className="nv-card" style={{ padding: 0, overflow: "hidden" }}>
                {group.map((h, i) => (
                  <a
                    key={`${h.module}-${h.id}`}
                    href={h.href}
                    style={{
                      display: "block",
                      padding: "10px 14px",
                      textDecoration: "none",
                      color: "inherit",
                      borderBottom: i === group.length - 1 ? "none" : "1px solid var(--nv-color-border)",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: "var(--nv-font-md)" }}>{h.title}</div>
                    {h.snippet && (
                      <div style={{ fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-muted)", marginTop: 2 }}>
                        {h.snippet}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 4 }}>
                      {h.updatedAt.toLocaleString()}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
