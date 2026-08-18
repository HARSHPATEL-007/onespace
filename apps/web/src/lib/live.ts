import { createClient } from "redis";

export async function publishLiveEvent(
  workspaceId: string,
  payload: { type: string } & Record<string, unknown>,
) {
  try {
    const { publish } = await import("@n0va/modules-chat");
    publish(workspaceId, payload);
  } catch {
    // in-memory bus unavailable
  }
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  try {
    const client = createClient({ url: redisUrl });
    await client.connect();
    await client.publish(
      "n0va:chat:events",
      JSON.stringify({ ...payload, workspace_id: workspaceId }),
    );
    await client.quit();
  } catch {
    // Redis unavailable — in-memory pub/sub still works
  }
}
