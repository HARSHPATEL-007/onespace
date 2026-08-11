"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Dropdown, MenuItem, cn } from "@n0va/ui";
import type { ChatChannel, ChatMessage, WorkspaceMember } from "@n0va/db";
import { useChatSocket } from "@/hooks/useChatSocket";

export interface ChatActions {
  createChannel: (formData: FormData) => Promise<void>;
  createDm: (formData: FormData) => Promise<void>;
  updateChannel: (formData: FormData) => Promise<void>;
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
}

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
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

function renderBody(m: ChatMessage) {
  if (m.bodyHtml) {
    return <div className="nv-message-body" dangerouslySetInnerHTML={{ __html: m.bodyHtml }} />;
  }
  return <div className="nv-message-body">{m.body}</div>;
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
}) {
  const router = useRouter();
  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);
  const [presence, setPresence] = useState<Record<string, string>>({});
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
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { status: wsStatus, sendMessage, sendTyping } = useChatSocket({
    token,
    workspaceId,
    channelId: activeChannelId || "",
    onMessage: (msg) => {
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
    if (!liveMessages.length) return initialMessages;
    const byId = new Map<string, ChatMessage>(liveMessages.map((m) => [m.id, m]));
    for (const m of initialMessages) byId.set(m.id, m);
    return [...byId.values()]
      .filter((m) => !m.deletedAt && !m.parentId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [liveMessages, initialMessages]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length, activeChannelId]);

  useEffect(() => {
    if (!activeChannelId) return;
    const fd = new FormData();
    fd.set("channelId", activeChannelId);
    void actions.markRead(fd).then(() => router.refresh());
  }, [activeChannelId]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = channels.find((c) => c.id === activeChannelId);

  const submitCreate = (fd: FormData) => {
    void actions.createChannel(fd).then(() => {
      setShowNew(false);
      router.refresh();
    });
  };

  const submitDm = (fd: FormData) => {
    void actions.createDm(fd).then(() => {
      setShowDm(false);
      router.refresh();
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

  const handleSend = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputValue.trim() || !active) return;

    if (wsStatus === "connected") {
      sendMessage(inputValue.trim());
      setInputValue("");
      const fd = new FormData();
      fd.set("channelId", active.id);
      fd.set("body", inputValue.trim());
      if (replyingTo) fd.set("parentId", replyingTo.id);
      void actions.send(fd);
      setReplyingTo(null);
    } else {
      const fd = new FormData();
      fd.set("channelId", active.id);
      fd.set("body", inputValue.trim());
      if (replyingTo) {
        fd.set("parentId", replyingTo.id);
        void actions.reply(fd).then(() => {
          setInputValue("");
          setReplyingTo(null);
          router.refresh();
        });
      } else {
        void actions.send(fd).then(() => {
          setInputValue("");
          setReplyingTo(null);
          router.refresh();
        });
      }
    }
  };

  const handleTyping = () => {
    if (wsStatus === "connected") {
      sendTyping();
    }
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const fd = new FormData();
    fd.set("query", searchQuery);
    if (activeChannelId) fd.set("channelId", activeChannelId);
    void actions.search(fd).then((result) => {
      if (result) setSearchResults(result.messages);
    });
  };

  const startEdit = (m: ChatMessage) => {
    setEditing(m.id);
    setEditValue(m.body);
    setReplyingTo(null);
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
    <div className="nv-chat-layout" style={{ display: "flex", gap: "var(--nv-space-4)", height: "calc(100dvh - 150px)", minHeight: 440 }}>
      {/* Channels rail */}
      <div className="nv-chat-sidebar" style={{ width: 264, flexShrink: 0, background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-lg)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)" }}>
          <div style={{ fontWeight: 800, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>N0VA CHAT</span>
            <button onClick={() => setShowSearch(true)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--nv-color-text-faint)", fontSize: 16 }}>⌕</button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Button size="sm" onClick={() => setShowNew(true)}>+ Channel</Button>
            <Button size="sm" variant="secondary" onClick={() => setShowDm(true)}>DM</Button>
          </div>
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
                    {presence[c.createdById] === "online" && c.kind === "DM" ? (
                      <span style={{ color: "var(--nv-color-success)", fontSize: 10 }}>●</span>
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
                  <span style={{ color: "var(--nv-color-text-faint)", fontSize: 12 }}>{c._count.messages}</span>
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
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            <button onClick={() => setShowPinned(true)} style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-md)", padding: "4px 8px", fontSize: 12, cursor: "pointer", color: "var(--nv-color-text)" }}>📌 Pins</button>
            <button onClick={() => setShowMembers(true)} style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-md)", padding: "4px 8px", fontSize: 12, cursor: "pointer", color: "var(--nv-color-text)" }}>👥 {active?.members.length ?? 0}</button>
          </div>
        </div>

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
                        {m.editedAt && <span style={{ color: "var(--nv-color-text-faint)", fontSize: 10 }}>(edited)</span>}
                        {m.pinnedAt && <span style={{ color: "var(--nv-color-warning)", fontSize: 10 }}>📌</span>}
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
                          <div style={{ fontSize: "var(--nv-font-md)" }}>{renderBody(m)}</div>
                        )}
                      </div>
                      {renderReactions(m)}
                    </div>
                    <MessageMenu m={m} />
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 10, padding: "2px 8px" }}>
                    <div style={{ width: 36, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                      <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)", opacity: 0 }}>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
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
                        <div style={{ fontSize: "var(--nv-font-md)" }}>{renderBody(m)}</div>
                      )}
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

        {/* Message input */}
        <form onSubmit={handleSend} style={{ padding: "var(--nv-space-3)", borderTop: "1px solid var(--nv-color-border)", display: "flex", gap: 8, alignItems: "flex-end" }}>
          <input type="hidden" name="channelId" value={activeChannelId ?? ""} />
          <input
            ref={inputRef}
            className="nv-input"
            name="body"
            placeholder={active ? `Message ${channelLabel(active)}` : "Select a channel first"}
            disabled={!active}
            required
            autoComplete="off"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleTyping}
            style={{ flex: 1 }}
          />
          <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} />
          <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={!active} title="Attach file">📎</Button>
          <Button type="submit" disabled={!active || !inputValue.trim()}>Send</Button>
        </form>
      </div>

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
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input className="nv-input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search messages..." autoFocus style={{ flex: 1 }} />
          <Button type="submit">Search</Button>
        </form>
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
                <span>{presence[mem.userId] === "online" ? "🟢" : "⚪"}</span>
                <span style={{ fontWeight: 600 }}>{member?.user.name ?? member?.user.email ?? "Unknown"}</span>
                <span style={{ color: "var(--nv-color-text-faint)", fontSize: 11, textTransform: "capitalize" }}>{mem.role.toLowerCase()}</span>
              </div>
            );
          })}
        </div>
      </Dialog>
    </div>
  );

  // ── Nested helpers ─────────────────────────────────────────────────

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
    return (
      <Dropdown trigger={<Button variant="ghost" size="sm" style={{ minWidth: 0, padding: "2px 6px", opacity: 0.4 }}>⋯</Button>}>
        <MenuItem onSelect={() => { setReplyingTo(m); inputRef.current?.focus(); }}>Reply in thread</MenuItem>
        {isAuthor && <MenuItem onSelect={() => startEdit(m)}>Edit</MenuItem>}
        {isAuthor && <MenuItem danger onSelect={() => { const fd = new FormData(); fd.set("messageId", m.id); void actions.delete(fd).then(() => router.refresh()); }}>Delete</MenuItem>}
        {m.pinnedAt ? (
          <MenuItem onSelect={() => submitUnpin(m.id)}>Unpin</MenuItem>
        ) : (
          <MenuItem onSelect={() => submitPin(m.id)}>Pin</MenuItem>
        )}
      </Dropdown>
    );
  }
}
