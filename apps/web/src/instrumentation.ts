export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEventBus } = await import("./lib/eventbus");
    try {
      getEventBus();
    } catch (e) {
      console.error("[instrumentation] event bus init failed", e);
    }
  }
}
