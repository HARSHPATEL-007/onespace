import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(req:Request,{params}:{params:{id:string}}){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const body=await req.json();
    const svc=new AniService(workspaceId,userId,role);
    const dec=await svc.createTeamDecision({ title: body.title, decision: body.decision, scope: params.id, decided_at: body.decided_at ?? new Date().toISOString(), decision_owner: body.decision_owner ?? userId, participants: body.participants ?? [userId], alternatives_considered: body.alternatives_considered ?? [], rationale: body.rationale ?? [], assumptions: body.assumptions ?? [], dissent: body.dissent ?? [], revisit_conditions: body.revisit_conditions ?? [], evidence: body.evidence ?? [], confidence: body.confidence ?? 0.8, status:"proposed" });
    return Response.json({ decision: dec }, {status:201});
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
export async function GET(_req:Request,{params}:{params:{id:string}}){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const svc=new AniService(workspaceId,userId,role);
    return Response.json({ decisions: await svc.listTeamDecisions(params.id) });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
