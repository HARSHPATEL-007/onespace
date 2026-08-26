import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalRiskEngine } from "@n0va/modules-ani/risk-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  let body: { actionType?: string; dataClassification?: string; financialUsd?: number; affectedRecords?: number; externalRecipients?: number; privilegeChange?: boolean; reversibility?: string; legalImpact?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const assessment = globalRiskEngine.calculate({
    actionType: body.actionType ?? "generic",
    dataClassification: (body.dataClassification as "public" | "internal" | "confidential" | "restricted") ?? "internal",
    financialUsd: body.financialUsd,
    affectedRecords: body.affectedRecords,
    externalRecipients: body.externalRecipients,
    privilegeChange: body.privilegeChange,
    reversibility: body.reversibility as "full" | "partial" | "irreversible" | undefined,
    legalImpact: body.legalImpact as "none" | "low" | "medium" | "high" | undefined,
  });
  return Response.json(assessment);
}
