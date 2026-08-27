import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(req:Request){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const body=await req.json() as any;
    const svc=new AniService(workspaceId,userId,role);
    const ks={ scope: body.scope ?? "tool", target: body.target ?? "test", state:"disabled" as const, reason: body.reason ?? "test", activated_by: userId, activated_at: new Date().toISOString(), expires_at: null, fallback: body.fallback ?? "draft_only", notification:[] };
    await svc.activateKillSwitch(ks as never);
    return Response.json({ kill_switch: ks }, {status:201});
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
export async function GET(){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const svc=new AniService(workspaceId,userId,role);
    return Response.json({ kill_switches: svc.getObservability().kills.list() });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
