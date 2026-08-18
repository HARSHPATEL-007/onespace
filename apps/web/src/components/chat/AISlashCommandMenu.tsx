"use client";
import { useState, type CSSProperties } from "react";
import { Button } from "@n0va/ui";

export const NATIVE_COMMANDS = [
  { cmd: "/task", desc: "Create a task from chat", icon: "✅" },
  { cmd: "/status", desc: "Set your presence (ONLINE/AWAY/BUSY/DND/IDLE)", icon: "🟢" },
  { cmd: "/poll", desc: "Create a poll (\"Q\" | A | B ... ttl:5m)", icon: "📊" },
  { cmd: "/remind", desc: "Set a reminder (in 10m / at 15:30)", icon: "⏰" },
  { cmd: "/help", desc: "List available commands", icon: "❓" },
];

export const AI_COMMANDS = [
  { cmd: "/summarize", desc: "Summarize recent messages", icon: "📝" },
  { cmd: "/smart-reply", desc: "Suggest a reply to last message", icon: "💡" },
  { cmd: "/translate", desc: "Translate last message", icon: "🌐" },
  { cmd: "/action-items", desc: "Extract action items", icon: "✅" },
  { cmd: "/sentiment", desc: "Analyze conversation sentiment", icon: "😊" },
];

export function AISlashCommandMenu({
  channelId,
  typed,
  onNative,
  onResult,
  onClose,
}: {
  channelId: string;
  typed: string;
  onNative: (command: string, args: string, channelId: string) => Promise<{ ok: boolean; message: string }> | void;
  onResult: (text: string, command: string) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const runAI = async (command: string, targetLang?: string) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/chat/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command, channelId, targetLang }) });
      if (!res.ok) throw new Error((await res.json()).error || "Command failed");
      const data = await res.json();
      onResult(data.result, command);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  };

  const runNative = async (command: string) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const typedCmd = typed.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
      const args = typedCmd === command ? typed.trim().slice(command.length).trim() : "";
      const res = await onNative(command, args, channelId);
      if (res && "ok" in res) {
        if (res.ok) setNotice(res.message);
        else setError(res.message);
      }
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Command failed"); }
    finally { setLoading(false); }
  };

  const sectionLabel: CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--nv-color-text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "4px 8px" };
  const itemStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: "none", background: "none", borderRadius: "var(--nv-radius-md)", cursor: "pointer", textAlign: "left", fontSize: "var(--nv-font-sm)" };

  return (
    <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, right: 0, background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-lg)", boxShadow: "var(--nv-shadow-lg)", padding: "var(--nv-space-2)", zIndex: 30 }}>
      <div style={sectionLabel}>Commands</div>
      {NATIVE_COMMANDS.map(c => (
        <button key={c.cmd} type="button" onClick={() => runNative(c.cmd)} disabled={loading} style={itemStyle}>
          <span>{c.icon}</span>
          <div>
            <div style={{ fontWeight: 600, fontFamily: "var(--nv-font-mono)", fontSize: 12 }}>{c.cmd}</div>
            <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>{c.desc}</div>
          </div>
        </button>
      ))}
      <div style={{ ...sectionLabel, marginTop: 4 }}>AI Commands</div>
      {AI_COMMANDS.map(c => (
        <button key={c.cmd} type="button" onClick={() => runAI(c.cmd)} disabled={loading} style={itemStyle}>
          <span>{c.icon}</span>
          <div>
            <div style={{ fontWeight: 600, fontFamily: "var(--nv-font-mono)", fontSize: 12 }}>{c.cmd}</div>
            <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>{c.desc}</div>
          </div>
        </button>
      ))}
      {notice && <div style={{ padding: "4px 12px", fontSize: 11, color: "var(--nv-color-success)" }}>{notice}</div>}
      {error && <div style={{ padding: "4px 12px", fontSize: 11, color: "var(--nv-color-danger)" }}>{error}</div>}
    </div>
  );
}