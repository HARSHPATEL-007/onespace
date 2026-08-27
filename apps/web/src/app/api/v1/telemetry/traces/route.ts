import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(req:Request){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const body=await req.json() as any;
    const svc=new AniService(workspaceId,userId,role);
    const trace={ trace_id: body.trace_id ?? `tr_${Date.now().toString(36)}`, request_id: body.request_id ?? `req_${Date.now().toString(36)}`, tenant_id: workspaceId, workspace_id: workspaceId, user_id: userId, session_id: body.session_id ?? "sess_1", capability: body.capability ?? "test", risk_tier: body.risk_tier ?? "medium", started_at: body.started_at ?? new Date().toISOString(), versions: body.versions ?? {}, operations:[], outcome:{ answer_delivered:false, action_attempted:false, action_completed:false, state_verified:false}, privacy:{ content_capture:"redacted", retention_class:"operational_trace_30d", training_use:false}};
    await svc.ingestTrace(trace as never);
    return Response.json({ trace }, {status:201});
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
export async function GET(){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const svc=new AniService(workspaceId,userId,role);
    return Response.json({ traces: [...svc.getObservability().traces.values()] });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
