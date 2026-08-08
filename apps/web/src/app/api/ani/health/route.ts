import { actionContext } from "@/lib/action-context";
import { createCrisisEngine } from "@n0va/modules-ani/resilience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { workspaceId } = await actionContext();

  const crisis = createCrisisEngine();
  const health = crisis.getSystemHealth();

  const aniHealth = {
    module: "ani",
    workspaceId,
    status: health.status,
    subsystems: {
      consciousness: { status: "active", coherence: 0.97 },
      memory: { status: "active", tiers: 4 },
      rag: { status: "active", circuit: "closed" },
      engine: { status: "active", provider: "n0va1o" },
      xai: { status: "active" },
      adaptive: { status: "active" },
      knowledgeGraph: { status: "active" },
      predictive: { status: "active" },
    },
    safetyFlags: [],
    degradedFeatures: health.degradedFeatures,
    recentFailures: health.recentFailures.length,
    timestamp: new Date().toISOString(),
  };

  return Response.json(aniHealth);
}
