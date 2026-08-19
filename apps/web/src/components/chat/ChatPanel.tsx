"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Dropdown, MenuItem, cn } from "@n0va/ui";
import type { ChatChannel, ChatMessage, WorkspaceMember } from "@n0va/db";
import type { WorkspaceModeValue, ModeSource } from "@n0va/modules-chat";
import { useChatSocket } from "@/hooks/useChatSocket";
import { ThreadPanel } from "./ThreadPanel";
import { NotificationPanel } from "./NotificationPanel";
import { AdaptiveModeBar } from "./AdaptiveModeBar";
import { AISlashCommandMenu, NATIVE_COMMANDS, AI_COMMANDS } from "./AISlashCommandMenu";
import "./chat-adaptive.css";
import { GovernancePanel } from "./GovernancePanel";
import { HypercontextPanel } from "./HypercontextPanel";
import type { GovernanceInput, HyperInput, ApprovalInput, DeliveryInput } from "@/app/(app)/m/chat/actions";
import { ApprovalCard, type ApprovalView } from "@n0va/modules-approvals/components";

export interface ChatActions {
  createChannel: (formData: FormData) => Promise<void>;
  createDm: (formData: FormData) => Promise<string>;
  send: (formData: FormData) => Promise<void>;
  edit: (formData: FormData) => Promise<void>;
  delete: (formData: FormData) => Promise<void>;
  reply: (formData: FormData) => Promise<void>;
  rename: (formData: FormData) => Promise<void>;
  deleteChannel: (formData: FormData) => Promise<void>;
  addMember: (formData: FormData) => Promise<void>;
  removeMember: (formData: FormData) => Promise<void>;
  react: (formData: FormData) => Promise<void>;
  pin: (formData: FormData) => Promise<void>;
  unpin: (formData: FormData) => Promise<void>;
  markRead: (formData: FormData) => Promise<void>;
  search: (formData: FormData) => Promise<{ messages: ChatMessage[] }>;
  toggleBookmark: (formData: FormData) => Promise<{ bookmarked: boolean }>;
  saveSearch: (formData: FormData) => Promise<unknown>;
  deleteSavedSearch: (formData: FormData) => Promise<void>;
  setPresence: (formData: FormData) => Promise<void>;
  governance: (input: GovernanceInput) => Promise<unknown>;
  hyper: (input: HyperInput) => Promise<unknown>;
  approval: (input: ApprovalInput) => Promise<unknown>;
  delivery: (input: DeliveryInput) => Promise<unknown>;
  slash: (input: { command: string; args?: string; channelId?: string }) => Promise<unknown>;
  createFromTemplate: (formData: FormData) => Promise<void>;
  inviteGuest: (input: { guestEmail: string; guestName: string; accessTier?: "VIEWER" | "CONTRIBUTOR" | "PARTNER" | "VENDOR" | "TEMPORARY"; roomScope?: string[] }) => Promise<unknown>;
  huddle: (input: { op: "start" | "get" | "leave" | "end"; channelId: string; title?: string }) => Promise<unknown>;
  reminders: (input: { op: "create" | "list" | "cancel" | "fire"; text?: string; remindAt?: string; channelId?: string; reminderId?: string; status?: "PENDING" | "FIRED" | "CANCELLED" }) => Promise<unknown>;
  threadSummary: (input: { threadId: string }) => Promise<unknown>;
  threadDecision: (input: { threadId: string; decisionText: string; sourceMessageId?: string }) => Promise<unknown>;
  threadPin: (input: { threadId: string; pinType: "ROOM" | "PERSONAL" | "PRIORITY"; reason?: string }) => Promise<unknown>;
  threadExport: (input: { threadId: string; format: "MARKDOWN" | "PDF" | "DOCX" | "JSON"; exportMode: "FULL" | "BRANCH" | "RANGE" | "SUMMARY_ONLY" | "SUMMARY_TRANSCRIPT" }) => Promise<unknown>;
  threadActionItems: (input: { threadId: string }) => Promise<unknown>;
  messageEdits: (input: { messageId: string }) => Promise<Array<{ id: string; body: string; editedAt: string }>>;
  digest: (input: { roomId?: string }) => Promise<unknown>;
}

export interface DeliveryView {
  id: string;
  state: string;
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
  deliveredCount: number;
  targetCount: number;
  deliveredAt: string | null;
  correlationId: string;
}

const DELIVERY_STATE_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: "pending", color: "var(--nv-color-text-faint)" },
  SENDING: { label: "sending", color: "var(--nv-color-warning)" },
  QUEUED: { label: "queued", color: "var(--nv-color-warning)" },
  DELAYED: { label: "delayed", color: "var(--nv-color-warning)" },
  RETRIED: { label: "retried", color: "var(--nv-color-warning)" },
  PARTIALLY_DELIVERED: { label: "partial", color: "var(--nv-color-warning)" },
  FAILED: { label: "failed", color: "var(--nv-color-danger)" },
  CONFIRMED: { label: "delivered", color: "var(--nv-color-success)" },
  CANCELLED: { label: "cancelled", color: "var(--nv-color-text-faint)" },
};

const TTL_OPTIONS = [
  { label: "Off", seconds: 0 },
  { label: "5m", seconds: 300 },
  { label: "1h", seconds: 3600 },
  { label: "24h", seconds: 86400 },
] as const;

interface MessageReaction {
  emoji: string;
  userId: string;
  authorName: string;
}

interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  thumbnailKey?: string | null;
}

type ChannelWithMeta = ChatChannel & {
  members: { userId: string; role: string }[];
  _count: { messages: number };
};
type MemberWithUser = WorkspaceMember & {
  user: { id: string; name: string | null; email: string; image: string | null };
};

function reactionGroups(
  m: ChatMessage,
  userId: string,
): Record<string, { count: number; mine: boolean; users: string[] }> {
  const groups: Record<string, { count: number; mine: boolean; users: string[] }> = {};
  const reactions = Array.isArray(m.reactions)
    ? (m.reactions as unknown as MessageReaction[])
    : [];
  for (const r of reactions) {
    const g = groups[r.emoji] ?? { count: 0, mine: false, users: [] };
    g.count += 1;
    g.users.push(r.authorName);
    if (r.userId === userId) g.mine = true;
    groups[r.emoji] = g;
  }
  return groups;
}

function formatTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday " + date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function isSameMinute(a: Date | string, b: Date | string): boolean {
  const da = typeof a === "string" ? new Date(a) : a;
  const db = typeof b === "string" ? new Date(b) : b;
  return da.getTime() - db.getTime() < 60000;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function renderBody(m: ChatMessage, members?: Array<{ user: { id: string; name: string | null; email: string } }>) {
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const highlightHtml = (html: string): string => {
    if (!members || members.length === 0) return html;
    let out = html;
    for (const raw of members) {
      const n = (raw.user.name ?? "").trim();
      const e = (raw.user.email ?? "").trim();
      const re = new RegExp(`@${esc(n || e)}`, "gi");
      out = out.replace(re, (mm) => `<span style="color:var(--nv-color-primary);font-weight:600">${mm}</span>`);
    }
    return out;
  };
  if (m.bodyHtml) {
    return <div className="nv-message-body" dangerouslySetInnerHTML={{ __html: highlightHtml(m.bodyHtml) }} />;
  }
  if (!members || members.length === 0) {
    return <div className="nv-message-body">{m.body}</div>;
  }
  const names = members.map((x) => (x.user.name ?? "").toLowerCase()).filter(Boolean);
  const emails = members.map((x) => (x.user.email ?? "").toLowerCase()).filter(Boolean);
  const parts = m.body.split(/(@[\w.'\-]+(?:\s+[\w.'\-]+)?)/g);
  return (
    <div className="nv-message-body">
      {parts.map((p, i) => {
        if (p.startsWith("@")) {
          const t = p.slice(1).toLowerCase().trim();
          const known = names.includes(t) || emails.includes(t) || (t.length >= 3 && (names.some((n) => n.startsWith(t)) || emails.some((e) => e.startsWith(t))));
          if (known) return <span key={i} style={{ color: "var(--nv-color-primary)", fontWeight: 600 }}>{p}</span>;
        }
        return <span key={i}>{p}</span>;
      })}
    </div>
  );
}

interface PollData {
  id: string;
  question: string;
  status: "OPEN" | "CLOSED";
  expiresAt: string | null;
  closedAt: string | null;
  options: Array<{ text: string; count: number; pct: number }>;
  totalVotes: number;
  myVote: number | null;
}

function PollCard({ messageId }: { messageId: string }) {
  const [poll, setPoll] = useState<PollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/poll?messageId=${encodeURIComponent(messageId)}`);
      const data = await res.json();
      setPoll(data.poll);
    } catch {
      setPoll(null);
    } finally {
      setLoading(false);
    }
  }, [messageId]);

  useEffect(() => { void load(); }, [load]);

  const act = async (op: "vote" | "resolve", optionIndex?: number) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, pollId: poll?.id, optionIndex }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setPoll(data.poll);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Loading poll…</div>;
  if (!poll) return null;
  const open = poll.status === "OPEN" && (!poll.expiresAt || new Date(poll.expiresAt).getTime() > Date.now());
  return (
    <div style={{ marginTop: 8, border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, maxWidth: 420, background: "var(--nv-color-surface)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>📊 {poll.question}</span>
        <span style={{ fontSize: 10, color: open ? "var(--nv-color-success)" : "var(--nv-color-text-faint)", border: `1px solid ${open ? "var(--nv-color-success)" : "var(--nv-color-border)"}`, borderRadius: 999, padding: "0 6px" }}>
          {open ? "open" : "closed"} · {poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"}
        </span>
        {poll.expiresAt && open && <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>⏳ {new Date(poll.expiresAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {poll.options.map((o, i) => {
          const mine = poll.myVote === i;
          return (
            <button
              key={i}
              disabled={!open || busy}
              onClick={() => void act("vote", i)}
              style={{ position: "relative", textAlign: "left", padding: "6px 8px", borderRadius: "var(--nv-radius-sm)", border: mine ? "1px solid var(--nv-color-primary)" : "1px solid var(--nv-color-border)", background: mine ? "var(--nv-color-primary-alpha)" : "transparent", cursor: open ? "pointer" : "default", overflow: "hidden", fontSize: 12 }}
              title={open ? `Vote: ${o.text}` : undefined}
            >
              <div style={{ position: "absolute", inset: 0, width: `${o.pct}%`, background: "var(--nv-color-primary-alpha)", opacity: 0.5 }} />
              <span style={{ position: "relative" }}>{mine ? "✓ " : ""}{o.text} · {o.count} ({o.pct}%)</span>
            </button>
          );
        })}
      </div>
      {open && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <button onClick={() => void act("resolve")} disabled={busy} style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-sm)", padding: "2px 8px", fontSize: 11, cursor: "pointer", color: "var(--nv-color-text)" }} title="Close poll (creator or admin)">Close</button>
          {error && <span style={{ fontSize: 11, color: "var(--nv-color-danger)" }}>{error}</span>}
        </div>
      )}
    </div>
  );
}

function renderAttachments(m: ChatMessage) {
  const attachments = (m as any).attachments as Array<{ id: string; filename: string; mimeType: string; url?: string }> | undefined;
  if (!attachments || attachments.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
      {attachments.map((a) => (
        <a key={a.id} href={a.url ?? `/api/chat/attachments/${a.id}/download`} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: "var(--nv-radius-md)", fontSize: 11, background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", textDecoration: "none", color: "var(--nv-color-text)" }}>
          {a.mimeType?.startsWith("image/") ? "🖼️" : "📎"} {a.filename}
        </a>
      ))}
    </div>
  );
}

export function ChatPanel({
  workspaceId,
  userId,
  channels,
  members,
  activeChannelId,
  initialMessages,
  unread,
  reactionEmojis,
  actions,
  token,
  initialPresence = {},
  approvalPendingCounts = {},
  channelApprovals = [],
  deliveryMap = {},
}: {
  workspaceId: string;
  userId: string;
  channels: ChannelWithMeta[];
  members: MemberWithUser[];
  activeChannelId: string | null;
  initialMessages: ChatMessage[];
  unread: Record<string, number>;
  reactionEmojis: string[];
  actions: ChatActions;
  token: string;
  initialPresence?: Record<string, string>;
  approvalPendingCounts?: Record<string, number>;
  channelApprovals?: ApprovalView[];
  deliveryMap?: Record<string, DeliveryView>;
}) {
  const router = useRouter();
  const approvalsByMessage = useMemo(() => {
    const map: Record<string, ApprovalView> = {};
    for (const a of channelApprovals) if (a.sourceMessageId) map[a.sourceMessageId] = a;
    return map;
  }, [channelApprovals]);
  const approvalActions: {
    decide: (id: string, d: "APPROVED" | "REJECTED", note?: string) => Promise<unknown>;
    cancel: (id: string) => Promise<unknown>;
    forceSync: (id: string) => Promise<unknown>;
    refresh: () => void;
  } = {
    decide: (id, d, note) => actions.approval({ op: "decide", approvalId: id, decision: d, note }),
    cancel: (id) => actions.approval({ op: "cancel", approvalId: id }),
    forceSync: (id) => actions.approval({ op: "forceSync", approvalId: id }),
    refresh: () => router.refresh(),
  };
  const retryDelivery = (deliveryId: string) => {
    void actions.delivery({ op: "retryDelivery", deliveryId }).then(() => router.refresh()).catch(() => {});
  };
  const cancelDelivery = (deliveryId: string) => {
    void actions.delivery({ op: "cancelDelivery", deliveryId }).then(() => router.refresh()).catch(() => {});
  };
  const deliveryBadge = (m: ChatMessage) => {
    const d = deliveryMap[m.id];
    if (!d) return null;
    const meta = DELIVERY_STATE_META[d.state] ?? { label: d.state.toLowerCase(), color: "var(--nv-color-text-faint)" };
    return (
      <span
        title={d.lastError ?? `correlation ${d.correlationId}`}
        style={{
          color: meta.color, fontSize: 10, border: `1px solid ${meta.color}`, borderRadius: 999,
          padding: "0 6px", cursor: "default",
        }}
      >
        {meta.label}
        {d.state === "FAILED" && (
          <>
            {" "}
            <button
              onClick={(e) => { e.stopPropagation(); retryDelivery(d.id); }}
              title="Retry delivery"
              style={{ border: "none", background: "none", color: "inherit", cursor: "pointer", fontSize: 10, padding: 0 }}
            >
              ↻
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); cancelDelivery(d.id); }}
              title="Cancel delivery"
              style={{ border: "none", background: "none", color: "inherit", cursor: "pointer", fontSize: 10, padding: 0 }}
            >
              ✕
            </button>
          </>
        )}
      </span>
    );
  };
  type LiveMsg = ChatMessage & { attachments?: Array<{ id: string; filename: string; mimeType: string; sizeBytes: number; storageKey: string; thumbnailKey?: string | null; }> };
  const [liveMessages, setLiveMessages] = useState<LiveMsg[]>([]);
  const [presence, setPresence] = useState<Record<string, string>>(initialPresence);
  const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({});
  const [connStatus, setConnStatus] = useState<string>("connecting");
  const [showNew, setShowNew] = useState(false);
  const [showDm, setShowDm] = useState(false);
  const [renaming, setRenaming] = useState<ChannelWithMeta | null>(null);
  const [confirming, setConfirming] = useState<ChannelWithMeta | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const [showPinned, setShowPinned] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAICommand, setShowAICommand] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);
  const [messageOverrides, setMessageOverrides] = useState<Record<string, ChatMessage>>({});
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [ttlIndex, setTtlIndex] = useState(0);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [bookmarks, setBookmarks] = useState<Array<{ id: string; message: ChatMessage & { channel?: { name: string; kind: string } } }>>([]);
  const [savedSearches, setSavedSearches] = useState<Array<{ id: string; name: string; query: string }>>([]);
  const [saveSearchName, setSaveSearchName] = useState("");
  const [presenceMenu, setPresenceMenu] = useState(false);
  const [showGovernance, setShowGovernance] = useState(false);
  const [hyperFor, setHyperFor] = useState<string | null>(null);
  const [complianceError, setComplianceError] = useState("");
  const [showGuest, setShowGuest] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);
  const [guestNotice, setGuestNotice] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [huddleLive, setHuddleLive] = useState<{ session: { id: string; title: string; mode: string; status: string; startedAt: string | null; channelId: string | null; createdById: string | null } | null; participants?: Array<{ user: { id: string; name: string | null; email: string } }> } | null>(null);
  const [huddleBusy, setHuddleBusy] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const [reminders, setReminders] = useState<Array<{ id: string; text: string; remindAt: string; status: string; channelId: string | null }>>([]);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [smartReplies, setSmartReplies] = useState<Array<{ id: string; intent: string; tone: string; body: string; rank: number; knowledgeBased: boolean; approvalRequired: boolean }>>([]);
  const [mode, setMode] = useState<WorkspaceModeValue>("COLLABORATION");
  const [modeSource, setModeSource] = useState<ModeSource>("default");
  const [modeFade, setModeFade] = useState(1);
  const [flowStart, setFlowStart] = useState<number | null>(null);
  const [flowElapsed, setFlowElapsed] = useState(0);
  const [highContrast, setHighContrast] = useState(false);
  const [editsFor, setEditsFor] = useState<ChatMessage | null>(null);
  const [editHistory, setEditHistory] = useState<Array<{ id: string; body: string; editedAt: string }>>([]);
  const [showDigest, setShowDigest] = useState(false);
  const [digestData, setDigestData] = useState<unknown>(null);
  const [digestBusy, setDigestBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { status: wsStatus, sendMessage, sendTyping } = useChatSocket<LiveMsg>({
    token,
    workspaceId,
    channelId: activeChannelId || "",
    onMessage: (msg) => {
      if ((msg as { type?: string }).type === "message.deleted") {
        const id = (msg as { message?: { id?: string } }).message?.id;
        if (id) {
          setLiveMessages((prev) => prev.filter((m) => m.id !== id));
          setDeletedIds((prev) => new Set(prev).add(id));
        }
        return;
      }
      if ((msg as { type?: string }).type === "message.updated") {
        const updated = (msg as { message?: ChatMessage }).message;
        if (updated) {
          setMessageOverrides((prev) => ({ ...prev, [updated.id]: updated }));
        }
        return;
      }
      setLiveMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
      );
    },
    onPresence: (uid, st) => {
      setPresence((prev) => ({ ...prev, [uid]: st }));
    },
    onTyping: (cid, uid) => {
      setTypingUsers((prev) => {
        const current = prev[cid] || [];
        if (!current.includes(uid)) {
          return { ...prev, [cid]: [...current, uid] };
        }
        return prev;
      });
      setTimeout(() => {
        setTypingUsers((prev) => {
          const current = prev[cid] || [];
          return { ...prev, [cid]: current.filter((u) => u !== uid) };
        });
      }, 3000);
    },
    onStatusChange: (s) => setConnStatus(s),
  });

  const messages = useMemo(() => {
    const byId = new Map<string, ChatMessage>();
    for (const m of liveMessages) byId.set(m.id, m);
    for (const m of initialMessages) byId.set(m.id, m);
    for (const m of Object.values(messageOverrides)) byId.set(m.id, m);
    return [...byId.values()]
      .filter((m) => !deletedIds.has(m.id) && !m.deletedAt && !m.parentId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [liveMessages, initialMessages, messageOverrides, deletedIds]);

  // Chat Nexus: smart replies for the latest message (spec §8.9)
  useEffect(() => {
    const topLevel = messages.filter((m) => !m.parentId);
    const last = topLevel[topLevel.length - 1];
    if (!last || !activeChannelId) { setSmartReplies([]); return; }
    let stale = false;
    void fetch(`/api/chat/suggestions?messageId=${last.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!stale) setSmartReplies(d?.suggestions ?? []); })
      .catch(() => { if (!stale) setSmartReplies([]); });
    return () => { stale = true; };
  }, [messages, activeChannelId]);

  const acceptSuggestion = (s: { id: string; body: string }) => {
    setInputValue(s.body);
    void fetch("/api/chat/suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "accept", id: s.id }) })
      .then(() => setSmartReplies((prev) => prev.filter((x) => x.id !== s.id)))
      .catch(() => {});
  };

  const dismissSuggestion = (id: string) => {
    void fetch("/api/chat/suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "dismiss", id }) })
      .then(() => setSmartReplies((prev) => prev.filter((x) => x.id !== id)))
      .catch(() => {});
  };

  // Chat Nexus: live huddle in the active channel (spec §8.6)
  const refreshHuddle = useCallback(async () => {
    if (!activeChannelId) { setHuddleLive(null); return; }
    try {
      const res = (await actions.huddle({ op: "get", channelId: activeChannelId })) as
        | { session: { id: string; title: string; mode: string; status: string; startedAt: string | null; channelId: string | null; createdById: string | null; participants?: Array<{ user: { id: string; name: string | null; email: string } }> } | null }
        | undefined;
      setHuddleLive(res?.session ? { session: res.session, participants: res.session.participants ?? [] } : null);
    } catch { /* silent */ }
  }, [activeChannelId, actions]);

  useEffect(() => {
    void refreshHuddle();
    const t = setInterval(() => void refreshHuddle(), 15000);
    return () => clearInterval(t);
  }, [refreshHuddle]);

  const startHuddle = async () => {
    if (!activeChannelId || huddleBusy) return;
    setHuddleBusy(true);
    try {
      await actions.huddle({ op: "start", channelId: activeChannelId, title: `Huddle: ${active ? channelLabel(active) : "channel"}` });
      await refreshHuddle();
    } catch { /* silent */ }
    finally { setHuddleBusy(false); }
  };

  const leaveHuddle = async () => {
    if (!activeChannelId || huddleBusy) return;
    setHuddleBusy(true);
    try {
      await actions.huddle({ op: "leave", channelId: activeChannelId });
      await refreshHuddle();
    } catch { /* silent */ }
    finally { setHuddleBusy(false); }
  };

  const endHuddle = async () => {
    if (!activeChannelId || huddleBusy) return;
    setHuddleBusy(true);
    try {
      await actions.huddle({ op: "end", channelId: activeChannelId });
      await refreshHuddle();
    } catch { /* silent */ }
    finally { setHuddleBusy(false); }
  };

  const openReminders = async () => {
    setShowReminders(true);
    setReminderBusy(true);
    try {
      const res = (await actions.reminders({ op: "fire" })) as { ok?: boolean; reminders?: Array<{ id: string; text: string; remindAt: string; status: string; channelId: string | null }> } | undefined;
      const list = (await actions.reminders({ op: "list" })) as { ok?: boolean; reminders?: Array<{ id: string; text: string; remindAt: string; status: string; channelId: string | null }> } | undefined;
      setReminders(list?.reminders ?? []);
      void res;
    } catch {
      setReminders([]);
    } finally {
      setReminderBusy(false);
    }
  };

  const cancelReminder = async (id: string) => {
    try {
      await actions.reminders({ op: "cancel", reminderId: id });
      setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, status: "CANCELLED" } : r)));
    } catch { /* silent */ }
  };

  useEffect(() => {
    void actions.reminders({ op: "fire" }).catch(() => {});
  }, [actions]);

  const submitGuest = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (guestBusy) return;
    const fd = new FormData(e.currentTarget);
    const guestEmail = String(fd.get("guestEmail") ?? "");
    const guestName = String(fd.get("guestName") ?? "");
    const accessTier = String(fd.get("accessTier") ?? "VIEWER") as "VIEWER" | "CONTRIBUTOR" | "PARTNER" | "VENDOR" | "TEMPORARY";
    if (!guestEmail.trim() || !guestName.trim()) return;
    setGuestBusy(true);
    setGuestNotice(null);
    void actions.inviteGuest({ guestEmail, guestName, accessTier, roomScope: activeChannelId ? [activeChannelId] : [] })
      .then(() => { setGuestNotice("Guest invited"); setShowGuest(false); })
      .catch((err) => setGuestNotice(err instanceof Error ? err.message : "Invite failed"))
      .finally(() => setGuestBusy(false));
  };

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length, activeChannelId]);

  useEffect(() => {
    if (activeChannelId) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 80);
      return () => window.clearTimeout(t);
    }
  }, [activeChannelId]);

  // Workspace-adaptive state (spec: adaptive workspace modes).
  const handleModeChange = useCallback((m: WorkspaceModeValue, src: ModeSource) => {
    setMode(m);
    setModeSource(src);
    setModeFade(0);
    requestAnimationFrame(() => setModeFade(1));
    if (m === "FLOW") setFlowStart(Date.now());
  }, []);

  useEffect(() => {
    let mounted = true;
    void fetch("/api/chat/adaptive/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!mounted || !d?.effective) return;
        setMode(d.effective.mode);
        setModeSource(d.effective.source);
        setModeFade(d.effective.fade ?? 1);
        if (d.effective.mode === "FLOW") setFlowStart(Date.now());
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Deep-work timer for Flow mode (session-scoped, resets on re-entry).
  useEffect(() => {
    if (mode !== "FLOW" || !flowStart) return;
    const t = setInterval(() => setFlowElapsed(Math.floor((Date.now() - flowStart) / 60000)), 1000 * 30);
    setFlowElapsed(0);
    return () => clearInterval(t);
  }, [mode, flowStart]);

  useEffect(() => {
    if (!activeChannelId) return;
    const fd = new FormData();
    fd.set("channelId", activeChannelId);
    void actions.markRead(fd).then(() => router.refresh());
  }, [activeChannelId]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = channels.find((c) => c.id === activeChannelId);

  const submitCreate = (fd: FormData) => {
    if (templateId) {
      const tf = new FormData();
      tf.set("templateId", templateId);
      tf.set("name", String(fd.get("name") ?? ""));
      void actions.createFromTemplate(tf).then(() => {
        setShowNew(false);
        setTemplateId("");
        router.refresh();
      });
      return;
    }
    void actions.createChannel(fd).then(() => {
      setShowNew(false);
      router.refresh();
    });
  };

  const submitDm = (fd: FormData) => {
    void actions.createDm(fd).then((id) => {
      setShowDm(false);
      router.push(`/m/chat?c=${id}`);
    });
  };

  const submitReact = (messageId: string, emoji: string) => {
    const fd = new FormData();
    fd.set("messageId", messageId);
    fd.set("emoji", emoji);
    void actions.react(fd).then(() => router.refresh());
  };

  const submitRename = (fd: FormData) => {
    void actions.rename(fd).then(() => {
      setRenaming(null);
      router.refresh();
    });
  };

  const submitEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing || !editValue.trim()) return;
    const fd = new FormData();
    fd.set("messageId", editing);
    fd.set("body", editValue.trim());
    void actions.edit(fd).then(() => {
      setEditing(null);
      setEditValue("");
      router.refresh();
    });
  };

  const submitDelete = (fd: FormData) => {
    const wasActive = confirming?.id === activeChannelId;
    void actions.deleteChannel(fd).then(() => {
      setConfirming(null);
      if (wasActive) {
        router.replace("/m/chat");
      } else {
        router.refresh();
      }
    });
  };

  const submitPin = (messageId: string) => {
    const fd = new FormData();
    fd.set("messageId", messageId);
    void actions.pin(fd).then(() => router.refresh());
  };

  const submitUnpin = (messageId: string) => {
    const fd = new FormData();
    fd.set("messageId", messageId);
    void actions.unpin(fd).then(() => router.refresh());
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !active) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/chat/attachments", { method: "POST", body: fd });
        if (!res.ok) continue;
        const a = await res.json();
        const sendFd = new FormData();
        sendFd.set("channelId", active.id);
        sendFd.set("body", `📎 ${a.filename}`);
        sendFd.set("attachments", JSON.stringify([{
          filename: a.filename,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          storageKey: a.storageKey,
          thumbnailKey: a.thumbnailKey ?? null,
          checksum: a.checksum ?? null,
        }]));
        await actions.send(sendFd);
      }
      router.refresh();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const fetchNotifCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?unread=true");
      if (res.ok) { const d = await res.json(); setNotifUnread(d.unreadCount ?? 0); }
    } catch { }
  }, []);

  useEffect(() => {
    fetchNotifCount();
    const interval = setInterval(fetchNotifCount, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifCount]);

  const fetchBookmarks = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/bookmarks");
      if (res.ok) setBookmarks((await res.json()).bookmarks ?? []);
    } catch { }
  }, []);

  const fetchSavedSearches = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/search/saved");
      if (res.ok) setSavedSearches((await res.json()).searches ?? []);
    } catch { }
  }, []);

  const toggleBookmark = (messageId: string) => {
    const fd = new FormData();
    fd.set("messageId", messageId);
    void actions.toggleBookmark(fd).then(() => fetchBookmarks());
  };

  const setMyPresence = (status: string) => {
    const fd = new FormData();
    fd.set("status", status);
    void actions.setPresence(fd).then(() => {
      setPresence((prev) => ({ ...prev, [userId]: status.toLowerCase() }));
      setPresenceMenu(false);
    });
  };

  const handleSend = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputValue.trim() || !active) return;
    setMentionOpen(false);

    const raw = inputValue.trim();
    const typedCmd = raw.split(/\s+/)[0]?.toLowerCase() ?? "";
    if (showAICommand && activeChannelId) {
      if (NATIVE_COMMANDS.some((c) => c.cmd === typedCmd)) {
        const args = raw.slice(typedCmd.length).trim();
        setShowAICommand(false);
        void actions.slash({ command: typedCmd, args, channelId: activeChannelId }).then(() => {
          setInputValue("");
          router.refresh();
        });
        return;
      }
      if (AI_COMMANDS.some((c) => c.cmd === typedCmd)) {
        setShowAICommand(false);
        setInputValue("");
        void fetch("/api/chat/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: typedCmd, channelId: activeChannelId }),
        })
          .then(async (r) => {
            if (!r.ok) throw new Error("Command failed");
            const data = await r.json();
            setInputValue(data.result ?? "");
          })
          .catch(() => {});
        return;
      }
    }

    const ttlSeconds = TTL_OPTIONS[ttlIndex]?.seconds ?? 0;

    const sendViaAction = () => {
      const fd = new FormData();
      fd.set("channelId", active.id);
      fd.set("body", inputValue.trim());
      if (replyingTo) fd.set("parentId", replyingTo.id);
      if (ttlSeconds > 0) fd.set("ttlSeconds", String(ttlSeconds));
      void actions.send(fd).then(() => {
        setInputValue("");
        setReplyingTo(null);
        setTtlIndex(0);
        router.refresh();
      });
    };

    // Ephemeral messages go through the server action (TTL is not wired to the WS gateway)
    if (ttlSeconds > 0) {
      sendViaAction();
      return;
    }

    if (wsStatus === "connected") {
      sendMessage(inputValue.trim());
      setInputValue("");
      const fd = new FormData();
      fd.set("channelId", active.id);
      fd.set("body", inputValue.trim());
      if (replyingTo) fd.set("parentId", replyingTo.id);
      void actions.send(fd);
      setReplyingTo(null);
    } else if (replyingTo) {
      const fd = new FormData();
      fd.set("channelId", active.id);
      fd.set("body", inputValue.trim());
      fd.set("parentId", replyingTo.id);
      void actions.reply(fd).then(() => {
        setInputValue("");
        setReplyingTo(null);
        router.refresh();
      });
    } else {
      sendViaAction();
    }
  };

  const handleTyping = () => {
    if (typingTimeout.current) return;
    typingTimeout.current = setTimeout(() => {
      typingTimeout.current = null;
    }, 2000);
    sendTyping();
  };

  const mentionCandidates = useMemo(() => {
    if (!mentionOpen) return [];
    const q = mentionQuery.toLowerCase();
    return members
      .filter((m) => (m.user.name ?? "").toLowerCase().includes(q) || (m.user.email ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [mentionOpen, mentionQuery, members]);

  const pickMention = (m: { user: { id: string; name: string | null; email: string } }) => {
    const name = m.user.name ?? m.user.email;
    setInputValue((prev) => prev.replace(/@[\w.'\-]*$/, `@${name} `));
    setMentionOpen(false);
    setMentionQuery("");
    inputRef.current?.focus();
  };

  const handleInputChange = (v: string) => {
    setInputValue(v);
    setShowAICommand(v.startsWith("/"));
    if (v.startsWith("/")) { setMentionOpen(false); return; }
    const m = v.match(/(?:^|\s)@([\w.'\-]*)$/);
    if (m) {
      setMentionQuery(m[1] ?? "");
      setMentionIndex(0);
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const handleComposerKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && mentionCandidates.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionCandidates.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); const target = mentionCandidates[mentionIndex] ?? mentionCandidates[0]; if (target) pickMention(target); return; }
      if (e.key === "Escape") { setMentionOpen(false); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
      return;
    }
    handleTyping();
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    runSearch(searchQuery);
  };

  const runSearch = (query: string) => {
    const fd = new FormData();
    fd.set("query", query);
    if (activeChannelId) fd.set("channelId", activeChannelId);
    void actions.search(fd).then((result) => {
      if (result) setSearchResults(result.messages);
    });
  };

  const startEdit = (m: ChatMessage) => {
    setEditing(m.id);
    setEditValue(m.body);
  };

  const openEdits = async (m: ChatMessage) => {
    setEditsFor(m);
    setEditHistory([]);
    try {
      const history = await actions.messageEdits({ messageId: m.id });
      setEditHistory(history);
    } catch {
      setEditHistory([]);
    }
  };

  const openDigest = async () => {
    setShowDigest(true);
    setDigestBusy(true);
    setDigestData(null);
    try {
      const data = await actions.digest({});
      setDigestData(data);
    } catch {
      setDigestData(null);
    } finally {
      setDigestBusy(false);
    }
  };

  const channelLabel = (c: ChannelWithMeta): string => {
    if (c.kind !== "DM") return `# ${c.name}`;
    const other = members.find(
      (m) => m.user.id !== userId && c.members.some((cm) => cm.userId === m.user.id),
    );
    return other ? (other.user.name ?? other.user.email) : "Direct message";
  };

  const getTypingText = (): string => {
    if (!activeChannelId) return "";
    const typing = typingUsers[activeChannelId];
    if (!typing || typing.length === 0) return "";
    const names = typing
      .filter((uid) => uid !== userId)
      .map((uid) => {
        const member = members.find((m) => m.user.id === uid);
        return member ? member.user.name ?? member.user.email : "Someone";
      })
      .filter(Boolean);
    if (names.length === 0) return "";
    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    return `${names.length} people are typing...`;
  };

  const statusIndicator = () => {
    switch (wsStatus) {
      case "connected":
        return { color: "var(--nv-color-success)", text: "● live" };
      case "fallback":
        return { color: "var(--nv-color-warning)", text: "● SSE" };
      case "connecting":
        return { color: "var(--nv-color-text-faint)", text: "○ connecting" };
      default:
        return { color: "var(--nv-color-danger)", text: "○ offline" };
    }
  };

  const status = statusIndicator();

  return (
    <div
      className={cn("nv-chat-layout", "nv-chat-adaptive", highContrast && mode === "PRESENTATION" && "nv-adaptive-high-contrast", highContrast && mode === "REVIEW" && "nv-adaptive-high-contrast")}
      data-workspace-mode={mode}
      data-mode-source={modeSource}
      data-adaptive-fade={modeFade < 1 ? "" : undefined}
      style={{ display: "flex", gap: "var(--nv-space-4)", height: "calc(100dvh - 150px)", minHeight: 440 }}
    >
      {/* Channels rail */}
      <div className="nv-chat-sidebar" style={{ width: 264, flexShrink: 0, background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-lg)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)" }}>
          <div style={{ fontWeight: 800, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>N0VA CHAT</span>
            <button onClick={() => setShowSearch(true)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--nv-color-text-faint)", fontSize: 16 }}>⌕</button>
          </div>
          <div className="nv-chrome-optional" style={{ display: "flex", gap: 6 }}>
            <Button size="sm" onClick={() => setShowNew(true)}>+ Channel</Button>
            <Button size="sm" variant="secondary" onClick={() => setShowDm(true)}>DM</Button>
          </div>
          <a
            className="nv-chrome-optional"
            href="/m/chat/start"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              marginTop: 6,
              padding: "6px 10px",
              borderRadius: "var(--nv-radius-md)",
              background: "var(--nv-color-primary-alpha)",
              color: "var(--nv-color-primary)",
              fontSize: "var(--nv-font-sm)",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            💬 Start Chat
          </a>
        </div>
        <div style={{ overflowY: "auto", padding: "var(--nv-space-2)", display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
          {channels.length === 0 && <div className="nv-empty">No channels yet</div>}
          {channels.map((c) => {
            const unreadCount = unread[c.id] ?? 0;
            return (
              <div
                key={c.id}
                style={{ display: "flex", alignItems: "center", gap: 2, padding: "4px 6px", borderRadius: "var(--nv-radius-md)", background: activeChannelId === c.id ? "var(--nv-color-primary-alpha)" : "transparent" }}
              >
                <a
                  href={`/m/chat?c=${c.id}`}
                  style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0, padding: "4px 4px", textDecoration: "none", color: "var(--nv-color-text)", fontSize: "var(--nv-font-sm)", fontWeight: activeChannelId === c.id ? 700 : 500 }}
                >
                  <span style={{ flexShrink: 0 }}>
                    {c.kind === "ANNOUNCEMENT" ? (
                      <span style={{ color: "var(--nv-color-warning)", fontSize: 10 }}>📢</span>
                    ) : c.createdById && presence[c.createdById] && c.kind === "DM" ? (
                      <span style={{ color: presenceColor(presence[c.createdById]), fontSize: 10 }}>●</span>
                    ) : (
                      <span style={{ color: "var(--nv-color-text-faint)", fontSize: 10 }}>#</span>
                    )}
                  </span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {channelLabel(c)}
                  </span>
                  {unreadCount > 0 && activeChannelId !== c.id ? (
                    <span className="nv-badge nv-badge-amber">{unreadCount}</span>
                  ) : null}
                  {(approvalPendingCounts[c.id] ?? 0) > 0 ? (
                    <span className="nv-badge" title="Pending approvals" style={{ background: "var(--nv-color-primary-alpha)", color: "var(--nv-color-primary)" }}>⏳ {approvalPendingCounts[c.id] ?? 0}</span>
                  ) : null}
                  <span className="nv-channel-count" style={{ color: "var(--nv-color-text-faint)", fontSize: 12 }}>{c._count.messages}</span>
                </a>
                {c.kind === "CHANNEL" && (c.createdById === userId) ? (
                  <Dropdown trigger={<Button variant="ghost" size="sm" style={{ minWidth: 0, padding: "2px 6px" }}>⋯</Button>}>
                    <MenuItem onSelect={() => setRenaming(c)}>Rename</MenuItem>
                    <MenuItem danger onSelect={() => setConfirming(c)}>Delete</MenuItem>
                  </Dropdown>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Messages pane */}
      <div className="nv-chat-main" style={{ flex: 1, background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-lg)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "var(--nv-space-3) var(--nv-space-4)", borderBottom: "1px solid var(--nv-color-border)", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 800 }}>{active ? channelLabel(active) : "Select a channel"}</span>
          {active?.topic && <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>| {active.topic}</span>}
          <span style={{ fontSize: 12, color: status.color }}>{status.text}</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
            <AdaptiveModeBar mode={mode} source={modeSource} onModeChange={handleModeChange} />
            {(mode === "PRESENTATION" || mode === "REVIEW") && (
              <button
                onClick={() => setHighContrast((h) => !h)}
                aria-pressed={highContrast}
                title="High contrast"
                style={{ border: highContrast ? "1px solid var(--nv-color-primary)" : "1px solid var(--nv-color-border)", background: highContrast ? "var(--nv-color-primary-alpha)" : "transparent", borderRadius: "var(--nv-radius-md)", padding: "4px 8px", fontSize: 12, cursor: "pointer", color: "var(--nv-color-text)" }}
              >
                {highContrast ? "◐" : "◑"}
              </button>
            )}
            <span className="nv-flow-timer" title="Deep-work timer (session-scoped)" style={{ display: "none", alignItems: "center", gap: 4, border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: "4px 8px", fontSize: 12, color: "var(--nv-color-text)" }}>🌊 {flowElapsed}m</span>
            <span className="nv-mode-dnd-chip" title="Meditation mode: do-not-disturb" style={{ display: "none", alignItems: "center", gap: 4, border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: "4px 8px", fontSize: 12, color: "var(--nv-color-text-muted)" }}>⛔ DND</span>
            <span className="nv-mode-facepile" style={{ display: "none", alignItems: "center", gap: 2, marginRight: 2 }} title="Who's active">
              {members
                .filter((m) => m.user.id !== userId && presence[m.user.id] === "online")
                .slice(0, 4)
                .map((m) => (
                  <span key={m.user.id} title={m.user.name ?? m.user.email} style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-success)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--nv-color-text)" }}>
                    {(m.user.name ?? m.user.email)[0]?.toUpperCase() ?? "?"}
                  </span>
                ))}
            </span>
            <div style={{ position: "relative" }}>
              <button onClick={() => setPresenceMenu(!presenceMenu)} style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-md)", padding: "4px 8px", fontSize: 12, cursor: "pointer", color: "var(--nv-color-text)" }} title="Set presence">
                {presence[userId] === "online" ? "🟢" : presence[userId] === "busy" ? "🔴" : presence[userId] === "dnd" ? "⛔" : presence[userId] === "away" ? "🌙" : "🟡"} {presence[userId] ?? "online"}
              </button>
              {presenceMenu && (
                <div style={{ position: "absolute", top: 28, right: 0, zIndex: 60, background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 4, minWidth: 120, boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
                  {([["ONLINE", "🟢 Online"], ["AWAY", "🌙 Away"], ["BUSY", "🔴 Busy"], ["DND", "⛔ Do not disturb"]] as [string, string][]).map(([value, label]) => (
                    <button key={value} onClick={() => setMyPresence(value)} style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "6px 8px", borderRadius: "var(--nv-radius-sm)", cursor: "pointer", fontSize: 12, color: "var(--nv-color-text)" }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="nv-chrome-optional" onClick={() => { setShowBookmarks(true); fetchBookmarks(); }} style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-md)", padding: "4px 8px", fontSize: 12, cursor: "pointer", color: "var(--nv-color-text)" }} title="Bookmarks">🔖</button>
            <button className="nv-chrome-optional" onClick={() => setShowGovernance(true)} style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-md)", padding: "4px 8px", fontSize: 12, cursor: "pointer", color: "var(--nv-color-text)" }} title="Compliance & governance">🛡️</button>
            <button className="nv-chrome-optional" onClick={() => void startHuddle()} disabled={!active || huddleBusy} style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-md)", padding: "4px 8px", fontSize: 12, cursor: "pointer", color: "var(--nv-color-text)" }} title="Start a channel huddle (spec §8.6)">🔊 {huddleBusy ? "..." : "Huddle"}</button>
            <button className="nv-chrome-optional" onClick={() => setShowGuest(true)} disabled={!active} style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-md)", padding: "4px 8px", fontSize: 12, cursor: "pointer", color: "var(--nv-color-text)" }} title="Invite an external guest (spec §8.8)">👤 Invite</button>
            <button onClick={() => setShowNotifications(!showNotifications)} style={{ position: "relative", border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-md)", padding: "4px 8px", fontSize: 12, cursor: "pointer", color: "var(--nv-color-text)" }}>
              🔔 {notifUnread > 0 && <span style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "var(--nv-color-danger)", color: "#fff", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>{notifUnread}</span>}
            </button>
            <button className="nv-chrome-optional" onClick={() => void openReminders()} style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-md)", padding: "4px 8px", fontSize: 12, cursor: "pointer", color: "var(--nv-color-text)" }} title="Reminders">⏰ Reminders</button>
            <button className="nv-chrome-optional" onClick={() => void openDigest()} title="Unread digest (spec §8.9)" style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-md)", padding: "4px 8px", fontSize: 12, cursor: "pointer", color: "var(--nv-color-text)" }}>📋 Digest</button>
            <button className="nv-chrome-optional" onClick={() => setShowPinned(true)} style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-md)", padding: "4px 8px", fontSize: 12, cursor: "pointer", color: "var(--nv-color-text)" }}>📌 Pins</button>
            <button className="nv-chrome-optional" onClick={() => setShowMembers(true)} style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-md)", padding: "4px 8px", fontSize: 12, cursor: "pointer", color: "var(--nv-color-text)" }}>👥 {active?.members.length ?? 0}</button>
          </div>
        </div>

        <div className="nv-crisis-banner" role="alert" style={{ display: "none", alignItems: "center", gap: 8, padding: "6px var(--nv-space-4)", background: "var(--nv-color-danger-alpha)", borderBottom: "1px solid var(--nv-color-danger)", color: "var(--nv-color-danger)", fontSize: 12, fontWeight: 700 }}>
          <span>🚨 Crisis mode — incident response. Priority traffic only; escalation exceptions always break through.</span>
        </div>

        {huddleLive?.session && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px var(--nv-space-4)", background: "var(--nv-color-primary-alpha)", borderBottom: "1px solid var(--nv-color-border)", fontSize: 12 }}>
            <span style={{ color: "var(--nv-color-danger)", fontWeight: 700 }}>🔴 Live huddle</span>
            <span style={{ fontWeight: 600 }}>{huddleLive.session.title}</span>
            <span style={{ color: "var(--nv-color-text-faint)" }}>
              {huddleLive.participants && huddleLive.participants.length > 0
                ? `${huddleLive.participants.length} in call: ${huddleLive.participants.map((p) => p.user.name ?? p.user.email).join(", ")}`
                : "no participants yet"}
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              <button onClick={() => void refreshHuddle()} style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-sm)", padding: "2px 8px", fontSize: 11, cursor: "pointer" }} title="Refresh">↻</button>
              <button onClick={() => void leaveHuddle()} disabled={huddleBusy} style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-sm)", padding: "2px 8px", fontSize: 11, cursor: "pointer", color: "var(--nv-color-warning)" }} title="Leave the huddle">🚪 Leave</button>
              {huddleLive.session.createdById === userId && (
                <button onClick={() => void endHuddle()} disabled={huddleBusy} style={{ border: "1px solid var(--nv-color-danger)", background: "var(--nv-color-danger-alpha)", borderRadius: "var(--nv-radius-sm)", padding: "2px 8px", fontSize: 11, cursor: "pointer", color: "var(--nv-color-danger)", fontWeight: 700 }} title="End the huddle for everyone">⏹ End</button>
              )}
            </div>
          </div>
        )}

        <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "var(--nv-space-4)", display: "flex", flexDirection: "column" }}>
          {!active && (
            <div className="nv-empty" style={{ flex: 1 }}>
              <div>Pick a channel or start a new conversation</div>
              <Button size="sm" onClick={() => setShowNew(true)}>Create channel</Button>
            </div>
          )}
          {active && messages.length === 0 && (
            <div className="nv-empty" style={{ flex: 1 }}>
              <div style={{ fontSize: "var(--nv-font-xl)", marginBottom: 8 }}>💬</div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Welcome to #{active.name}</div>
              <div style={{ fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-muted)" }}>{active.topic || "This is the beginning of the channel. Say hello!"}</div>
            </div>
          )}
          {messages.map((m, idx) => {
            const prev = idx > 0 ? messages[idx - 1] : null;
            const showHeader = !prev || prev.createdById !== m.createdById || !isSameMinute(prev.createdAt, m.createdAt);
            const isEditing = editing === m.id;
            const approval = approvalsByMessage[m.id];
            return (
              <div key={m.id}>
                {showHeader ? (
                  <div style={{ display: "flex", gap: 10, padding: "10px 8px 4px", marginTop: idx > 0 ? 8 : 0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--nv-color-primary-alpha)", color: "var(--nv-color-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                      {(m.authorName[0] ?? "?").toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontWeight: 700 }}>{m.authorName}</span>
                        <span style={{ color: "var(--nv-color-text-faint)", fontSize: 11 }}>{formatTime(m.createdAt)}</span>
                        {deliveryBadge(m)}
                        {m.editedAt && (
                          <button onClick={() => void openEdits(m)} title="View edit history" style={{ border: "none", background: "none", color: "var(--nv-color-text-faint)", fontSize: 10, cursor: "pointer", padding: 0, textDecoration: "underline dotted" }}>
                            (edited)
                          </button>
                        )}
                        {m.pinnedAt && <span style={{ color: "var(--nv-color-warning)", fontSize: 10 }}>📌</span>}
                        {(m as any).expiresAt && <span style={{ color: "var(--nv-color-warning)", fontSize: 10 }}>⏳</span>}
                        {((m as any).compliance?.[0]?.classification || (m as any).compliance?.[0]?.legalHold && <span style={{ color: "var(--nv-color-danger)", fontSize: 10 }}>⛔</span>)}
                        {(m as any).compliance?.[0]?.classification && <span style={{ color: "var(--nv-color-warning)", fontSize: 10, fontWeight: 700 }}>{(m as any).compliance[0].classification}</span>}
                        {((m as any).compliance?.[0]?.retentionMode === "COMPLIANCE" || (m as any).compliance?.[0]?.retentionMode === "BLOCKCHAIN") && <span style={{ color: "var(--nv-color-warning)", fontSize: 10 }}>{(m as any).compliance[0].retentionMode.toLowerCase()} lock</span>}
                        {(m as any).hyperContext?.linkCount > 0 && (
                          <button onClick={() => setHyperFor(m.id)} title="Hyper-context: linked objects & suggested actions" style={{ border: "1px solid var(--nv-color-primary-alpha)", background: "var(--nv-color-primary-alpha)", borderRadius: 999, padding: "1px 7px", fontSize: 10, color: "var(--nv-color-primary)", cursor: "pointer", fontWeight: 700 }}>
                            🔗 {(m as any).hyperContext.linkCount}
                          </button>
                        )}
                      </div>
                      <div style={{ marginTop: 2 }}>
                        {isEditing ? (
                          <form onSubmit={submitEdit} style={{ display: "flex", gap: 6, flexDirection: "column" }}>
                            <input className="nv-input" value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus style={{ fontSize: "var(--nv-font-md)" }} />
                            <div style={{ display: "flex", gap: 4, fontSize: 12 }}>
                              <Button type="submit" size="sm">Save</Button>
                              <Button type="button" size="sm" variant="secondary" onClick={() => { setEditing(null); setEditValue(""); }}>Cancel</Button>
                            </div>
                          </form>
                        ) : (
                          <div style={{ fontSize: "var(--nv-font-md)" }}>{renderBody(m, members)}</div>
                        )}
                        {renderAttachments(m)}
                        {(m as any).pollId && <PollCard messageId={m.id} />}
                        {approval && (
                          <ApprovalCard approval={approval} currentUserId={userId} onAction={approvalActions} />
                        )}
                      </div>
                      {renderReactions(m)}
                    </div>
                    <MessageMenu m={m} />
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 10, padding: "2px 8px" }}>
                    <div style={{ width: 36, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                      <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)", opacity: 0 }}>{new Date(m.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      {isEditing ? (
                        <form onSubmit={submitEdit} style={{ display: "flex", gap: 6, flexDirection: "column" }}>
                          <input className="nv-input" value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus style={{ fontSize: "var(--nv-font-md)" }} />
                          <div style={{ display: "flex", gap: 4, fontSize: 12 }}>
                            <Button type="submit" size="sm">Save</Button>
                            <Button type="button" size="sm" variant="secondary" onClick={() => { setEditing(null); setEditValue(""); }}>Cancel</Button>
                          </div>
                        </form>
                      ) : (
                        <div style={{ fontSize: "var(--nv-font-md)" }}>{renderBody(m, members)}</div>
                      )}
                      {renderAttachments(m)}
                      {(m as any).pollId && <PollCard messageId={m.id} />}
                      {renderReactions(m)}
                    </div>
                    <MessageMenu m={m} />
                  </div>
                )}
              </div>
            );
          })}

          {activeChannelId && getTypingText() && (
            <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", padding: "4px 8px", fontStyle: "italic" }}>
              {getTypingText()}
            </div>
          )}
        </div>

        {/* Reply indicator */}
        {replyingTo && (
          <div style={{ padding: "6px var(--nv-space-4)", borderTop: "1px solid var(--nv-color-border)", background: "var(--nv-color-primary-alpha)", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
            <span>Replying to <strong>{replyingTo.authorName}</strong>: {replyingTo.body.slice(0, 60)}{replyingTo.body.length > 60 ? "..." : ""}</span>
            <button onClick={() => setReplyingTo(null)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--nv-color-text)" }}>✕</button>
          </div>
        )}

        {/* Smart reply chips (spec §8.9) */}
        {smartReplies.length > 0 && (
          <div style={{ padding: "6px var(--nv-space-4)", borderTop: "1px solid var(--nv-color-border)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", background: "var(--nv-color-surface-2)" }}>
            <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>💡 Smart replies:</span>
            {smartReplies.map((s) => (
              <span
                key={s.id}
                onClick={() => acceptSuggestion(s)}
                title={`${s.intent} · ${s.tone}${s.knowledgeBased ? " · knowledge-based" : ""}${s.approvalRequired ? " · approval required" : ""}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 999, border: "1px solid var(--nv-color-primary)", background: "var(--nv-color-primary-alpha)", fontSize: 11, cursor: "pointer" }}
              >
                {s.body}
                <button
                  onClick={(e) => { e.stopPropagation(); dismissSuggestion(s.id); }}
                  style={{ border: "none", background: "none", cursor: "pointer", fontSize: 10, padding: 0, color: "var(--nv-color-text-faint)" }}
                  title="Dismiss"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Message input */}
        <form onSubmit={handleSend} style={{ padding: "var(--nv-space-3)", borderTop: "1px solid var(--nv-color-border)", display: "flex", gap: 8, alignItems: "flex-end" }}>
          <input type="hidden" name="channelId" value={activeChannelId ?? ""} />
          <div style={{ position: "relative", flex: 1 }}>
            <textarea
              ref={inputRef}
              className="nv-input"
              name="body"
              rows={1}
              placeholder={active ? `Message ${channelLabel(active)} (Enter to send · Shift+Enter for a new line)` : "Select a channel first"}
              disabled={!active}
              required
              autoComplete="off"
              value={inputValue}
              onChange={(e) => {
                handleInputChange(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={handleComposerKey}
              style={{ width: "100%", resize: "none", maxHeight: 160, overflowY: "auto", lineHeight: 1.45 }}
            />
            {mentionOpen && mentionCandidates.length > 0 && (
              <div style={{ position: "absolute", bottom: "100%", left: 0, right: 0, marginBottom: 4, background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", boxShadow: "var(--nv-shadow-md)", maxHeight: 220, overflowY: "auto", zIndex: 60, padding: 4 }}>
                {mentionCandidates.map((c, i) => (
                  <button
                    key={c.user.id}
                    type="button"
                    onClick={() => pickMention(c)}
                    onMouseEnter={() => setMentionIndex(i)}
                    style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: "var(--nv-radius-sm)", border: "none", background: i === mentionIndex ? "var(--nv-color-primary-alpha)" : "transparent", cursor: "pointer", textAlign: "left", fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text)" }}
                  >
                    <span>{presenceEmoji(presence[c.user.id])}</span>
                    <span style={{ fontWeight: 600 }}>{c.user.name ?? c.user.email}</span>
                    <span style={{ color: "var(--nv-color-text-faint)", fontSize: 11, marginLeft: "auto" }}>{c.user.email}</span>
                  </button>
                ))}
              </div>
            )}
            {showAICommand && activeChannelId && (
              <AISlashCommandMenu
                channelId={activeChannelId}
                typed={inputValue}
                onNative={async (command, args, channelId) => (await actions.slash({ command, args, channelId })) as { ok: boolean; message: string }}
                onResult={(text) => { setInputValue(text); }}
                onClose={() => setShowAICommand(false)}
              />
            )}
          </div>
          <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleFileUpload} />
          <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={!active || uploading} title={uploading ? "Uploading..." : "Attach file"}>{uploading ? "⏳" : "📎"}</Button>
          <Button type="button" variant="secondary" onClick={() => setShowAICommand(!showAICommand)} disabled={!active} title="AI commands">✨</Button>
          <Button type="button" variant={ttlIndex > 0 ? "primary" : "secondary"} onClick={() => setTtlIndex((ttlIndex + 1) % TTL_OPTIONS.length)} disabled={!active} title="Ephemeral message (self-destructs after TTL)" style={{ fontSize: 11 }}>⏳{TTL_OPTIONS[ttlIndex]?.label}</Button>
          <Button type="submit" disabled={!active || !inputValue.trim()}>Send</Button>
        </form>
      </div>

      {/* Thread panel */}
      {activeThread && activeChannelId && (
        <ThreadPanel
          parentId={activeThread}
          workspaceId={workspaceId}
          onClose={() => setActiveThread(null)}
          onSendReply={async (parentId, body) => {
            const fd = new FormData();
            fd.set("channelId", activeChannelId);
            fd.set("body", body);
            fd.set("parentId", parentId);
            await actions.send(fd);
            router.refresh();
          }}
          onSummary={(threadId) => actions.threadSummary({ threadId })}
          onDecision={(threadId, decisionText, sourceMessageId) => actions.threadDecision({ threadId, decisionText, sourceMessageId })}
          onPin={(threadId, pinType) => actions.threadPin({ threadId, pinType })}
          onExport={(threadId, format) => actions.threadExport({ threadId, format, exportMode: "FULL" })}
          onActionItems={(threadId) => actions.threadActionItems({ threadId })}
        />
      )}

      {/* Notification panel */}
      {showNotifications && (
        <>
          <div
            onClick={() => setShowNotifications(false)}
            style={{ position: "fixed", inset: 0, zIndex: 49 }}
          />
          <div style={{ position: "absolute", top: 40, right: 16, zIndex: 50 }}>
            <NotificationPanel mode={mode} onClose={() => setShowNotifications(false)} />
          </div>
        </>
      )}

      {/* Compliance error / explanation banner */}
      {complianceError && (
        <div style={{ position: "absolute", top: 44, left: "50%", transform: "translateX(-50%)", zIndex: 70, background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-warning)", borderRadius: "var(--nv-radius-md)", padding: "8px 12px", fontSize: 12, maxWidth: 480, boxShadow: "var(--nv-shadow-md)" }}>
          {complianceError}
          <button onClick={() => setComplianceError("")} style={{ marginLeft: 8, border: "none", background: "none", cursor: "pointer", color: "var(--nv-color-text-faint)" }}>✕</button>
        </div>
      )}

      {showGovernance && <GovernancePanel onClose={() => setShowGovernance(false)} governance={(input) => actions.governance(input)} />}
      {hyperFor && <HypercontextPanel messageId={hyperFor} hyper={(input) => actions.hyper(input)} onClose={() => setHyperFor(null)} />}

      {/* ── Dialogs ── */}

      <Dialog
        open={showNew}
        onClose={() => setShowNew(false)}
        title="Create channel"
        actions={<>
          <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
          <Button type="submit" form="create-channel-form">Create</Button>
        </>}
      >
        <form id="create-channel-form" action={submitCreate}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input className="nv-input" name="name" placeholder="e.g. design" autoFocus required />
            <input className="nv-input" name="topic" placeholder="Channel topic (optional)" />
            <textarea className="nv-input" name="description" placeholder="Description (optional)" rows={2} />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--nv-font-sm)" }}>
              <input type="checkbox" name="isPrivate" value="true" /> Private channel
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--nv-font-sm)" }}>
              <input type="checkbox" name="kind" value="ANNOUNCEMENT" /> Announcement (admins-only posting)
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--nv-font-sm)" }}>
              <span style={{ color: "var(--nv-color-text-faint)" }}>Space template (spec §8.1.2)</span>
              <select className="nv-input" name="templateId" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">None — blank channel</option>
                <option value="project-kickoff">🚀 Project Kickoff — public hub for goals, milestones, owners</option>
                <option value="incident-response">🚨 Incident Response — private war room</option>
                <option value="all-hands">📣 All-Hands — announcement channel (admins post)</option>
              </select>
            </label>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={showDm}
        onClose={() => setShowDm(false)}
        title="Start a direct message"
        actions={<>
          <Button variant="secondary" onClick={() => setShowDm(false)}>Cancel</Button>
          <Button type="submit" form="create-dm-form">Start</Button>
        </>}
      >
        <form id="create-dm-form" action={submitDm}>
          <select className="nv-input" name="targetUserId" defaultValue={members[0]?.user.id} required>
            {members.map((m) =>
              m.user.id === userId ? null : (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name ?? m.user.email}
                </option>
              ),
            )}
          </select>
        </form>
      </Dialog>

      <Dialog
        open={showGuest}
        onClose={() => { setShowGuest(false); setGuestNotice(null); }}
        title={`Invite guest${active ? ` to ${channelLabel(active)}` : ""}`}
        actions={<>
          <Button variant="secondary" onClick={() => setShowGuest(false)}>Cancel</Button>
          <Button type="submit" form="invite-guest-form" disabled={guestBusy}>Invite</Button>
        </>}
      >
        <form id="invite-guest-form" onSubmit={submitGuest} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input className="nv-input" name="guestEmail" type="email" placeholder="guest@partner.com" required autoFocus />
          <input className="nv-input" name="guestName" placeholder="Guest display name" required />
          <select className="nv-input" name="accessTier" defaultValue="VIEWER">
            <option value="VIEWER">VIEWER — read-only</option>
            <option value="CONTRIBUTOR">CONTRIBUTOR — can post</option>
            <option value="PARTNER">PARTNER — extended access</option>
            <option value="VENDOR">VENDOR — scoped vendor</option>
            <option value="TEMPORARY">TEMPORARY — time-boxed</option>
          </select>
          {guestNotice && <div style={{ fontSize: 11, color: "var(--nv-color-danger)" }}>{guestNotice}</div>}
        </form>
      </Dialog>

      <Dialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename channel"
        actions={<>
          <Button variant="secondary" onClick={() => setRenaming(null)}>Cancel</Button>
          <Button type="submit" form="rename-channel-form">Save</Button>
        </>}
      >
        <form id="rename-channel-form" action={submitRename}>
          <input type="hidden" name="channelId" value={renaming?.id ?? ""} />
          <input className="nv-input" name="name" defaultValue={renaming?.name ?? ""} autoFocus required />
        </form>
      </Dialog>

      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Delete channel"
        actions={<>
          <Button variant="secondary" onClick={() => setConfirming(null)}>Cancel</Button>
          <Button variant="danger" type="submit" form="delete-channel-form">Delete</Button>
        </>}
      >
        <form id="delete-channel-form" action={submitDelete}>
          <input type="hidden" name="channelId" value={confirming?.id ?? ""} />
          <div style={{ fontSize: "var(--nv-font-sm)" }}>
            Delete <strong>{confirming?.name}</strong>? All messages in this channel will be removed.
          </div>
        </form>
      </Dialog>

      <Dialog
        open={showSearch}
        onClose={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(""); }}
        title="Search messages"
        actions={<Button variant="secondary" onClick={() => { setShowSearch(false); setSearchResults([]); }}>Close</Button>}
      >
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input className="nv-input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search: from:@alex has:file is:thread before:2026-01-01" autoFocus style={{ flex: 1 }} />
          <Button type="submit">Search</Button>
        </form>
        <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginBottom: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span>from:user</span><span>in:#channel</span><span>has:file|image|video|link</span><span>is:thread</span><span>before:/after:date</span><span>type:code</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input className="nv-input" value={saveSearchName} onChange={(e) => setSaveSearchName(e.target.value)} placeholder="Name this search to save" style={{ flex: 1 }} />
          <Button variant="secondary" size="sm" disabled={!searchQuery.trim() || !saveSearchName.trim()} onClick={() => {
            const fd = new FormData();
            fd.set("name", saveSearchName);
            fd.set("query", searchQuery);
            void actions.saveSearch(fd).then(() => { setSaveSearchName(""); fetchSavedSearches(); });
          }}>Save</Button>
        </div>
        {savedSearches.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {savedSearches.map((s) => (
              <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--nv-color-border)", fontSize: 11 }}>
                🔍 {s.name}
                <button onClick={() => runSearch(s.query)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, padding: 0, color: "var(--nv-color-primary)" }} title="Run">▶</button>
                <button onClick={() => { const fd = new FormData(); fd.set("searchId", s.id); void actions.deleteSavedSearch(fd).then(() => fetchSavedSearches()); }} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, padding: 0, color: "var(--nv-color-text-faint)" }} title="Delete">✕</button>
              </span>
            ))}
          </div>
        )}
        <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {searchResults.length === 0 && searchQuery && <div className="nv-empty">No results found</div>}
          {searchResults.map((m) => (
            <a key={m.id} href={`/m/chat?c=${m.channelId}`} style={{ padding: "6px 8px", borderRadius: "var(--nv-radius-md)", background: "var(--nv-color-bg)", textDecoration: "none", color: "var(--nv-color-text)", display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{m.authorName} <span style={{ color: "var(--nv-color-text-faint)", fontWeight: 400 }}>in {(m as any).channel?.name ?? "channel"}</span></span>
              <span style={{ fontSize: "var(--nv-font-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.body}</span>
            </a>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={showBookmarks}
        onClose={() => setShowBookmarks(false)}
        title="Bookmarks"
        actions={<Button variant="secondary" onClick={() => setShowBookmarks(false)}>Close</Button>}
      >
        <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {bookmarks.length === 0 && <div className="nv-empty">No bookmarks yet — use the 🔖 on any message</div>}
          {bookmarks.map((b) => (
            <a key={b.id} href={`/m/chat?c=${b.message.channelId}`} style={{ padding: "6px 8px", borderRadius: "var(--nv-radius-md)", background: "var(--nv-color-bg)", textDecoration: "none", color: "var(--nv-color-text)", display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{b.message.authorName} <span style={{ color: "var(--nv-color-text-faint)", fontWeight: 400 }}>in {(b.message as any).channel?.name ?? "channel"}</span></span>
              <span style={{ fontSize: "var(--nv-font-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.message.body}</span>
            </a>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={showPinned}
        onClose={() => setShowPinned(false)}
        title="Pinned messages"
        actions={<Button variant="secondary" onClick={() => setShowPinned(false)}>Close</Button>}
      >
        <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {messages.filter(m => m.pinnedAt).length === 0 && <div className="nv-empty">No pinned messages</div>}
          {messages.filter(m => m.pinnedAt).map((m) => (
            <div key={m.id} style={{ padding: "6px 8px", borderRadius: "var(--nv-radius-md)", background: "var(--nv-color-bg)", fontSize: "var(--nv-font-sm)" }}>
              <div style={{ fontWeight: 600, fontSize: 12 }}>{m.authorName}</div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.body}</div>
            </div>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={showMembers}
        onClose={() => setShowMembers(false)}
        title="Members"
        actions={<Button variant="secondary" onClick={() => setShowMembers(false)}>Close</Button>}
      >
        <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          {active?.members.map((mem) => {
            const member = members.find(m => m.user.id === mem.userId);
            return (
              <div key={mem.userId} style={{ padding: "6px 8px", borderRadius: "var(--nv-radius-md)", background: "var(--nv-color-bg)", display: "flex", alignItems: "center", gap: 8, fontSize: "var(--nv-font-sm)" }}>
                <span>{presenceEmoji(presence[mem.userId])}</span>
                <span style={{ fontWeight: 600 }}>{member?.user.name ?? member?.user.email ?? "Unknown"}</span>
                <span style={{ color: "var(--nv-color-text-faint)", fontSize: 11, textTransform: "capitalize" }}>{mem.role.toLowerCase()}</span>
              </div>
            );
          })}
        </div>
      </Dialog>

      <Dialog
        open={editsFor !== null}
        onClose={() => setEditsFor(null)}
        title="Edit history"
        actions={<Button variant="secondary" onClick={() => setEditsFor(null)}>Close</Button>}
      >
        <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {editHistory.length === 0 && <div className="nv-empty">No edit history recorded</div>}
          {editHistory.map((e) => (
            <div key={e.id} style={{ padding: "6px 8px", borderRadius: "var(--nv-radius-md)", background: "var(--nv-color-bg)", fontSize: "var(--nv-font-sm)" }}>
              <div style={{ color: "var(--nv-color-text-faint)", fontSize: 11, marginBottom: 2 }}>{formatTime(e.editedAt)}</div>
              <div style={{ wordBreak: "break-word" }}>{e.body}</div>
            </div>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={showDigest}
        onClose={() => setShowDigest(false)}
        title="Unread digest"
        actions={<Button variant="secondary" onClick={() => setShowDigest(false)}>Close</Button>}
      >
        <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {digestBusy && <div className="nv-empty">Building digest…</div>}
          {!digestBusy && !digestData && <div className="nv-empty">No unread highlights right now</div>}
          {!digestBusy && !!digestData && (() => {
            const d = digestData as { title?: string; summary?: string; highlights?: string[]; messageCount?: number };
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontWeight: 700 }}>{d.title ?? "Unread digest"}</div>
                {d.summary && <div style={{ fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-muted)" }}>{d.summary}</div>}
                {(d.highlights ?? []).map((h, i) => (
                  <div key={i} style={{ padding: "6px 8px", borderRadius: "var(--nv-radius-md)", background: "var(--nv-color-bg)", fontSize: "var(--nv-font-sm)", wordBreak: "break-word" }}>
                    {h}
                  </div>
                ))}
                {typeof d.messageCount === "number" && <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>{d.messageCount} items in scope</div>}
              </div>
            );
          })()}
        </div>
      </Dialog>

      <Dialog
        open={showReminders}
        onClose={() => setShowReminders(false)}
        title="Reminders"
        actions={<Button variant="secondary" onClick={() => setShowReminders(false)}>Close</Button>}
      >
        <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {reminderBusy && <div className="nv-empty">Loading reminders…</div>}
          {!reminderBusy && reminders.length === 0 && <div className="nv-empty">No reminders yet — try /remind in the composer</div>}
          {reminders.map((r) => (
            <div key={r.id} style={{ padding: "6px 8px", borderRadius: "var(--nv-radius-md)", background: "var(--nv-color-bg)", display: "flex", alignItems: "center", gap: 8, fontSize: "var(--nv-font-sm)" }}>
              <span>{r.status === "PENDING" ? "⏳" : r.status === "FIRED" ? "✅" : "✖️"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ wordBreak: "break-word" }}>{r.text}</div>
                <div style={{ color: "var(--nv-color-text-faint)", fontSize: 11 }}>{new Date(r.remindAt).toLocaleString()}</div>
              </div>
              <span style={{ color: "var(--nv-color-text-faint)", fontSize: 10, textTransform: "uppercase" }}>{r.status.toLowerCase()}</span>
              {r.status === "PENDING" && (
                <button onClick={() => void cancelReminder(r.id)} style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-sm)", padding: "2px 8px", fontSize: 11, cursor: "pointer" }}>Cancel</button>
              )}
            </div>
          ))}
        </div>
      </Dialog>
    </div>
  );

  // ── Nested helpers ─────────────────────────────────────────────────

  function presenceEmoji(status?: string) {
    switch (status) {
      case "online": return "🟢";
      case "busy": return "🔴";
      case "dnd": return "⛔";
      case "away": return "🌙";
      case "offline": return "⚪";
      default: return "🟡";
    }
  }

  function presenceColor(status?: string) {
    switch (status) {
      case "online": return "var(--nv-color-success)";
      case "busy": return "var(--nv-color-danger)";
      case "dnd": return "var(--nv-color-warning)";
      case "away": return "#b7a24d";
      case "offline": return "var(--nv-color-text-faint)";
      default: return "var(--nv-color-warning)";
    }
  }

  function renderReactions(m: ChatMessage) {
    const groups = reactionGroups(m, userId);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
        {Object.entries(groups).map(([emoji, { count, mine, users }]) => (
          <button
            key={emoji}
            type="button"
            onClick={() => submitReact(m.id, emoji)}
            title={users.join(", ")}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, fontSize: 12, border: `1px solid ${mine ? "var(--nv-color-primary)" : "var(--nv-color-border)"}`, background: mine ? "var(--nv-color-primary-alpha)" : "transparent", color: "var(--nv-color-text)", cursor: "pointer" }}
          >
            <span>{emoji}</span>
            <span style={{ fontWeight: 600 }}>{count}</span>
          </button>
        ))}
        {pickerFor === m.id ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "2px 6px", borderRadius: 999, border: "1px solid var(--nv-color-border)" }}>
            {reactionEmojis.map((emoji) => (
              <button key={emoji} type="button" onClick={() => { submitReact(m.id, emoji); setPickerFor(null); }} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14, padding: "1px 4px" }}>{emoji}</button>
            ))}
          </span>
        ) : (
          <button type="button" onClick={() => setPickerFor(m.id)} style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: 999, padding: "2px 8px", fontSize: 12, color: "var(--nv-color-text-faint)", cursor: "pointer" }}>+</button>
        )}
      </div>
    );
  }

  function MessageMenu({ m }: { m: ChatMessage }) {
    if (m.deletedAt) return null;
    const isAuthor = m.createdById === userId;
    const replyCount = (m as any)._count?.replies ?? 0;
    const rec = (m as any).compliance?.[0];
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        {replyCount > 0 && (
          <button
            type="button"
            onClick={() => setActiveThread(m.id)}
            title={`View thread (${replyCount})`}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "none", background: "transparent", color: "var(--nv-color-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "2px 4px" }}
          >
            💬 {replyCount}
          </button>
        )}
        <Dropdown trigger={<Button variant="ghost" size="sm" style={{ minWidth: 0, padding: "2px 6px", opacity: 0.4 }}>⋯</Button>}>
        <MenuItem onSelect={() => { setReplyingTo(m); inputRef.current?.focus(); }}>Reply in thread</MenuItem>
        {replyCount > 0 && <MenuItem onSelect={() => setActiveThread(m.id)}>View thread ({replyCount})</MenuItem>}
        {isAuthor && <MenuItem onSelect={() => startEdit(m)}>Edit</MenuItem>}
        {isAuthor && <MenuItem danger onSelect={() => {
          const fd = new FormData();
          fd.set("messageId", m.id);
          void actions.delete(fd).then(() => {
            setLiveMessages((prev) => prev.filter((x) => x.id !== m.id));
            setDeletedIds((prev) => new Set(prev).add(m.id));
            router.refresh();
          }).catch((e) => setComplianceError((e as Error).message));
        }}>Delete</MenuItem>}
        {rec && (
          <MenuItem onSelect={() => {
            setComplianceError(rec.legalHold
              ? `Under legal hold: ${rec.legalHoldReason ?? "held until explicitly released"} — deletion is blocked until the hold is released.`
              : rec.retainUntil
                ? `Retention lock (${rec.retentionMode.toLowerCase()} mode) until ${new Date(rec.retainUntil).toLocaleDateString()} — deletion will be blocked until then.`
                : `Governed as ${rec.retentionMode.toLowerCase()} — deletion may be blocked by retention policy.`);
          }}>🔒 Why can't I delete this?</MenuItem>
        )}
        {m.pinnedAt ? (
          <MenuItem onSelect={() => submitUnpin(m.id)}>Unpin</MenuItem>
        ) : (
          <MenuItem onSelect={() => submitPin(m.id)}>Pin</MenuItem>
        )}
        <MenuItem onSelect={() => { setHyperFor(m.id); }}>🔗 Hyper-context</MenuItem>
        <MenuItem onSelect={() => toggleBookmark(m.id)}>🔖 Bookmark</MenuItem>
        <MenuItem onSelect={() => {
          const fd = new FormData();
          fd.set("messageId", m.id);
          fd.set("classification", "CONFIDENTIAL");
          void actions.governance({ op: "classify", messageId: m.id, classification: "CONFIDENTIAL" }).then(() => router.refresh()).catch((e) => setComplianceError((e as Error).message));
        }}>🔒 Mark confidential</MenuItem>
        </Dropdown>
      </div>
    );
  }
}
