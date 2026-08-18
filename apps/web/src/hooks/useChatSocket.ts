"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "fallback";

interface ChatMessage {
  id: string;
  channelId: string;
  workspaceId: string;
  createdById: string;
  authorName: string;
  body: string;
  bodyHtml?: string | null;
  parentId?: string | null;
  createdAt: string;
  attachments?: Array<{
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
    thumbnailKey?: string | null;
  }>;
}

interface PresenceEvent {
  type: "presence";
  user_id: string;
  status: string;
}

interface TypingEvent {
  type: "typing";
  channel_id: string;
  user_id: string;
}

type ChatEvent = ChatMessage | PresenceEvent | TypingEvent;

interface UseChatSocketOptions<T = ChatMessage> {
  token: string;
  workspaceId: string;
  channelId: string;
  onMessage: (msg: T) => void;
  onPresence: (userId: string, status: string) => void;
  onTyping: (channelId: string, userId: string) => void;
  onStatusChange: (status: ConnectionStatus) => void;
}

const WS_URL = process.env.NEXT_PUBLIC_CHAT_WS_URL || "ws://localhost:8080";
const SSE_URL = "/api/chat/stream";
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000;

export function useChatSocket<T = ChatMessage>({
  token,
  workspaceId,
  channelId,
  onMessage,
  onPresence,
  onTyping,
  onStatusChange,
}: UseChatSocketOptions<T>) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectCount = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribedChannel = useRef<string | null>(null);
  const wsFailedRef = useRef(false);
  const esChannelRef = useRef<string | null>(null);

  // Update status and notify parent
  const updateStatus = useCallback(
    (s: ConnectionStatus) => {
      setStatus(s);
      onStatusChange(s);
    },
    [onStatusChange],
  );

  // Connect via SSE (fallback)
  const connectSSE = useCallback(() => {
    // Already subscribed to this channel — keep the existing stream
    if (esRef.current && esChannelRef.current === channelId) return;

    if (esRef.current) esRef.current.close();

    const url = `${SSE_URL}?workspaceId=${encodeURIComponent(workspaceId)}&channelId=${encodeURIComponent(channelId)}`;
    const es = new EventSource(url);
    esRef.current = es;
    esChannelRef.current = channelId;

    es.onopen = () => updateStatus("fallback");
    es.onerror = () => updateStatus("disconnected");

    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.type === "initial" && payload.messages) {
          for (const msg of payload.messages) {
            onMessage(msg as T);
          }
        } else if (payload.type === "message" && payload.message) {
          onMessage(payload.message as T);
        } else if (payload.type === "message.deleted") {
          onMessage(payload as T);
        } else if (payload.type === "message.updated" && payload.message) {
          onMessage(payload as T);
        } else if (payload.type === "typing" && payload.channel_id && payload.user_id) {
          onTyping(payload.channel_id, payload.user_id);
        } else if (payload.type === "presence" && payload.user_id && payload.status) {
          onPresence(payload.user_id, payload.status);
        }
      } catch {
        // ignore parse errors
      }
    };
  }, [workspaceId, channelId, onMessage, onPresence, onTyping, updateStatus]);

  // Connect via WebSocket (primary)
  const connectWS = useCallback(() => {
    // Close existing connections
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    updateStatus("connecting");

    const url = `${WS_URL}/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectCount.current = 0;
      wsFailedRef.current = false;
      updateStatus("connected");

      // Subscribe to the channel
      if (channelId) {
        ws.send(JSON.stringify({ type: "subscribe", channel_id: channelId }));
        subscribedChannel.current = channelId;
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case "connected":
            // Server acknowledged connection
            break;
          case "message":
            if (msg.message) {
              onMessage(msg.message as T);
            }
            break;
          case "presence":
            onPresence(msg.user_id, msg.status);
            break;
          case "typing":
            onTyping(msg.channel_id, msg.user_id);
            break;
          case "pong":
            // Heartbeat response — ignore
            break;
          case "error":
            console.error("[chat-ws] error:", msg.message);
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      wsFailedRef.current = true;
      // WebSocket error — try fallback
      connectSSE();
    };

    ws.onclose = () => {
      updateStatus("disconnected");

      // If the WebSocket failed (gateway down), stay on SSE instead of
      // tearing down the EventSource every reconnect attempt.
      if (wsFailedRef.current) return;

      // Attempt reconnect with exponential backoff
      if (reconnectCount.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = RECONNECT_DELAY * Math.pow(2, reconnectCount.current);
        reconnectCount.current += 1;
        reconnectTimer.current = setTimeout(connectWS, delay);
      } else {
        // Fall back to SSE after max reconnects
        connectSSE();
      }
    };
  }, [token, channelId, onMessage, onPresence, onTyping, updateStatus, connectSSE]);

  // Initial connection
  useEffect(() => {
    if (!token || !channelId) return;

    // Try WebSocket first, fall back to SSE if it fails within 3 seconds
    connectWS();

    const fallbackTimer = setTimeout(() => {
      if (status === "connecting") {
        // WebSocket didn't connect fast enough — try SSE
        wsFailedRef.current = true;
        if (wsRef.current) wsRef.current.close();
        connectSSE();
      }
    }, 3000);

    return () => {
      clearTimeout(fallbackTimer);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
      if (esRef.current) esRef.current.close();
    };
  }, [token, channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Change subscription when channel changes
  useEffect(() => {
    if (status === "connected" && wsRef.current && channelId !== subscribedChannel.current) {
      // Unsubscribe from old channel
      if (subscribedChannel.current) {
        wsRef.current.send(
          JSON.stringify({ type: "unsubscribe", channel_id: subscribedChannel.current }),
        );
      }
      // Subscribe to new channel
      wsRef.current.send(JSON.stringify({ type: "subscribe", channel_id: channelId }));
      subscribedChannel.current = channelId;
    } else if (status === "fallback" && esRef.current && channelId !== esChannelRef.current) {
      // SSE stream is per-channel — reopen it for the new channel
      connectSSE();
    }
  }, [channelId, status, connectSSE]);

  // Send a message via WebSocket or fallback to form action
  const sendMessage = useCallback(
    (body: string) => {
      if (status === "connected" && wsRef.current) {
        wsRef.current.send(
          JSON.stringify({ type: "message", channel_id: channelId, body }),
        );
      }
      // If not connected, the form action handles it via Server Action
    },
    [status, channelId],
  );

  // Send typing indicator
  const sendTyping = useCallback(() => {
    if (status === "connected" && wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: "typing", channel_id: channelId }));
    } else {
      fetch("/api/chat/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      }).catch(() => {});
    }
  }, [status, channelId]);

  return { status, sendMessage, sendTyping };
}
