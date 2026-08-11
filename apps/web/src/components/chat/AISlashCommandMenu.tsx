"use client";
import { useState } from "react";
import { Button } from "@n0va/ui";

const COMMANDS = [
  { cmd: "/summarize", desc: "Summarize recent messages", icon: "📝" },
  { cmd: "/smart-reply", desc: "Suggest a reply to last message", icon: "💡" },
  { cmd: "/translate", desc: "Translate last message", icon: "🌐" },
  { cmd: "/action-items", desc: "Extract action items", icon: "✅" },
  { cmd: "/sentiment", desc: "Analyze conversation sentiment", icon: "😊" },
];

export function AISlashCommandMenu({ channelId, onResult, onClose }: { channelId: string; onResult: (text: string, command: string) => void; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (command: string, targetLang?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command, channelId, targetLang }) });
      if (!res.ok) throw new Error((await res.json()).error || "Command failed");
      const data = await res.json();
      onResult(data.result, command);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, right: 0, background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-lg)", boxShadow: "var(--nv-shadow-lg)", padding: "var(--nv-space-2)", zIndex: 30 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--nv-color-text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "4px 8px" }}>AI Commands</div>
      {COMMANDS.map(c => (
        <button key={c.cmd} onClick={() => run(c.cmd)} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: "none", background: "none", borderRadius: "var(--nv-radius-md)", cursor: "pointer", textAlign: "left", fontSize: "var(--nv-font-sm)" }}>
          <span>{c.icon}</span>
          <div>
            <div style={{ fontWeight: 600, fontFamily: "var(--nv-font-mono)", fontSize: 12 }}>{c.cmd}</div>
            <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>{c.desc}</div>
          </div>
        </button>
      ))}
      {error && <div style={{ padding: "4px 12px", fontSize: 11, color: "var(--nv-color-danger)" }}>{error}</div>}
    </div>
  );
}
