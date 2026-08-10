"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Dropdown, MenuItem, cn } from "@n0va/ui";
import type { ChatChannel, ChatMessage, WorkspaceMember } from "@n0va/db";
import { useChatSocket } from "@/hooks/useChatSocket";

export interface ChatActions {
  createChannel: (formData: FormData) => Promise<void>;
  createDm: (formData: FormData) => Promise<void>;
  send: (formData: FormData) => Promise<void>;
  rename: (formData: FormData) => Promise<void>;
  deleteChannel: (formData: FormData) => Promise<void>;
  react: (formData: FormData) => Promise<void>;
  markRead: (formData: FormData) => Promise<void>;
}

interface MessageReaction {
  emoji: string;
  userId: string;
  authorName: string;
}

type ChannelWithMeta = ChatChannel & {
  members: { userId: string }[];
  _count: { messages: number };
};
type MemberWithUser = WorkspaceMember & {
  user: { id: string; name: string | null; email: string };
};

function reactionGroups(
  m: ChatMessage,
  userId: string,
): Record<string, { count: number; mine: boolean }> {
  const groups: Record<string, { count: number; mine: boolean }> = {};
  const reactions = Array.isArray(m.reactions)
    ? (m.reactions as unknown as MessageReaction[])
    : [];
  for (const r of reactions) {
    const g = groups[r.emoji] ?? { count: 0, mine: false };
    g.count += 1;
    if (r.userId === userId) g.mine = true;
    groups[r.emoji] = g;
  }
  return groups;
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
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // WebSocket connection with SSE fallback
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
      // Clear typing indicator after 3 seconds
      setTimeout(() => {
        setTypingUsers((prev) => {
          const current = prev[cid] || [];
          return { ...prev, [cid]: current.filter((u) => u !== uid) };
        });
      }, 3000);
    },
    onStatusChange: (s) => setConnStatus(s),
  });

  // Merge live messages with initial messages
  const messages = useMemo(() => {
    if (!liveMessages.length) return initialMessages;
    const byId = new Map<string, ChatMessage>(liveMessages.map((m) => [m.id, m]));
    for (const m of initialMessages) byId.set(m.id, m);
    return [...byId.values()].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [liveMessages, initialMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, activeChannelId]);

  // Mark channel as read when switching
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

  const handleSend = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputValue.trim() || !active) return;

    // Try WebSocket first
    if (wsStatus === "connected") {
      sendMessage(inputValue.trim());
      setInputValue("");
      // Also call server action for persistence (in case WS gateway is down)
      const fd = new FormData();
      fd.set("channelId", active.id);
      fd.set("body", inputValue.trim());
      void actions.send(fd);
    } else {
      // Fallback to form submission
      const fd = new FormData();
      fd.set("channelId", active.id);
      fd.set("body", inputValue.trim());
      void actions.send(fd).then(() => {
        setInputValue("");
        router.refresh();
      });
    }
  };

  const handleTyping = () => {
    if (wsStatus === "connected") {
      sendTyping();
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
      style={{
        display: "flex",
        gap: "var(--nv-space-4)",
        height: "calc(100dvh - 150px)",
        minHeight: 440,
      }}
    >
      {/* Channels rail */}
      <div
        style={{
          width: 264,
          flexShrink: 0,
          background: "var(--nv-color-surface)",
          border: "1px solid var(--nv-color-border)",
          borderRadius: "var(--nv-radius-lg)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)" }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>N0VA CHAT</div>
          <div style={{ display: "flex", gap: 6 }}>
            <Button size="sm" onClick={() => setShowNew(true)}>
              + Channel
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowDm(true)}>
              DM
            </Button>
          </div>
        </div>
        <div
          style={{
            overflowY: "auto",
            padding: "var(--nv-space-2)",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {channels.length === 0 && <div className="nv-empty">No channels yet</div>}
          {channels.map((c) => {
            const unreadCount = unread[c.id] ?? 0;
            return (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  padding: "4px 6px",
                  borderRadius: "var(--nv-radius-md)",
                  background:
                    activeChannelId === c.id ? "var(--nv-color-primary-alpha)" : "transparent",
                }}
              >
                <a
                  href={`/m/chat?c=${c.id}`}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 0,
                    padding: "4px 4px",
                    textDecoration: "none",
                    color: "var(--nv-color-text)",
                    fontSize: "var(--nv-font-sm)",
                    fontWeight: activeChannelId === c.id ? 700 : 500,
                  }}
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
                  <span style={{ color: "var(--nv-color-text-faint)", fontSize: 12 }}>
                    {c._count.messages}
                  </span>
                </a>
                {c.kind === "CHANNEL" ? (
                  <Dropdown trigger={<Button variant="ghost" size="sm" style={{ minWidth: 0, padding: "2px 6px" }}>⋯</Button>}>
                    <MenuItem onSelect={() => setRenaming(c)}>Rename</MenuItem>
                    <MenuItem danger onSelect={() => setConfirming(c)}>
                      Delete
                    </MenuItem>
                  </Dropdown>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Messages pane */}
      <div
        style={{
          flex: 1,
          background: "var(--nv-color-surface)",
          border: "1px solid var(--nv-color-border)",
          borderRadius: "var(--nv-radius-lg)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "var(--nv-space-3) var(--nv-space-4)",
            borderBottom: "1px solid var(--nv-color-border)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontWeight: 800 }}>
            {active ? channelLabel(active) : "Select a channel"}
          </span>
          <span style={{ fontSize: 12, color: status.color }}>{status.text}</span>
        </div>

        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "var(--nv-space-4)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {!active && (
            <div className="nv-empty" style={{ flex: 1 }}>
              <div>Pick a channel or start a new conversation</div>
              <Button size="sm" onClick={() => setShowNew(true)}>
                Create channel
              </Button>
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              style={{ display: "flex", gap: 10, padding: "6px 8px", borderRadius: "var(--nv-radius-md)" }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: "var(--nv-color-primary-alpha)",
                  color: "var(--nv-color-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                {(m.authorName[0] ?? "?").toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13 }}>
                  <span style={{ fontWeight: 700 }}>{m.authorName}</span>
                  <span style={{ color: "var(--nv-color-text-faint)", marginLeft: 8 }}>
                    {new Date(m.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: "var(--nv-font-md)" }}>{m.body}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                  {Object.entries(reactionGroups(m, userId)).map(([emoji, { count, mine }]) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => submitReact(m.id, emoji)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontSize: 12,
                        border: `1px solid ${mine ? "var(--nv-color-primary)" : "var(--nv-color-border)"}`,
                        background: mine ? "var(--nv-color-primary-alpha)" : "transparent",
                        color: "var(--nv-color-text)",
                        cursor: "pointer",
                      }}
                    >
                      <span>{emoji}</span>
                      <span style={{ fontWeight: 600 }}>{count}</span>
                    </button>
                  ))}
                  {pickerFor === m.id ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 2,
                        padding: "2px 6px",
                        borderRadius: 999,
                        border: "1px solid var(--nv-color-border)",
                      }}
                    >
                      {reactionEmojis.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            submitReact(m.id, emoji);
                            setPickerFor(null);
                          }}
                          style={{
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            fontSize: 14,
                            padding: "1px 4px",
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPickerFor(m.id)}
                      style={{
                        border: "1px solid var(--nv-color-border)",
                        background: "transparent",
                        borderRadius: 999,
                        padding: "2px 8px",
                        fontSize: 12,
                        color: "var(--nv-color-text-faint)",
                        cursor: "pointer",
                      }}
                    >
                      +
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {activeChannelId && getTypingText() && (
            <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", padding: "4px 8px" }}>
              {getTypingText()}
            </div>
          )}
        </div>

        {/* Message input */}
        <form
          onSubmit={handleSend}
          style={{
            padding: "var(--nv-space-3)",
            borderTop: "1px solid var(--nv-color-border)",
            display: "flex",
            gap: 8,
          }}
        >
          <input type="hidden" name="channelId" value={activeChannelId ?? ""} />
          <input
            className="nv-input"
            name="body"
            placeholder={active ? "Type a message…" : "Select a channel first"}
            disabled={!active}
            required
            autoComplete="off"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleTyping}
          />
          <Button type="submit" disabled={!active || !inputValue.trim()}>
            Send
          </Button>
        </form>
      </div>

      {/* Dialogs */}
      <Dialog
        open={showNew}
        onClose={() => setShowNew(false)}
        title="Create channel"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowNew(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-channel-form">
              Create
            </Button>
          </>
        }
      >
        <form id="create-channel-form" action={submitCreate}>
          <input className="nv-input" name="name" placeholder="e.g. design" autoFocus required />
        </form>
      </Dialog>

      <Dialog
        open={showDm}
        onClose={() => setShowDm(false)}
        title="Start a direct message"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowDm(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-dm-form">
              Start
            </Button>
          </>
        }
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
        actions={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button type="submit" form="rename-channel-form">
              Save
            </Button>
          </>
        }
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
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button variant="danger" type="submit" form="delete-channel-form">
              Delete
            </Button>
          </>
        }
      >
        <form id="delete-channel-form" action={submitDelete}>
          <input type="hidden" name="channelId" value={confirming?.id ?? ""} />
          <div style={{ fontSize: "var(--nv-font-sm)" }}>
            Delete <strong>{confirming?.name}</strong>? All messages in this channel will be removed.
          </div>
        </form>
      </Dialog>
    </div>
  );
}
