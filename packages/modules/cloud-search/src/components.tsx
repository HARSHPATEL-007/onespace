"use client";

import { useState } from "react";
import { Button } from "@n0va/ui";
import type { SearchHit } from "./server";

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

  const grouped = hits.reduce<Record<string, SearchHit[]>>((acc, h) => {
    (acc[h.moduleLabel] ??= []).push(h);
    return acc;
  }, {});

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
        />
        <Button onClick={() => void runSearch(query)} disabled={searching}>
          {searching ? "…" : "Search"}
        </Button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: "var(--nv-space-4)", flexWrap: "wrap" }}>
        {scopes.map((s) => (
          <span
            key={s.module}
            style={{
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 999,
              border: "1px solid var(--nv-color-border)",
              color: "var(--nv-color-text-muted)",
            }}
          >
            {s.label}
          </span>
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
