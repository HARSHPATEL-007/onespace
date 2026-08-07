"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@n0va/ui";
import type { CallLog } from "@n0va/db";

export interface VoiceActions {
  log: (formData: FormData) => Promise<void>;
  clear: (formData: FormData) => Promise<void>;
  toggleFavorite: (formData: FormData) => Promise<void>;
  setNote: (formData: FormData) => Promise<void>;
}

export interface VoiceContact {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
}

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function formatDuration(sec: number) {
  if (sec >= 60) return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  return `0:${String(sec).padStart(2, "0")}`;
}

export function VoiceDialer({ logs, contacts, actions }: { logs: CallLog[]; contacts: VoiceContact[]; actions: VoiceActions }) {
  const router = useRouter();
  const [number, setNumber] = useState("");
  const [ringing, setRinging] = useState(false);
  const [incoming, setIncoming] = useState(false);
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visibleLogs = filter === "favorites" ? logs.filter((l) => l.favorite) : logs;

  useEffect(() => {
    if (incoming) {
      timerRef.current = setTimeout(() => {
        // Missed call if nobody answers within 6s
        const fd = new FormData();
        fd.set("direction", "IN");
        fd.set("number", "+1 555 010 0199");
        fd.set("contactName", "Unknown");
        fd.set("durationSec", "0");
        fd.set("status", "missed");
        void actions.log(fd).then(() => {
          setIncoming(false);
          router.refresh();
        });
      }, 6000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [incoming, actions, router]);

  const startOutgoing = () => {
    if (!number) return;
    setRinging(true);
    const matched = contacts.find((c) => c.phone?.replace(/[^\d]/g, "") === number.replace(/[^\d]/g, ""));
    const name = matched ? `${matched.firstName} ${matched.lastName}`.trim() : "";
    setTimeout(() => {
      setRinging(false);
      const fd = new FormData();
      fd.set("direction", "OUT");
      fd.set("number", number);
      fd.set("contactName", name);
      fd.set("durationSec", String(20 + Math.floor(Math.random() * 70)));
      void actions.log(fd).then(() => router.refresh());
      setNumber("");
    }, 1800);
  };

  const answer = () => {
    setIncoming(false);
    const fd = new FormData();
    fd.set("direction", "IN");
    fd.set("number", "+1 555 010 0199");
    fd.set("contactName", "Unknown");
    fd.set("durationSec", String(15 + Math.floor(Math.random() * 45)));
    void actions.log(fd).then(() => router.refresh());
  };

  const decline = () => {
    setIncoming(false);
    const fd = new FormData();
    fd.set("direction", "IN");
    fd.set("number", "+1 555 010 0199");
    fd.set("contactName", "Unknown");
    fd.set("durationSec", "0");
    fd.set("status", "declined");
    void actions.log(fd).then(() => router.refresh());
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA VOICE</h1>
        <span className="nv-badge nv-badge-amber">simulated calls</span>
        <div style={{ flex: 1 }} />
        {!incoming && (
          <Button variant="secondary" size="sm" onClick={() => setIncoming(true)}>
            📞 Simulate incoming
          </Button>
        )}
        {logs.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => { const fd = new FormData(); void actions.clear(fd).then(() => router.refresh()); }}>
            Clear log
          </Button>
        )}
      </div>

      {incoming && (
        <div className="nv-card" style={{ marginBottom: "var(--nv-space-4)", textAlign: "center", padding: "20px 16px", borderColor: "var(--nv-color-primary)", animation: "nv-pulse 1s infinite" }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>📞 Incoming call</div>
          <div style={{ fontSize: 13, color: "var(--nv-color-text-faint)", marginTop: 2 }}>+1 555 010 0199</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 14 }}>
            <Button variant="danger" size="sm" onClick={decline}>Decline</Button>
            <Button size="sm" onClick={answer}>Answer</Button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: "var(--nv-space-4)", alignItems: "start" }}>
        {/* Dialer */}
        <div className="nv-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <input
            className="nv-input"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="Enter number"
            style={{ fontSize: 22, letterSpacing: 2, textAlign: "center", fontWeight: 700 }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {KEYPAD.map((k) => (
              <button
                key={k}
                onClick={() => setNumber((n) => n + k)}
                style={{
                  padding: "12px 0",
                  borderRadius: 10,
                  border: "1px solid var(--nv-color-border)",
                  background: "var(--nv-color-surface)",
                  cursor: "pointer",
                  fontSize: 16,
                  fontWeight: 600,
                  transition: "background 0.15s",
                }}
                onMouseDown={(e) => { e.currentTarget.style.background = "var(--nv-color-primary-alpha)"; }}
                onMouseUp={(e) => { e.currentTarget.style.background = "var(--nv-color-surface)"; }}
              >
                {k}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => setNumber((n) => n.slice(0, -1))}>⌫</Button>
            <Button
              size="sm"
              style={{ flex: 1 }}
              disabled={!number || ringing}
              onClick={startOutgoing}
            >
              {ringing ? "Ringing…" : "Call"}
            </Button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {contacts.slice(0, 6).map((c) => (
              <button
                key={c.id}
                className="nv-badge"
                style={{ cursor: "pointer", background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)" }}
                onClick={() => setNumber(c.phone ?? "")}
              >
                {c.firstName} {c.lastName}
              </button>
            ))}
          </div>
        </div>

        {/* Log */}
        <div className="nv-card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "var(--nv-color-text-faint)" }}>Call log</div>
            <div style={{ flex: 1 }} />
            <button className={filter === "all" ? "nv-badge nv-badge-primary" : "nv-badge nv-badge-neutral"} style={{ cursor: "pointer", border: "none" }} onClick={() => setFilter("all")}>
              All
            </button>
            <button className={filter === "favorites" ? "nv-badge nv-badge-primary" : "nv-badge nv-badge-neutral"} style={{ cursor: "pointer", border: "none" }} onClick={() => setFilter("favorites")}>
              Favorites
            </button>
          </div>
          {visibleLogs.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--nv-color-text-faint)" }}>
              {filter === "favorites" ? "No favorites yet — tap the star on a call." : "No calls yet — make a call with the keypad."}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {visibleLogs.map((l) => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--nv-color-border)" }}>
                <span style={{ width: 28, fontSize: 15 }}>{l.direction === "OUT" ? "↗" : "↙"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {l.contactName || l.number}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>
                    {l.startedAt.toLocaleString()} · {l.status}
                  </div>
                  {editingNoteId === l.id ? (
                    <div style={{ marginTop: 6 }}>
                      <textarea
                        className="nv-input"
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        rows={3}
                        style={{ width: "100%", fontSize: 12, resize: "vertical" }}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                        <Button size="sm" onClick={() => {
                          const fd = new FormData();
                          fd.set("id", l.id);
                          fd.set("note", noteDraft);
                          void actions.setNote(fd).then(() => {
                            setEditingNoteId(null);
                            router.refresh();
                          });
                        }}>
                          Save
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingNoteId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : l.note ? (
                    <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      📝 {l.note}
                    </div>
                  ) : null}
                </div>
                <span style={{ fontSize: 12, color: l.durationSec > 0 ? "var(--nv-color-success)" : "var(--nv-color-text-faint)", fontWeight: 600 }}>
                  {l.durationSec > 0 ? formatDuration(l.durationSec) : "—"}
                </span>
                <button
                  onClick={() => { setEditingNoteId(l.id); setNoteDraft(l.note); }}
                  style={{ fontSize: 11, color: "var(--nv-color-primary)", background: "none", border: "none", cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}
                >
                  Note
                </button>
                <button
                  aria-label={l.favorite ? "Unfavorite" : "Favorite"}
                  onClick={() => { const fd = new FormData(); fd.set("id", l.id); void actions.toggleFavorite(fd).then(() => router.refresh()); }}
                  style={{ fontSize: 16, color: l.favorite ? "var(--nv-color-warning)" : "var(--nv-color-text-faint)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  {l.favorite ? "★" : "☆"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
