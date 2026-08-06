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

export function publish(workspaceId: string, payload: unknown) {
  const set = listeners.get(workspaceId);
  if (!set) return;
  for (const l of set) {
    try {
      l(payload);
    } catch {
      // ignore listener errors
    }
  }
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
