"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog } from "@n0va/ui";
import type { MeetMessage, MeetParticipant, MeetRoom, User } from "@n0va/db";

export interface MeetActions {
  createRoom?: (formData: FormData) => Promise<void>;
  join: (formData: FormData) => Promise<void>;
  leave: (formData: FormData) => Promise<void>;
  endRoom: (formData: FormData) => Promise<void>;
  send: (formData: FormData) => Promise<void>;
  getTranscript?: (formData: FormData) => Promise<MeetTranscriptData>;
}

export interface MeetTranscriptData {
  room: MeetRoom;
  messages: MeetMessage[];
  participants: MeetParticipant[];
}

type RoomWithMeta = MeetRoom & {
  _count: { participants: number };
  participants: Array<MeetParticipant & { user: { name: string | null; email: string } }>;
};

type EndedRoom = MeetRoom & { _count: { participants: number } };

type TranscriptEntry =
  | { key: string; at: number; kind: "message"; author: string; body: string }
  | { key: string; at: number; kind: "joined" | "left"; author: string };

function formatDuration(start: Date, end: Date) {
  const minutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

function transcriptEntries(data: MeetTranscriptData): TranscriptEntry[] {
  const entries: TranscriptEntry[] = data.messages.map((m) => ({
    key: `m-${m.id}`,
    at: new Date(m.createdAt).getTime(),
    kind: "message",
    author: m.authorName,
    body: m.body,
  }));
  for (const p of data.participants) {
    entries.push({ key: `j-${p.id}`, at: new Date(p.joinedAt).getTime(), kind: "joined", author: p.name });
    if (p.leftAt) entries.push({ key: `l-${p.id}`, at: new Date(p.leftAt).getTime(), kind: "left", author: p.name });
  }
  return entries.sort((a, b) => a.at - b.at);
}

interface LiveParticipant {
  id: string;
  userId: string;
  name: string;
  joinedAt: string;
}

interface LivePayload {
  type: string;
  participant?: LiveParticipant;
  participants?: LiveParticipant[];
  userId?: string;
  joined?: boolean;
  message?: MeetMessage;
  messages?: MeetMessage[];
  ended?: boolean;
}

function useRoomStream(roomId: string | null) {
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [messages, setMessages] = useState<MeetMessage[]>([]);
  const [ended, setEnded] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!roomId) return;
    setParticipants([]);
    setMessages([]);
    setEnded(false);
    const es = new EventSource(`/api/meet/stream?roomId=${encodeURIComponent(roomId)}`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      const payload = JSON.parse(e.data) as LivePayload;
      if (payload.type === "initial") {
        setParticipants(payload.participants ?? []);
        setMessages(payload.messages ?? []);
      } else if (payload.type === "presence") {
        setParticipants((prev) => {
          if (payload.joined) {
            if (!payload.participant) return prev;
            return prev.some((p) => p.userId === payload.participant!.userId)
              ? prev
              : [...prev, payload.participant!];
          }
          return prev.filter((p) => p.userId !== payload.userId);
        });
      } else if (payload.type === "message" && payload.message) {
        setMessages((prev) => (prev.some((m) => m.id === payload.message!.id) ? prev : [...prev, payload.message!]));
      } else if (payload.type === "ended") {
        setEnded(true);
      }
    };
    return () => es.close();
  }, [roomId]);

  return { participants, messages, ended, connected };
}

export function MeetRooms({
  rooms,
  endedRooms,
  actions,
}: {
  rooms: RoomWithMeta[];
  endedRooms?: EndedRoom[];
  actions: MeetActions;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [transcript, setTranscript] = useState<MeetTranscriptData | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState<string | null>(null);

  const openTranscript = (roomId: string) => {
    setLoadingTranscript(roomId);
    const fd = new FormData();
    fd.set("roomId", roomId);
    void actions.getTranscript?.(fd)
      .then((data) => setTranscript(data))
      .catch(() => undefined)
      .finally(() => setLoadingTranscript(null));
  };

  const entries = transcript ? transcriptEntries(transcript) : [];

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA MEET</h1>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setCreating(true)}>
          + New room
        </Button>
      </div>

      {rooms.length === 0 ? (
        <div className="nv-empty" style={{ minHeight: 280 }}>
          <div>No live rooms</div>
          <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
            Start a meeting
          </Button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--nv-space-3)" }}>
          {rooms.map((r) => (
            <div key={r.id} className="nv-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--nv-color-success)", display: "inline-block" }} />
                <span style={{ fontWeight: 800, fontSize: "var(--nv-font-lg)" }}>{r.name}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
                {r._count.participants} in the room · started {r.startedAt.toLocaleTimeString()}
              </div>
              <a href={`/m/meet/${r.id}`} style={{ textDecoration: "none" }}>
                <Button style={{ width: "100%" }}>Join</Button>
              </a>
            </div>
          ))}
        </div>
      )}

      {endedRooms && (
        <div style={{ marginTop: "var(--nv-space-6)" }}>
          <h2 style={{ fontSize: "var(--nv-font-lg)", fontWeight: 800, marginBottom: "var(--nv-space-3)" }}>
            Past meetings
          </h2>
          {endedRooms.length === 0 ? (
            <div className="nv-empty" style={{ minHeight: 120 }}>
              <div>No past meetings yet</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--nv-space-3)" }}>
              {endedRooms.map((r) => (
                <div key={r.id} className="nv-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: "var(--nv-font-lg)" }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
                    {new Date(r.endedAt!).toLocaleDateString()} · {formatDuration(r.startedAt, r.endedAt!)} ·{" "}
                    {r._count.participants} participant{r._count.participants === 1 ? "" : "s"}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={loadingTranscript !== null}
                    onClick={() => openTranscript(r.id)}
                  >
                    {loadingTranscript === r.id ? "Loading…" : "View transcript"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog
        open={transcript !== null}
        onClose={() => setTranscript(null)}
        title={transcript ? `${transcript.room.name} — transcript` : ""}
        actions={
          <Button variant="secondary" onClick={() => setTranscript(null)}>
            Close
          </Button>
        }
      >
        {transcript && (
          <div style={{ minWidth: 460, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
              {new Date(transcript.room.endedAt!).toLocaleDateString()} ·{" "}
              {formatDuration(transcript.room.startedAt, transcript.room.endedAt!)} ·{" "}
              {transcript.participants.length} participant{transcript.participants.length === 1 ? "" : "s"}
            </div>
            <div style={{ maxHeight: 420, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {entries.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No messages recorded</div>
              )}
              {entries.map((e) =>
                e.kind === "message" ? (
                  <div key={e.key}>
                    <span style={{ fontWeight: 700, fontSize: 12 }}>{e.author}</span>
                    <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginLeft: 6 }}>
                      {new Date(e.at).toLocaleTimeString()}
                    </span>
                    <div style={{ fontSize: "var(--nv-font-sm)", whiteSpace: "pre-wrap" }}>{e.body}</div>
                  </div>
                ) : (
                  <div key={e.key} style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
                    {e.author} {e.kind === "joined" ? "joined" : "left"} · {new Date(e.at).toLocaleTimeString()}
                  </div>
                ),
              )}
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New meeting room"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-room-form">
              Start
            </Button>
          </>
        }
      >
        <form
          id="create-room-form"
          action={(fd) => {
            void actions.createRoom?.(fd).then(() => {
              setCreating(false);
              setTimeout(() => router.refresh(), 50);
            });
          }}
          style={{ minWidth: 320 }}
        >
          <input className="nv-input" name="name" placeholder="e.g. Product sync" autoFocus required />
        </form>
      </Dialog>
    </div>
  );
}

export function MeetRoomView({
  room,
  initialParticipants,
  initialMessages,
  actions,
  userId,
}: {
  room: MeetRoom;
  initialParticipants: Array<MeetParticipant & { user: { name: string | null; email: string } }>;
  initialMessages: MeetMessage[];
  actions: MeetActions;
  userId: string;
}) {
  const router = useRouter();
  const { participants: liveParticipants, messages: liveMessages, ended, connected } = useRoomStream(room.id);
  const joinedRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (joinedRef.current) return;
    joinedRef.current = true;
    const fd = new FormData();
    fd.set("roomId", room.id);
    void actions.join(fd).then(() => router.refresh());
    return () => {
      const lf = new FormData();
      lf.set("roomId", room.id);
      void actions.leave(lf).then(() => router.refresh());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [liveMessages.length]);

  const participantList = liveParticipants.length
    ? liveParticipants.map((p) => ({ id: p.id, name: p.name }))
    : initialParticipants.map((p) => ({ id: p.id, name: p.user.name ?? p.user.email }));

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--nv-space-4)", flexWrap: "wrap" }}>
        <a href="/m/meet" className="nv-link" style={{ fontSize: "var(--nv-font-sm)" }}>
          ← All rooms
        </a>
        <span style={{ fontWeight: 800, fontSize: "var(--nv-font-lg)" }}>{room.name}</span>
        <span style={{ fontSize: 12, color: connected ? "var(--nv-color-success)" : "var(--nv-color-text-faint)" }}>
          {connected ? "● live" : "○ connecting"}
        </span>
        <div style={{ flex: 1 }} />
        <Button
          variant="danger"
          size="sm"
          onClick={() => {
            const fd = new FormData();
            fd.set("roomId", room.id);
            void actions.endRoom(fd).then(() => router.push("/m/meet"));
          }}
        >
          End meeting
        </Button>
      </div>

      {ended && (
        <div className="nv-empty" style={{ minHeight: 300 }}>
          <div>This meeting has ended</div>
          <Button variant="secondary" size="sm" onClick={() => router.push("/m/meet")}>
            Back to rooms
          </Button>
        </div>
      )}

      <div style={{ display: "flex", gap: "var(--nv-space-4)" }}>
        {/* Video stage */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "var(--nv-space-3)", alignContent: "start" }}>
          {participantList.length === 0 && (
            <div className="nv-empty" style={{ gridColumn: "1 / -1", minHeight: 240 }}>
              <div>Waiting for people to join…</div>
            </div>
          )}
          {participantList.map((p) => (
            <div
              key={p.id}
              style={{
                aspectRatio: "16/10",
                borderRadius: "var(--nv-radius-lg)",
                background: "linear-gradient(135deg, #1b1e28, #0f1115)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                position: "relative",
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: "var(--nv-color-primary-alpha)",
                  color: "var(--nv-color-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 20,
                }}
              >
                {(p.name[0] ?? "?").toUpperCase()}
              </div>
              <div style={{ color: "#dfe2ea", fontSize: 13, fontWeight: 600 }}>
                {p.name} {p.id === "me" ? "(you)" : ""}
              </div>
              <div style={{ position: "absolute", bottom: 10, right: 12, fontSize: 11, color: "#8b90a0" }}>
                🎥 simulated
              </div>
            </div>
          ))}
        </div>

        {/* Room chat */}
        <div
          style={{
            width: 300,
            flexShrink: 0,
            background: "var(--nv-color-surface)",
            border: "1px solid var(--nv-color-border)",
            borderRadius: "var(--nv-radius-lg)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            height: 480,
          }}
        >
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--nv-color-border)", fontWeight: 700, fontSize: "var(--nv-font-sm)" }}>
            In-meeting chat
          </div>
          <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {liveMessages.length === 0 && initialMessages.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No messages yet</div>
            )}
            {(liveMessages.length ? liveMessages : initialMessages).map((m) => (
              <div key={m.id}>
                <span style={{ fontWeight: 700, fontSize: 12 }}>{m.authorName}</span>
                <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginLeft: 6 }}>
                  {new Date(m.createdAt).toLocaleTimeString()}
                </span>
                <div style={{ fontSize: "var(--nv-font-sm)", whiteSpace: "pre-wrap" }}>{m.body}</div>
              </div>
            ))}
          </div>
          <form
            action={actions.send}
            style={{ padding: 10, borderTop: "1px solid var(--nv-color-border)", display: "flex", gap: 6 }}
          >
            <input type="hidden" name="roomId" value={room.id} />
            <input className="nv-input" name="body" placeholder="Message…" required style={{ flex: 1 }} />
            <Button type="submit" size="sm">
              Send
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
