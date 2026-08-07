"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Dropdown, MenuItem, cn } from "@n0va/ui";
import type { ChatChannel, ChatMessage, WorkspaceMember } from "@n0va/db";

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

interface LivePayload {
  type: string;
  message?: ChatMessage;
  messages?: ChatMessage[];
}

function useLiveChannel(channelId: string | null, workspaceId: string) {
  const [live, setLive] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!channelId) return;
    setLive([]);
    setConnected(false);
    const es = new EventSource(
      `/api/chat/stream?workspaceId=${encodeURIComponent(workspaceId)}&channelId=${encodeURIComponent(channelId)}`,
    );
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      const payload = JSON.parse(e.data) as LivePayload;
      if (payload.type === "initial" && payload.messages) {
        setLive(payload.messages);
      } else if (payload.type === "message" && payload.message) {
        setLive((prev) =>
          prev.some((m) => m.id === payload.message!.id) ? prev : [...prev, payload.message!],
        );
      }
    };
    return () => es.close();
  }, [channelId, workspaceId]);

  return { live, connected };
}

type ChannelWithMeta = ChatChannel & {
  members: { userId: string }[];
  _count: { messages: number };
};
type MemberWithUser = WorkspaceMember & { user: { id: string; name: string | null; email: string } };

function reactionGroups(
  m: ChatMessage,
  userId: string,
): Record<string, { count: number; mine: boolean }> {
  const groups: Record<string, { count: number; mine: boolean }> = {};
  const reactions = Array.isArray(m.reactions) ? (m.reactions as unknown as MessageReaction[]) : [];
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
}) {
  const router = useRouter();
  const { live, connected } = useLiveChannel(activeChannelId, workspaceId);
  const [showNew, setShowNew] = useState(false);
  const [showDm, setShowDm] = useState(false);
  const [renaming, setRenaming] = useState<ChannelWithMeta | null>(null);
  const [confirming, setConfirming] = useState<ChannelWithMeta | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(() => {
    if (!live.length) return initialMessages;
    const byId = new Map<string, ChatMessage>(live.map((m) => [m.id, m]));
    for (const m of initialMessages) byId.set(m.id, m);
    return [...byId.values()].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [live, initialMessages]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, activeChannelId]);

  useEffect(() => {
    if (!activeChannelId) return;
    const fd = new FormData();
    fd.set("channelId", activeChannelId);
    void actions.markRead(fd).then(() => router.refresh());
  }, [activeChannelId]);

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

  const channelLabel = (c: ChannelWithMeta): string => {
    if (c.kind !== "DM") return `# ${c.name}`;
    const other = members.find(
      (m) => m.user.id !== userId && c.members.some((cm) => cm.userId === m.user.id),
    );
    return other ? other.user.name ?? other.user.email : "Direct message";
  };

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
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {channelLabel(c)}
                  </span>
                  {unreadCount > 0 && activeChannelId !== c.id ? (
                    <span className="nv-badge nv-badge-amber">{unreadCount}</span>
                  ) : null}
                  <span style={{ color: "var(--nv-color-text-faint)", fontSize: 12 }}>{c._count.messages}</span>
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
          <span style={connected ? { fontSize: 12, color: "var(--nv-color-success)" } : { fontSize: 12, color: "var(--nv-color-text-faint)" }}>
            {connected ? "● live" : "○ reconnecting"}
          </span>
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
        </div>

        <form
          action={actions.send}
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
          />
          <Button type="submit" disabled={!active}>
            Send
          </Button>
        </form>
      </div>

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