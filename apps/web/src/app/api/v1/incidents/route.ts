import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(req:Request){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const body=await req.json() as any;
    const svc=new AniService(workspaceId,userId,role);
    const inc=await svc.createIncident({ severity: body.severity ?? "sev1", category: body.category ?? "unauthorized_side_effect", detected_by:"policy_monitor", trace_ids: body.trace_ids ?? [], affected_scope:{ tenants:[workspaceId], users:1, workflows:[]}, commander: userId, data_exposure:false, business_impact:"under_assessment"});
    return Response.json({ incident: inc }, {status:201});
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
export async function GET(){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const svc=new AniService(workspaceId,userId,role);
    return Response.json({ incidents: svc.getObservability().incidents.list() });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
