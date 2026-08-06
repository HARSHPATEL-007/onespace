"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, cn } from "@n0va/ui";
import type { ChatChannel, ChatMessage, WorkspaceMember } from "@n0va/db";

export interface ChatActions {
  createChannel: (formData: FormData) => Promise<void>;
  createDm: (formData: FormData) => Promise<void>;
  send: (formData: FormData) => Promise<void>;
  rename: (formData: FormData) => Promise<void>;
  deleteChannel: (formData: FormData) => Promise<void>;
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

export function ChatPanel({
  workspaceId,
  userId,
  channels,
  members,
  activeChannelId,
  initialMessages,
  actions,
}: {
  workspaceId: string;
  userId: string;
  channels: ChannelWithMeta[];
  members: MemberWithUser[];
  activeChannelId: string | null;
  initialMessages: ChatMessage[];
  actions: ChatActions;
}) {
  const router = useRouter();
  const { live, connected } = useLiveChannel(activeChannelId, workspaceId);
  const [showNew, setShowNew] = useState(false);
  const [showDm, setShowDm] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(
    () => (live.length ? live : initialMessages),
    [live, initialMessages],
  );

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, activeChannelId]);

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
          {channels.map((c) => (
            <a
              key={c.id}
              href={`/m/chat?c=${c.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: "var(--nv-radius-md)",
                textDecoration: "none",
                color: "var(--nv-color-text)",
                fontSize: "var(--nv-font-sm)",
                fontWeight: activeChannelId === c.id ? 700 : 500,
                background: activeChannelId === c.id ? "var(--nv-color-primary-alpha)" : "transparent",
              }}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {channelLabel(c)}
              </span>
              <span style={{ color: "var(--nv-color-text-faint)", fontSize: 12 }}>{c._count.messages}</span>
            </a>
          ))}
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
    </div>
  );
}