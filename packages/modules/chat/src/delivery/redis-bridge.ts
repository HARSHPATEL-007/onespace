/**
 * Optional emitter→Redis bridge so Server-Action messages reach WS-gateway
 * clients (which consume Redis `n0va:chat:events`). Redis is optional:
 * without REDIS_URL the in-process emitter alone still works for SSE.
 */
let clientPromise: Promise<unknown | null> | null = null;

export function chatRedis(): Promise<unknown | null> {
  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        const url = process.env.REDIS_URL;
        if (!url) return null;
        const redis = await import("redis");
        const c = redis.createClient({ url });
        await c.connect();
        return c;
      } catch {
        return null;
      }
    })();
  }
  return clientPromise;
}

export async function publishToRedis(channel: string, payload: unknown): Promise<void> {
  try {
    const client = await chatRedis();
    if (!client) return;
    await (client as { publish(ch: string, msg: string): Promise<number> }).publish(channel, JSON.stringify(payload));
  } catch {
    // best-effort
  }
}