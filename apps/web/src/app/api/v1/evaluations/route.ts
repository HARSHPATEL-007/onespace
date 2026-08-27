import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(req:Request){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const body=await req.json() as { contract?: any; dataset_id?: string; model_version?: string; prompt_version?: string };
    const svc=new AniService(workspaceId,userId,role);
    if(body.contract) await svc.createEvaluationContract(body.contract);
    if(body.dataset_id) {
      const run=await svc.runEvaluation(body.dataset_id, body.model_version ?? "v1", body.prompt_version ?? "v1");
      return Response.json({ run }, {status:201});
    }
    return Response.json({ ok:true });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
export async function GET(){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const svc=new AniService(workspaceId,userId,role);
    const platform=svc.getEvaluation();
    return Response.json({ datasets: platform.registry.listDatasets(), metrics: platform.registry.listMetrics(), contracts: [...platform.registry.contracts.values()] });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
