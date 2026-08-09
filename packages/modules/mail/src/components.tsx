"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Dialog, cn } from "@n0va/ui";
import type { MailLabel, MailLabelMap, MailMessage } from "@n0va/db";
import type { MailUnreadCounts } from "./server";

export interface MailActions {
  send: (formData: FormData) => Promise<void>;
  reply: (formData: FormData) => Promise<void>;
  replyAll: (formData: FormData) => Promise<void>;
  forward: (formData: FormData) => Promise<void>;
  markRead: (formData: FormData) => Promise<void>;
  toggleStar: (formData: FormData) => Promise<void>;
  archive: (formData: FormData) => Promise<void>;
  trash: (formData: FormData) => Promise<void>;
  restore: (formData: FormData) => Promise<void>;
  createLabel: (formData: FormData) => Promise<void>;
  assignLabel: (formData: FormData) => Promise<void>;
  unassignLabel: (formData: FormData) => Promise<void>;
  summarizeThread: (formData: FormData) => Promise<{ content: string }>;
  suggestReply: (formData: FormData) => Promise<{ content: string }>;
  extractActionItems: (formData: FormData) => Promise<{ items: string[] }>;
  adjustTone: (formData: FormData) => Promise<{ content: string }>;
  saveDraft: (formData: FormData) => Promise<void>;
  createRule: (formData: FormData) => Promise<void>;
  toggleRule: (formData: FormData) => Promise<void>;
  deleteRule: (formData: FormData) => Promise<void>;
  snoozeThread: (formData: FormData) => Promise<void>;
  unsnoozeThread: (formData: FormData) => Promise<void>;
  createSignature: (formData: FormData) => Promise<void>;
  deleteSignature: (formData: FormData) => Promise<void>;
  setAutoResponder: (formData: FormData) => Promise<void>;
  createContact: (formData: FormData) => Promise<void>;
  deleteContact: (formData: FormData) => Promise<void>;
  searchContacts: (formData: FormData) => Promise<Array<{ id: string; email: string; firstName: string; lastName: string }>>;
}

type MessageWithLabels = MailMessage & { labels: Array<MailLabelMap & { label: MailLabel }> };
export interface MailThread {
  threadId: string;
  messages: MessageWithLabels[];
  unread: number;
  starred: boolean;
  latestSentAt: Date;
  snoozeUntil?: Date | null;
}

const FOLDERS = [
  { key: "INBOX", label: "Inbox", glyph: "▣" },
  { key: "SENT", label: "Sent", glyph: "➤" },
  { key: "ARCHIVE", label: "Archive", glyph: "▤" },
  { key: "TRASH", label: "Trash", glyph: "✕" },
] as const;

const AI_TONES = [
  { key: "formal", label: "Formal" },
  { key: "concise", label: "Concise" },
  { key: "friendly", label: "Friendly" },
  { key: "persuasive", label: "Persuasive" },
] as const;

interface RuleItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  runCount: number;
}

interface ContactItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
}

interface SignatureItem {
  id: string;
  name: string;
  content: string;
  isDefault: boolean;
}

interface FolderItem {
  id: string;
  name: string;
  color: string;
  parentFolderId: string | null;
  childFolders?: FolderItem[];
}

export function MailApp({
  folder,
  threads,
  labels,
  unreadCounts,
  actions,
  rules: initialRules,
  signatures: initialSignatures,
  folders: initialFolders,
  autoResponder,
}: {
  folder: string;
  threads: MailThread[];
  labels: Array<MailLabel & { _count: { messages: number } }>;
  unreadCounts: MailUnreadCounts;
  actions: MailActions;
  rules?: RuleItem[];
  signatures?: SignatureItem[];
  folders?: FolderItem[];
  autoResponder?: { enabled: boolean; subject: string; body: string } | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeThreadId = searchParams.get("t");
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyAllOpen, setReplyAllOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [newLabelOpen, setNewLabelOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [newRuleOpen, setNewRuleOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [signaturesOpen, setSignaturesOpen] = useState(false);
  const [newSignatureOpen, setNewSignatureOpen] = useState(false);
  const [autoResponderOpen, setAutoResponderOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [showScheduled, setShowScheduled] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState<ContactItem[]>([]);
  const [selectedSigId, setSelectedSigId] = useState<string>("");

  // Rich text editor state
  const editorRef = useRef<HTMLDivElement>(null);
  const [richTextEnabled, setRichTextEnabled] = useState(false);

  // AI state
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [aiActionItems, setAiActionItems] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  const activeThread = threads.find((t) => t.threadId === activeThreadId) ?? null;

  useEffect(() => {
    if (activeThread && activeThread.unread > 0) {
      const fd = new FormData();
      fd.set("threadId", activeThread.threadId);
      void actions.markRead(fd).then(() => setTimeout(() => router.refresh(), 50));
    }
  }, [activeThreadId]);

  useEffect(() => {
    setAiSummary(null);
    setAiReply(null);
    setAiActionItems([]);
  }, [activeThreadId]);

  const toggleLabel = (messageId: string, labelId: string, isAssigned: boolean) => {
    const fd = new FormData();
    fd.set("messageId", messageId);
    fd.set("labelId", labelId);
    void (isAssigned ? actions.unassignLabel(fd) : actions.assignLabel(fd)).then(() => setTimeout(() => router.refresh(), 50));
  };

  const activeLabelIds = new Set(
    activeThread ? activeThread.messages[activeThread.messages.length - 1]!.labels.map((lm) => lm.labelId) : [],
  );

  const runAi = useCallback(
    async (kind: "summarize" | "reply" | "actions") => {
      if (!activeThreadId) return;
      setAiLoading(kind);
      try {
        const fd = new FormData();
        fd.set("threadId", activeThreadId);
        if (kind === "summarize") {
          const result = await actions.summarizeThread(fd);
          setAiSummary(result.content);
        } else if (kind === "reply") {
          const result = await actions.suggestReply(fd);
          setAiReply(result.content);
        } else if (kind === "actions") {
          const result = await actions.extractActionItems(fd);
          setAiActionItems(result.items);
        }
      } catch (err) {
        console.error("AI action failed:", err);
      } finally {
        setAiLoading(null);
      }
    },
    [activeThreadId, actions],
  );

  const handleAdjustTone = useCallback(
    async (tone: string) => {
      if (!activeThreadId || !aiReply) return;
      setAiLoading("tone");
      try {
        const fd = new FormData();
        fd.set("threadId", activeThreadId);
        fd.set("content", aiReply);
        fd.set("tone", tone);
        const result = await actions.adjustTone(fd);
        setAiReply(result.content);
      } catch (err) {
        console.error("Tone adjustment failed:", err);
      } finally {
        setAiLoading(null);
      }
    },
    [activeThreadId, aiReply, actions],
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (searchQuery.trim()) {
      params.set("q", searchQuery.trim());
    } else {
      params.delete("q");
    }
    router.push(`/m/mail?${params.toString()}`);
  };

  const handleContactSearch = useCallback(async (query: string) => {
    setContactSearch(query);
    if (query.length < 2) { setContactResults([]); return; }
    try {
      const fd = new FormData();
      fd.set("query", query);
      const results = await actions.searchContacts(fd);
      setContactResults(results);
    } catch { setContactResults([]); }
  }, [actions]);

  const applyRichText = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  };

  return (
    <div style={{ display: "flex", gap: "var(--nv-space-4)", height: "calc(100dvh - 150px)", minHeight: 440 }}>
      {/* Rail */}
      <div style={{ width: 220, flexShrink: 0, background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-lg)", padding: "var(--nv-space-3)", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        <Button size="md" style={{ marginBottom: 10 }} onClick={() => setComposeOpen(true)}>+ Compose</Button>
        <Button variant="ghost" size="sm" onClick={() => setSearchOpen(o => !o)} style={{ marginBottom: 4 }}>{searchOpen ? "✕ Close" : "🔍 Search"}</Button>
        {searchOpen && (
          <form onSubmit={handleSearch} style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            <input className="nv-input" type="text" placeholder="Search mail…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ flex: 1, fontSize: 12, padding: "4px 8px" }} />
            <Button type="submit" size="sm" variant="secondary">Go</Button>
          </form>
        )}
        {FOLDERS.map((f) => (
          <a key={f.key} href={`/m/mail?folder=${f.key}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: "var(--nv-radius-md)", textDecoration: "none", color: "var(--nv-color-text)", fontSize: "var(--nv-font-sm)", fontWeight: folder === f.key ? 700 : 500, background: folder === f.key ? "var(--nv-color-primary-alpha)" : "transparent" }}>
            <span>{f.glyph}</span>
            <span style={{ flex: 1 }}>{f.label}</span>
            {unreadCounts[f.key] > 0 && <span className="nv-badge nv-badge-primary">{unreadCounts[f.key]}</span>}
          </a>
        ))}
        <div style={{ marginTop: 14, fontWeight: 700, fontSize: 12, color: "var(--nv-color-text-faint)", padding: "0 10px 6px" }}>LABELS</div>
        {labels.map((l) => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", fontSize: "var(--nv-font-sm)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: l.color, display: "inline-block" }} />
            <span style={{ flex: 1 }}>{l.name}</span>
            <span style={{ color: "var(--nv-color-text-faint)", fontSize: 12 }}>{l._count.messages}</span>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setNewLabelOpen(true)} style={{ alignSelf: "flex-start", marginTop: 4 }}>+ New label</Button>
        <div style={{ marginTop: 14, fontWeight: 700, fontSize: 12, color: "var(--nv-color-text-faint)", padding: "0 10px 6px" }}>TOOLS</div>
        <Button variant="ghost" size="sm" onClick={() => setContactsOpen(true)} style={{ alignSelf: "flex-start" }}>👤 Contacts</Button>
        <Button variant="ghost" size="sm" onClick={() => setSignaturesOpen(true)} style={{ alignSelf: "flex-start" }}>✍ Signatures</Button>
        <Button variant="ghost" size="sm" onClick={() => setAutoResponderOpen(true)} style={{ alignSelf: "flex-start" }}>🔄 Auto-Reply</Button>
        <Button variant="ghost" size="sm" onClick={() => setRulesOpen(true)} style={{ alignSelf: "flex-start" }}>⚙ Rules ({initialRules?.length ?? 0})</Button>
        <Button variant="ghost" size="sm" onClick={() => setFoldersOpen(true)} style={{ alignSelf: "flex-start" }}>📁 Folders</Button>
      </div>

      {/* Thread list */}
      <div style={{ width: 340, flexShrink: 0, background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-lg)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
        {threads.length === 0 && <div className="nv-empty">Nothing here</div>}
        {threads.map((t) => {
          const latest = t.messages[t.messages.length - 1]!;
          return (
            <a key={t.threadId} href={`/m/mail?folder=${folder}&t=${t.threadId}`} style={{ padding: "var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", textDecoration: "none", color: "var(--nv-color-text)", background: activeThreadId === t.threadId ? "var(--nv-color-primary-alpha)" : "transparent", display: "block" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>{t.starred ? "★" : "☆"}</span>
                <span style={{ fontWeight: t.unread > 0 ? 700 : 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{latest.subject || "(no subject)"}</span>
                <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{t.latestSentAt.toLocaleDateString()}</span>
              </div>
              <div style={{ fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                {latest.fromName ? `${latest.fromName} — ` : ""}{latest.body.slice(0, 90)}
              </div>
              {t.snoozeUntil && <div style={{ fontSize: 11, color: "var(--nv-color-accent)", marginTop: 4 }}>⏰ Snoozed until {new Date(t.snoozeUntil).toLocaleString()}</div>}
              {t.messages[0]!.labels.length > 0 && (
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  {t.messages[0]!.labels.map((lm) => (
                    <button key={lm.labelId} type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleLabel(t.messages[0]!.id, lm.labelId, true); }} style={{ fontSize: 11, padding: "1px 8px", borderRadius: 999, color: lm.label.color, background: "transparent", border: `1px solid ${lm.label.color}`, cursor: "pointer", fontFamily: "inherit" }}>{lm.label.name}</button>
                  ))}
                </div>
              )}
            </a>
          );
        })}
      </div>

      {/* Reading pane */}
      <div style={{ flex: 1, background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-lg)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!activeThread ? (
          <div className="nv-empty" style={{ flex: 1 }}><div>Select a conversation</div></div>
        ) : (
          <>
            <div style={{ padding: "var(--nv-space-4)", borderBottom: "1px solid var(--nv-color-border)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 800, fontSize: "var(--nv-font-lg)" }}>{activeThread.messages[activeThread.messages.length - 1]!.subject || "(no subject)"}</div>
              <LabelPicker key={activeThreadId} labels={labels} assigned={activeLabelIds} onToggle={(labelId, isAssigned) => toggleLabel(activeThread.messages[activeThread.messages.length - 1]!.id, labelId, isAssigned)} />
              <div style={{ flex: 1 }} />
              <form action={actions.toggleStar} onSubmit={() => setTimeout(() => router.refresh(), 50)}>
                <input type="hidden" name="messageId" value={activeThread.messages[activeThread.messages.length - 1]!.id} />
                <Button variant="ghost" size="sm">{activeThread.starred ? "★ Starred" : "☆ Star"}</Button>
              </form>
              {folder === "INBOX" && <form action={actions.archive} onSubmit={() => setTimeout(() => router.push("/m/mail?folder=INBOX"), 50)}><input type="hidden" name="threadId" value={activeThread.threadId} /><Button variant="ghost" size="sm">Archive</Button></form>}
              {folder === "TRASH" ? (
                <form action={actions.restore} onSubmit={() => setTimeout(() => router.refresh(), 50)}><input type="hidden" name="threadId" value={activeThread.threadId} /><Button variant="ghost" size="sm">Restore</Button></form>
              ) : (
                <form action={actions.trash} onSubmit={() => setTimeout(() => router.refresh(), 50)}><input type="hidden" name="threadId" value={activeThread.threadId} /><Button variant="danger" size="sm">Trash</Button></form>
              )}
            </div>

            {/* Action toolbar */}
            <div style={{ padding: "var(--nv-space-2) var(--nv-space-4)", borderBottom: "1px solid var(--nv-color-border)", display: "flex", gap: 4, flexWrap: "wrap", background: "var(--nv-color-surface-alt)" }}>
              <Button variant="secondary" size="sm" onClick={() => setReplyOpen(true)}>↩ Reply</Button>
              <Button variant="ghost" size="sm" onClick={() => setReplyAllOpen(true)}>↩ Reply All</Button>
              <Button variant="ghost" size="sm" onClick={() => setForwardOpen(true)}>➚ Forward</Button>
              <Button variant="ghost" size="sm" onClick={() => setSnoozeOpen(true)}>⏰ Snooze</Button>
              <span style={{ width: 1, background: "var(--nv-color-border)", margin: "4px 4px" }} />
              <Button variant="ghost" size="sm" disabled={aiLoading === "summarize"} onClick={() => runAi("summarize")}>{aiLoading === "summarize" ? "…" : "📋 Summarize"}</Button>
              <Button variant="ghost" size="sm" disabled={aiLoading === "reply"} onClick={() => runAi("reply")}>{aiLoading === "reply" ? "…" : "💡 Smart Reply"}</Button>
              <Button variant="ghost" size="sm" disabled={aiLoading === "actions"} onClick={() => runAi("actions")}>{aiLoading === "actions" ? "…" : "✅ Actions"}</Button>
              {aiReply && <Button variant="ghost" size="sm" onClick={() => { setReplyOpen(true); setAiReply(null); }}>↪ Use</Button>}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "var(--nv-space-4)", display: "flex", flexDirection: "column", gap: "var(--nv-space-4)" }}>
              {aiSummary && (
                <div className="nv-card" style={{ padding: "var(--nv-space-4)", borderLeft: "3px solid var(--nv-color-primary)" }}>
                  <div style={{ fontWeight: 700, fontSize: "var(--nv-font-sm)", color: "var(--nv-color-primary)", marginBottom: 6 }}>📋 Thread Summary</div>
                  <div style={{ fontSize: "var(--nv-font-md)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{aiSummary}</div>
                </div>
              )}
              {aiActionItems.length > 0 && (
                <div className="nv-card" style={{ padding: "var(--nv-space-4)", borderLeft: "3px solid var(--nv-color-success)" }}>
                  <div style={{ fontWeight: 700, fontSize: "var(--nv-font-sm)", color: "var(--nv-color-success)", marginBottom: 6 }}>✅ Action Items</div>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: "var(--nv-font-md)", lineHeight: 1.8 }}>{aiActionItems.map((item, i) => <li key={i}>{item}</li>)}</ul>
                </div>
              )}
              {aiReply && (
                <div className="nv-card" style={{ padding: "var(--nv-space-4)", borderLeft: "3px solid var(--nv-color-accent)" }}>
                  <div style={{ fontWeight: 700, fontSize: "var(--nv-font-sm)", color: "var(--nv-color-accent)", marginBottom: 6 }}>💡 Suggested Reply</div>
                  <div style={{ fontSize: "var(--nv-font-md)", whiteSpace: "pre-wrap", lineHeight: 1.6, marginBottom: 8 }}>{aiReply}</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)", alignSelf: "center" }}>Tone:</span>
                    {AI_TONES.map((t) => <Button key={t.key} variant="ghost" size="sm" disabled={aiLoading === "tone"} onClick={() => handleAdjustTone(t.key)}>{t.label}</Button>)}
                  </div>
                </div>
              )}
              {activeThread.messages.map((m) => (
                <div key={m.id} className="nv-card" style={{ padding: "var(--nv-space-4)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--nv-color-primary-alpha)", color: "var(--nv-color-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 }}>{(m.fromName || m.fromEmail)[0]?.toUpperCase() ?? "?"}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "var(--nv-font-sm)" }}>
                        {m.fromName || m.fromEmail}{m.direction === "OUT" && <span style={{ color: "var(--nv-color-text-faint)", fontWeight: 500 }}> (you)</span>}
                        {m.isForwarded && <span style={{ fontSize: 11, color: "var(--nv-color-accent)", marginLeft: 6 }}>Forwarded</span>}
                        {m.autoRespond && <span style={{ fontSize: 11, color: "var(--nv-color-success)", marginLeft: 6 }}>Auto-Reply</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
                        to: {Array.isArray(m.toEmails) ? String((m.toEmails as string[]).join(", ")) : String(m.toEmails)}
                        {Array.isArray(m.ccEmails) && (m.ccEmails as string[]).length > 0 && <span> · cc: {(m.ccEmails as string[]).join(", ")}</span>}
                        {Array.isArray(m.bccEmails) && (m.bccEmails as string[]).length > 0 && <span> · bcc: hidden</span>}
                        · {m.sentAt.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: "var(--nv-font-md)", lineHeight: 1.6, whiteSpace: "pre-wrap" }} dangerouslySetInnerHTML={m.bodyHtml ? { __html: m.bodyHtml } : undefined}>{m.bodyHtml ? undefined : m.body}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Compose Dialog */}
      <Dialog open={composeOpen} onClose={() => setComposeOpen(false)} title="New message" actions={<>
        <Button variant="ghost" onClick={() => setShowSchedulePicker(!showSchedulePicker)}>🕐 {showScheduled ? "Scheduled" : "Schedule"}</Button>
        <Button variant="secondary" onClick={() => setComposeOpen(false)}>Cancel</Button>
        <Button type="submit" form="compose-form">Send</Button>
      </>}>
        <form id="compose-form" action={(fd) => { void actions.send(fd).then(() => { setComposeOpen(false); router.refresh(); }); }} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 520 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input className="nv-input" name="to" type="text" placeholder="To (comma-separated)" required autoFocus style={{ flex: 1 }} onBlur={(e) => handleContactSearch(e.target.value)} />
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowCc(!showCc)}>Cc</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowBcc(!showBcc)}>Bcc</Button>
          </div>
          {showCc && <input className="nv-input" name="cc" type="text" placeholder="Cc (comma-separated)" />}
          {showBcc && <input className="nv-input" name="bcc" type="text" placeholder="Bcc (comma-separated)" />}
          <input className="nv-input" name="subject" placeholder="Subject" />
          <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
            <Button type="button" size="sm" variant={richTextEnabled ? "secondary" : "ghost"} onClick={() => setRichTextEnabled(!richTextEnabled)}>Rich</Button>
            {richTextEnabled && <>
              <Button type="button" size="sm" variant="ghost" onClick={() => applyRichText("bold")}><b>B</b></Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => applyRichText("italic")}><i>I</i></Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => applyRichText("underline")}><u>U</u></Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => applyRichText("insertUnorderedList")}>• List</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => applyRichText("createLink", prompt("Link URL") || undefined)}>🔗 Link</Button>
            </>}
            {selectedSigId && <input type="hidden" name="signatureId" value={selectedSigId} />}
            <select className="nv-input" style={{ width: "auto", fontSize: 12 }} value={selectedSigId} onChange={(e) => setSelectedSigId(e.target.value)}><option value="">No signature</option>{initialSignatures?.map(s => <option key={s.id} value={s.id}>{s.name}{s.isDefault ? " (default)" : ""}</option>)}</select>
          </div>
          {richTextEnabled ? (
            <div ref={editorRef} contentEditable style={{ minHeight: 180, border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, fontSize: "var(--nv-font-md)", outline: "none" }} onInput={(e) => { const el = e.currentTarget; const html = el.innerHTML; const hidden = document.getElementById("compose-body-html") as HTMLInputElement | null; if (hidden) hidden.value = html; }} />
          ) : (
            <textarea className="nv-input" name="body" placeholder="Write your message…" rows={8} style={{ resize: "vertical" }} />
          )}
          <input type="hidden" id="compose-body-html" name="bodyHtml" value="" />
          {showSchedulePicker && (
            <div style={{ display: "flex", gap: 6, padding: "var(--nv-space-2)", background: "var(--nv-color-surface-alt)", borderRadius: "var(--nv-radius-md)" }}>
              <input className="nv-input" type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} style={{ flex: 1 }} />
              <input className="nv-input" type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} style={{ flex: 1 }} />
              <Button size="sm" variant="secondary" type="button" onClick={() => {
                if (scheduleDate && scheduleTime) {
                  const dt = new Date(`${scheduleDate}T${scheduleTime}`);
                  const schedInput = document.getElementById("compose-scheduled-at") as HTMLInputElement | null;
                  if (schedInput) schedInput.value = dt.toISOString();
                  setShowScheduled(true);
                }
              }}>Set</Button>
              {showScheduled && <span style={{ fontSize: 12, alignSelf: "center", color: "var(--nv-color-success)" }}>✓ Scheduled</span>}
            </div>
          )}
          <input type="hidden" id="compose-scheduled-at" name="scheduledAt" value="" />
        </form>
      </Dialog>

      {/* Reply Dialog */}
      <Dialog open={replyOpen} onClose={() => setReplyOpen(false)} title="Reply" actions={<>
        <Button variant="secondary" onClick={() => setReplyOpen(false)}>Cancel</Button>
        <Button type="submit" form="reply-form">Send</Button>
      </>}>
        <form id="reply-form" action={(fd) => { fd.set("threadId", activeThread?.threadId ?? ""); void actions.reply(fd).then(() => { setReplyOpen(false); router.refresh(); }); }} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 480 }}>
          {aiReply && <div style={{ padding: "var(--nv-space-2)", background: "var(--nv-color-primary-alpha)", borderRadius: "var(--nv-radius-sm)", fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-muted)" }}><span style={{ fontWeight: 600 }}>AI: </span>{aiReply.slice(0, 120)}{aiReply.length > 120 ? "…" : ""}</div>}
          <textarea className="nv-input" name="body" placeholder="Write your reply…" rows={6} required autoFocus style={{ resize: "vertical" }} defaultValue={aiReply ?? ""} />
        </form>
      </Dialog>

      {/* Reply All Dialog */}
      <Dialog open={replyAllOpen} onClose={() => setReplyAllOpen(false)} title="Reply All" actions={<>
        <Button variant="secondary" onClick={() => setReplyAllOpen(false)}>Cancel</Button>
        <Button type="submit" form="reply-all-form">Send</Button>
      </>}>
        <form id="reply-all-form" action={(fd) => { fd.set("threadId", activeThread?.threadId ?? ""); void actions.replyAll(fd).then(() => { setReplyAllOpen(false); router.refresh(); }); }} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 480 }}>
          <textarea className="nv-input" name="body" placeholder="Write your reply…" rows={6} required autoFocus style={{ resize: "vertical" }} />
        </form>
      </Dialog>

      {/* Forward Dialog */}
      <Dialog open={forwardOpen} onClose={() => setForwardOpen(false)} title="Forward" actions={<>
        <Button variant="secondary" onClick={() => setForwardOpen(false)}>Cancel</Button>
        <Button type="submit" form="forward-form">Forward</Button>
      </>}>
        <form id="forward-form" action={(fd) => { fd.set("threadId", activeThread?.threadId ?? ""); void actions.forward(fd).then(() => { setForwardOpen(false); router.refresh(); }); }} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 480 }}>
          <input className="nv-input" name="to" type="text" placeholder="To (comma-separated)" required autoFocus />
          <textarea className="nv-input" name="body" placeholder="Add a message (optional)…" rows={4} style={{ resize: "vertical" }} />
        </form>
      </Dialog>

      {/* Snooze Dialog */}
      <Dialog open={snoozeOpen} onClose={() => setSnoozeOpen(false)} title="Snooze Thread" actions={<>
        <Button variant="secondary" onClick={() => setSnoozeOpen(false)}>Cancel</Button>
        <Button type="submit" form="snooze-form">Snooze</Button>
      </>}>
        <form id="snooze-form" action={(fd) => { fd.set("threadId", activeThread?.threadId ?? ""); void actions.snoozeThread(fd).then(() => { setSnoozeOpen(false); router.refresh(); }); }} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 360 }}>
          <p style={{ fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-muted)" }}>The thread will be hidden until the chosen time.</p>
          <input className="nv-input" name="until" type="datetime-local" required />
          <div style={{ display: "flex", gap: 4 }}>
            <Button type="button" size="sm" variant="ghost" onClick={() => { const el = document.querySelector('#snooze-form input[name="until"]') as HTMLInputElement | null; if (el) { const d = new Date(); d.setHours(d.getHours() + 1); el.value = d.toISOString().slice(0, 16); } }}>1 hour</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { const el = document.querySelector('#snooze-form input[name="until"]') as HTMLInputElement | null; if (el) { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0); el.value = d.toISOString().slice(0, 16); } }}>Tomorrow 9am</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { const el = document.querySelector('#snooze-form input[name="until"]') as HTMLInputElement | null; if (el) { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0); el.value = d.toISOString().slice(0, 16); } }}>Next week</Button>
          </div>
        </form>
      </Dialog>

      {/* Signatures Dialog */}
      <Dialog open={signaturesOpen} onClose={() => setSignaturesOpen(false)} title="Signatures" actions={<>
        <Button variant="ghost" onClick={() => setNewSignatureOpen(true)}>+ New</Button>
        <Button variant="secondary" onClick={() => setSignaturesOpen(false)}>Close</Button>
      </>}>
        <div style={{ minWidth: 440, maxHeight: 360, overflowY: "auto" }}>
          {(initialSignatures ?? []).length === 0 && <div style={{ padding: "var(--nv-space-4)", textAlign: "center", color: "var(--nv-color-text-faint)", fontSize: "var(--nv-font-sm)" }}>No signatures yet.</div>}
          {(initialSignatures ?? []).map((sig) => (
            <div key={sig.id} style={{ padding: "var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "var(--nv-font-sm)" }}>{sig.name} {sig.isDefault && <span style={{ fontSize: 11, color: "var(--nv-color-primary)" }}>DEFAULT</span>}</div>
                <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sig.content.slice(0, 80)}</div>
              </div>
              <form action={(fd) => { fd.set("signatureId", sig.id); void actions.deleteSignature(fd).then(() => router.refresh()); }}><Button variant="danger" size="sm" type="submit">✕</Button></form>
            </div>
          ))}
        </div>
      </Dialog>

      {/* New Signature Dialog */}
      <Dialog open={newSignatureOpen} onClose={() => setNewSignatureOpen(false)} title="New Signature" actions={<>
        <Button variant="secondary" onClick={() => setNewSignatureOpen(false)}>Cancel</Button>
        <Button type="submit" form="sig-form-create">Create</Button>
      </>}>
        <form id="sig-form-create" action={(fd) => { void actions.createSignature(fd).then(() => { setNewSignatureOpen(false); router.refresh(); }); }} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 420 }}>
          <input className="nv-input" name="name" placeholder="Signature name (e.g. Work)" required />
          <textarea className="nv-input" name="content" placeholder="Signature content…" rows={4} required style={{ resize: "vertical" }} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--nv-font-sm)" }}><input type="checkbox" name="isDefault" value="true" /> Set as default</label>
        </form>
      </Dialog>

      {/* Auto-Responder Dialog */}
      <Dialog open={autoResponderOpen} onClose={() => setAutoResponderOpen(false)} title="Auto-Responder / Out of Office" actions={<>
        <Button variant="secondary" onClick={() => setAutoResponderOpen(false)}>Cancel</Button>
        <Button type="submit" form="ar-form">Save</Button>
      </>}>
        <form id="ar-form" action={(fd) => { void actions.setAutoResponder(fd).then(() => { setAutoResponderOpen(false); router.refresh(); }); }} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 420 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--nv-font-sm)" }}><input type="checkbox" name="enabled" value="true" defaultChecked={autoResponder?.enabled} /> Enable auto-responder</label>
          <input className="nv-input" name="subject" placeholder="Subject" defaultValue={autoResponder?.subject ?? "Out of Office"} />
          <textarea className="nv-input" name="body" placeholder="Auto-reply message…" rows={4} defaultValue={autoResponder?.body ?? "I am currently out of office."} style={{ resize: "vertical" }} />
          <div style={{ display: "flex", gap: 6 }}>
            <input className="nv-input" name="startTime" type="datetime-local" placeholder="Start (optional)" style={{ flex: 1 }} />
            <input className="nv-input" name="endTime" type="datetime-local" placeholder="End (optional)" style={{ flex: 1 }} />
          </div>
        </form>
      </Dialog>

      {/* Contacts Dialog */}
      <Dialog open={contactsOpen} onClose={() => setContactsOpen(false)} title="Contacts" actions={<>
        <Button variant="ghost" onClick={() => setNewContactOpen(true)}>+ New Contact</Button>
        <Button variant="secondary" onClick={() => setContactsOpen(false)}>Close</Button>
      </>}>
        <div style={{ minWidth: 480, maxHeight: 400, overflowY: "auto" }}>
          <input className="nv-input" type="text" placeholder="Search contacts…" style={{ marginBottom: 10 }} onChange={(e) => handleContactSearch(e.target.value)} />
          {(contactResults.length > 0 || contactSearch.length >= 2) && (
            <div style={{ marginBottom: 10, padding: 4, background: "var(--nv-color-surface-alt)", borderRadius: "var(--nv-radius-md)" }}>
              {contactResults.map((c) => (
                <div key={c.id} style={{ padding: "4px 8px", fontSize: "var(--nv-font-sm)" }}>
                  {c.firstName} {c.lastName} &lt;{c.email}&gt;{c.company ? ` (${c.company})` : ""}
                </div>
              ))}
              {contactResults.length === 0 && <div style={{ padding: "4px 8px", fontSize: 12, color: "var(--nv-color-text-faint)" }}>No matches</div>}
            </div>
          )}
          <div style={{ fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-faint)", padding: "var(--nv-space-2)" }}>Type to search contacts. New contacts are added from the compose form.</div>
        </div>
      </Dialog>

      {/* New Contact Dialog */}
      <Dialog open={newContactOpen} onClose={() => setNewContactOpen(false)} title="New Contact" actions={<>
        <Button variant="secondary" onClick={() => setNewContactOpen(false)}>Cancel</Button>
        <Button type="submit" form="contact-form-create">Create</Button>
      </>}>
        <form id="contact-form-create" action={(fd) => { void actions.createContact(fd).then(() => { setNewContactOpen(false); router.refresh(); }); }} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 400 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <input className="nv-input" name="firstName" placeholder="First name" style={{ flex: 1 }} />
            <input className="nv-input" name="lastName" placeholder="Last name" style={{ flex: 1 }} />
          </div>
          <input className="nv-input" name="email" type="email" placeholder="Email" required />
          <input className="nv-input" name="phone" placeholder="Phone" />
          <input className="nv-input" name="company" placeholder="Company" />
          <input className="nv-input" name="jobTitle" placeholder="Job title" />
          <textarea className="nv-input" name="notes" placeholder="Notes…" rows={2} style={{ resize: "vertical" }} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--nv-font-sm)" }}><input type="checkbox" name="isFavorite" value="true" /> Favorite</label>
        </form>
      </Dialog>

      {/* Rules Dialog */}
      <Dialog open={rulesOpen} onClose={() => setRulesOpen(false)} title="Automation Rules" actions={<>
        <Button variant="ghost" onClick={() => setNewRuleOpen(true)}>+ New Rule</Button>
        <Button variant="secondary" onClick={() => setRulesOpen(false)}>Close</Button>
      </>}>
        <div style={{ minWidth: 480, maxHeight: 400, overflowY: "auto" }}>
          {(initialRules ?? []).length === 0 && <div style={{ padding: "var(--nv-space-4)", textAlign: "center", color: "var(--nv-color-text-faint)", fontSize: "var(--nv-font-sm)" }}>No rules yet.</div>}
          {(initialRules ?? []).map((rule) => (
            <div key={rule.id} style={{ padding: "var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "var(--nv-font-sm)" }}>{rule.name}</div>
                <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{rule.description || "No description"} · Priority {rule.priority} · Triggered {rule.runCount}×</div>
              </div>
              <form action={(fd) => { fd.set("ruleId", rule.id); void actions.toggleRule(fd).then(() => router.refresh()); }}>
                <Button variant={rule.enabled ? "secondary" : "ghost"} size="sm" type="submit">{rule.enabled ? "ON" : "OFF"}</Button>
              </form>
              <form action={(fd) => { fd.set("ruleId", rule.id); void actions.deleteRule(fd).then(() => router.refresh()); }}>
                <Button variant="danger" size="sm" type="submit">✕</Button>
              </form>
            </div>
          ))}
        </div>
      </Dialog>

      {/* New Rule Dialog */}
      <Dialog open={newRuleOpen} onClose={() => setNewRuleOpen(false)} title="Create Rule" actions={<>
        <Button variant="secondary" onClick={() => setNewRuleOpen(false)}>Cancel</Button>
        <Button type="submit" form="rule-form-create">Create</Button>
      </>}>
        <form id="rule-form-create" action={(fd) => { void actions.createRule(fd).then(() => { setNewRuleOpen(false); setRulesOpen(true); router.refresh(); }); }} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 420 }}>
          <input className="nv-input" name="name" placeholder="Rule name" required autoFocus />
          <input className="nv-input" name="description" placeholder="Description (optional)" />
          <input className="nv-input" name="priority" type="number" defaultValue={100} placeholder="Priority" />
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Conditions (JSON):</div>
          <textarea className="nv-input" name="conditions" placeholder='{"operator":"AND","conditions":[{"field":"subject","operator":"contains","value":"newsletter"}]}' rows={3} style={{ resize: "vertical", fontFamily: "monospace", fontSize: 12 }} />
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Actions (JSON array):</div>
          <textarea className="nv-input" name="actions" placeholder='[{"type":"moveToFolder","folder":"ARCHIVE"},{"type":"markRead"}]' rows={3} style={{ resize: "vertical", fontFamily: "monospace", fontSize: 12 }} />
        </form>
      </Dialog>
    </div>
  );
}

function LabelPicker({ labels, assigned, onToggle }: {
  labels: Array<MailLabel & { _count: { messages: number } }>;
  assigned: Set<string>;
  onToggle: (labelId: string, isAssigned: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <Button variant="ghost" size="sm" onClick={() => setOpen(o => !o)}>+ label</Button>
      {open && (
        <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, zIndex: 20, minWidth: 180, padding: 4, background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", boxShadow: "var(--nv-shadow-lg)" }}>
          {labels.map((l) => {
            const isA = assigned.has(l.id);
            return (
              <button key={l.id} type="button" className={cn("nv-palette-item", isA && "nv-palette-item-active")} onClick={() => { onToggle(l.id, isA); setOpen(false); }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: l.color, display: "inline-block" }} />
                <span className="nv-palette-item-name">{l.name}</span>
                {isA && <span>✓</span>}
              </button>
            );
          })}
          {labels.length === 0 && <div style={{ padding: "8px 12px", fontSize: "var(--nv-font-xs)", color: "var(--nv-color-text-faint)" }}>No labels yet</div>}
        </div>
      )}
    </div>
  );
}
