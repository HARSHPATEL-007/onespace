import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(req:Request,{params}:{params:{id:string}}){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const body=await req.json();
    const svc=new AniService(workspaceId,userId,role);
    const mem=await svc.createTeamMemory({ team_id: params.id, type: body.type ?? "working_agreement", title: body.title ?? "Untitled", content: body.content ?? "", owner: body.owner ?? { user_id: userId, role:"member" }, source_evidence: body.source_evidence ?? [], visibility: body.visibility ?? params.id, retention: body.retention ?? { policy:"team_owned" }, review: body.review ?? { next_review: new Date(Date.now()+90*24*60*60*1000).toISOString(), reviewers:[userId]}, confidence: body.confidence ?? 0.8 });
    return Response.json({ memory: mem }, {status:201});
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
export async function GET(_req:Request,{params}:{params:{id:string}}){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const svc=new AniService(workspaceId,userId,role);
    return Response.json({ memories: await svc.listTeamMemory(params.id) });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
