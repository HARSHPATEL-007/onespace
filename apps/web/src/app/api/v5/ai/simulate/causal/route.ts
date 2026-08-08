import { actionContext } from "@/lib/action-context";
import { TwinSimulationEngine } from "@n0va/modules-ani/v5-twin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { workspaceId } = await actionContext();

  let body: {
    simulation_target?: string;
    interventions?: Array<{ variable: string; delta_percentage: number }>;
    monte_carlo_runs?: number;
    confidence_interval?: number;
    output_format?: string;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.simulation_target || !body.interventions || body.interventions.length === 0) {
    return Response.json({ error: "Missing simulation_target or interventions" }, { status: 400 });
  }

  const engine = new TwinSimulationEngine();
  const result = engine.runSimulation(
    body.simulation_target,
    body.interventions.map((i) => ({ variable: i.variable, deltaPercentage: i.delta_percentage })),
    body.monte_carlo_runs ?? 100000,
    body.confidence_interval ?? 0.95,
  );

  const response: Record<string, unknown> = {
    simulation_id: result.id,
    workspace_id: workspaceId,
    target: result.target,
    runs: result.runs,
    confidence_interval: result.confidenceInterval,
    mean_outcome: result.meanOutcome.toFixed(2),
    std_deviation: result.stdDeviation.toFixed(2),
    risk_bounds: { lower: result.riskLowerBound.toFixed(2), upper: result.riskUpperBound.toFixed(2) },
    probability_positive: (result.probabilityPositive * 100).toFixed(1) + "%",
    trajectory: result.trajectoryChart,
  };

  if (body.output_format === "interactive_chart_spec") {
    response.chart_spec = engine.generateChartSpec(result);
  }

  return Response.json(response);
}
