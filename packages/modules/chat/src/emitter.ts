type Listener = (payload: unknown) => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribe(workspaceId: string, listener: Listener): () => void {
  const set = listeners.get(workspaceId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(workspaceId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(workspaceId);
  };
}

export function publish(workspaceId: string, payload: unknown): { listenerCount: number } {
  const set = listeners.get(workspaceId);
  if (!set || set.size === 0) return { listenerCount: 0 };
  let ok = 0;
  for (const l of set) {
    try {
      l(payload);
      ok += 1;
    } catch {
      // ignore listener errors
    }
  }
  return { listenerCount: ok };
}

export interface LiveMessage {
  type: "message" | "connected" | "ping" | "initial";
  message?: {
    id: string;
    channelId: string;
    workspaceId: string;
    createdById: string;
    authorName: string;
    body: string;
    createdAt: string;
  };
  messages?: unknown[];
}
