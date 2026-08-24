"use client";

import { useState } from "react";

export function CodePreview({ code, language, truncated, hasSecrets, secretTypes }: { code: string; language: string | null; truncated: boolean; hasSecrets: boolean; secretTypes: string[] }) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(truncated);
  const lines = code.split("\n");
  const show = collapsed ? lines.slice(0, 40).join("\n") : code;

  return (
    <div style={{ marginTop: 6, border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", overflow: "hidden", maxWidth: 560, background: "var(--nv-color-surface-2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--nv-color-border)", background: "var(--nv-color-surface)" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--nv-color-text-faint)", textTransform: "uppercase" }}>{language ?? "code"}</span>
        {hasSecrets && <span style={{ fontSize: 10, background: "var(--nv-color-danger)", color: "#fff", borderRadius: 999, padding: "1px 6px" }}>secrets redacted: {secretTypes.join(", ")}</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button
            onClick={async () => { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
            style={{ border: "1px solid var(--nv-color-border)", background: "var(--nv-color-surface)", borderRadius: "var(--nv-radius-full)", padding: "2px 8px", fontSize: 11, cursor: "pointer" }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={() => setCollapsed((v) => !v)}
            style={{ border: "1px solid var(--nv-color-border)", background: "var(--nv-color-surface)", borderRadius: "var(--nv-radius-full)", padding: "2px 8px", fontSize: 11, cursor: "pointer" }}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </span>
      </div>
      <pre style={{ margin: 0, padding: "8px 10px", fontSize: 12, lineHeight: 1.5, overflowX: "auto", maxHeight: collapsed ? 200 : 420, whiteSpace: "pre", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
        <code>
          {show.split("\n").map((line, i) => (
            <span key={i} style={{ display: "flex" }}>
              <span style={{ minWidth: 28, color: "var(--nv-color-text-faint)", userSelect: "none", textAlign: "right", marginRight: 10 }}>{i + 1}</span>
              <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{line || " "}</span>
            </span>
          ))}
        </code>
      </pre>
      {truncated && collapsed && <div style={{ padding: "4px 10px", fontSize: 10, color: "var(--nv-color-text-faint)", borderTop: "1px solid var(--nv-color-border)" }}>Truncated — expand to see full file</div>}
    </div>
  );
}
