import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(req:Request){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const body=await req.json() as any;
    const svc=new AniService(workspaceId,userId,role);
    const trace={ trace_id: body.trace_id ?? `trace_${Date.now().toString(36)}`, tenant_id: workspaceId, user_id: userId, session_id: body.session_id ?? "sess_1", capability: body.capability ?? "research", model_version: body.model_version ?? "n0va-lm-v3.2.1", prompt_version: body.prompt_version ?? "v1", policy_version: body.policy_version ?? "v1", retrieval: body.retrieval ?? { index_version:"idx", query:"", source_ids:[], reranker_version:"v1"}, tools: body.tools ?? [], output: body.output ?? { claim_ids:[], citation_ids:[], abstention:false}, metrics: body.metrics ?? { latency_ms:100, input_tokens:10, output_tokens:10, cost_usd:0.001}, privacy: body.privacy ?? { content_retention:"30_days", redaction_applied:true, training_use:false}, created_at:new Date().toISOString() };
    svc.getEvaluation().traces.add(trace as never);
    return Response.json({ trace }, {status:201});
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
export async function GET(){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const svc=new AniService(workspaceId,userId,role);
    return Response.json({ traces: svc.getEvaluation().traces.list() });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
