import { actionContext } from "@/lib/action-context";
import { CompileEngine } from "@n0va/modules-ani/v5-compile";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { workspaceId } = await actionContext();

  let body: {
    natural_language_spec?: string;
    target_architecture?: string;
    optimization_level?: string;
    generate_verification_proof?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.natural_language_spec) {
    return Response.json({ error: "Missing natural_language_spec" }, { status: 400 });
  }

  const engine = new CompileEngine();
  const result = engine.compileWorkflow(
    body.natural_language_spec,
    body.target_architecture ?? "wasm32-wasi",
    body.optimization_level ?? "O3",
  );

  return Response.json({
    workflow_id: result.id,
    workspace_id: workspaceId,
    generated_code: result.generatedCode,
    target_architecture: result.targetArchitecture,
    optimization_level: result.optimizationLevel,
    verification_proof: body.generate_verification_proof ? result.verificationProof : undefined,
    compiled_at: result.compiledAt,
  });
}
