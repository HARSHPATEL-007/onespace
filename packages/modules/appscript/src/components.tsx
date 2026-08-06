"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog } from "@n0va/ui";
import type { ScriptWithRuns } from "./server";

export interface AppScriptActions {
  create: (formData: FormData) => Promise<void>;
  update: (id: string, formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
  run: (formData: FormData) => Promise<{ id: string; status: string; output: string; error: string; durationMs: number }>;
}

const DEFAULT_CODE = `// N0VA AppScript — JavaScript sandbox
const name = "N0VA";
console.log("Hello from", name, "v3!");
console.log("Workspace ID available via $ws at runtime");
const total = [1, 2, 3, 4].reduce((a, b) => a + b, 0);
console.log("sum =", total);
`;

export function ScriptRunner({ scripts, actions }: { scripts: ScriptWithRuns[]; actions: AppScriptActions }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(scripts[0]?.id ?? null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<{ status: string; output: string; error: string; durationMs: number } | null>(null);

  const selected = scripts.find((s) => s.id === selectedId) ?? null;

  const openScript = (s: ScriptWithRuns) => {
    setSelectedId(s.id);
    setName(s.name);
    setCode(s.code);
    setLastResult(null);
  };

  const save = () => {
    if (!name.trim() || !selected) return;
    const fd = new FormData();
    fd.set("name", name);
    fd.set("language", "js");
    fd.set("code", code);
    void actions.update(selected.id, fd).then(() => router.refresh());
  };

  const run = () => {
    if (!selected || running) return;
    setRunning(true);
    const fd = new FormData();
    fd.set("id", selected.id);
    void actions
      .run(fd)
      .then((r) => setLastResult({ status: r.status, output: r.output, error: r.error, durationMs: r.durationMs }))
      .finally(() => setRunning(false));
  };

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", display: "grid", gridTemplateColumns: "230px 1fr 1fr", gap: 16, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Button size="sm" onClick={() => setCreating(true)}>+ New script</Button>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {scripts.map((s) => (
            <button
              key={s.id}
              onClick={() => openScript(s)}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 10,
                border: selectedId === s.id ? "1px solid var(--nv-color-primary)" : "1px solid transparent",
                background: selectedId === s.id ? "var(--nv-color-surface-raised)" : "transparent",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 700 }}>{s.name}</div>
              <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 2 }}>
                {s.runs[0] ? (s.runs[0].status === "success" ? "✓" : "✕") + ` ${s.runs[0].durationMs}ms` : "Never run"}
              </div>
            </button>
          ))}
          {scripts.length === 0 && <div className="nv-empty" style={{ padding: 16, fontSize: 12 }}>No scripts yet</div>}
        </div>
      </div>

      {selected ? (
        <>
          <div className="nv-card" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="nv-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Script name" style={{ flex: 1 }} />
              <Button variant="secondary" size="sm" onClick={save}>Save</Button>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              style={{
                height: 380,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12,
                lineHeight: 1.6,
                padding: 12,
                borderRadius: 10,
                border: "1px solid var(--nv-color-border)",
                background: "#0d1117",
                color: "#e6edf3",
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Button size="sm" onClick={run} disabled={running}>{running ? "Running…" : "Run script"}</Button>
              <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>sandboxed · 5s timeout</span>
              <div style={{ flex: 1 }} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!window.confirm(`Delete "${selected.name}"?`)) return;
                  const fd = new FormData();
                  fd.set("id", selected.id);
                  void actions.remove(fd).then(() => {
                    setSelectedId(null);
                    setCode("");
                    setName("");
                    router.refresh();
                  });
                }}
              >
                Delete
              </Button>
            </div>
          </div>

          <div className="nv-card" style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>CONSOLE</div>
            {lastResult && (
              <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>
                {lastResult.status === "success" ? "✓" : "✕"} {lastResult.durationMs}ms
              </div>
            )}
            <pre
              style={{
                flex: 1,
                minHeight: 300,
                fontFamily: "ui-monospace, Menlo, monospace",
                fontSize: 12,
                lineHeight: 1.6,
                background: "var(--nv-color-bg)",
                borderRadius: 10,
                padding: 12,
                margin: 0,
                whiteSpace: "pre-wrap",
                overflow: "auto",
                color: lastResult?.status === "failed" ? "#ef4444" : "inherit",
              }}
            >
              {lastResult ? lastResult.output || lastResult.error || "…" : "Run a script to see console output here."}
            </pre>
            {selected.runs.length > 0 && (
              <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>
                {selected.runs.length} previous run{selected.runs.length === 1 ? "" : "s"} (latest {selected.runs[0].durationMs}ms)
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="nv-empty" style={{ gridColumn: "2 / 4", minHeight: 320 }}>
          <div>Select a script from the left, or create one</div>
          <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>New script</Button>
        </div>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New script"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              type="submit"
              form="create-script-form"
              onClick={() => setCreating(false)}
            >
              Create
            </Button>
          </>
        }
      >
        <form
          id="create-script-form"
          action={(fd) => {
            void actions.create(fd).then(() => {
              setCreating(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input className="nv-input" name="name" placeholder="Script name" required autoFocus />
          <textarea className="nv-input" name="code" rows={8} defaultValue={DEFAULT_CODE} spellCheck={false} style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }} />
          <input type="hidden" name="language" value="js" />
        </form>
      </Dialog>
    </div>
  );
}
