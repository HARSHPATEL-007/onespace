import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(req:Request){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const body=await req.json() as any;
    const svc=new AniService(workspaceId,userId,role);
    await svc.createEvaluationDataset({ dataset_id: body.dataset_id ?? `golden_${Date.now().toString(36)}`, tenant_id: workspaceId, domain: body.domain ?? "general", version: body.version ?? "1.0.0", purpose: body.purpose ?? "test", cases: body.cases ?? [], languages: body.languages ?? ["en"], labels: body.labels ?? { ground_truth:"experts", privacy_review:"completed", bias_review:"completed"}, splits:{ development:0.6, validation:0.2, test:0.15, challenge:0.05}, provenance:{ created_from: body.provenance?.created_from ?? ["expert-authored"]}, access:"restricted_evaluation_team", created_at: new Date().toISOString() });
    return Response.json({ ok:true }, {status:201});
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
