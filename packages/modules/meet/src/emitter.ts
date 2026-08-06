type Listener = (payload: unknown) => void;

const listeners = new Map<string, Set<Listener>>();

export function roomKey(roomId: string) {
  return `meet:${roomId}`;
}

export function subscribeRoom(roomId: string, listener: Listener): () => void {
  const key = roomKey(roomId);
  const set = listeners.get(key) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

export function publishRoom(roomId: string, payload: unknown) {
  const set = listeners.get(roomKey(roomId));
  if (!set) return;
  for (const l of set) {
    try {
      l(payload);
    } catch {
      // ignore
    }
  }
}
