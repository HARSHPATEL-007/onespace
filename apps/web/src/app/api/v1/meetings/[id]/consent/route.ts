import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(req:Request,{params}:{params:{id:string}}){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const body=await req.json() as { purposes?: Record<string,string> };
    const svc=new AniService(workspaceId,userId,role);
    const { createConsent } = await import("@n0va/modules-ani/multimodal-evidence");
    const consent=createConsent(params.id, body.purposes as never);
    // store via meeting OS consent map (via evidence fabric parallel)
    svc.getMeetingOS().startRecording(params.id, { transcription: true });
    return Response.json({ consent });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
export async function GET(_req:Request,{params}:{params:{id:string}}){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const svc=new AniService(workspaceId,userId,role);
    const evs=svc.getMeetingOS().listEvents({ meeting_id: params.id });
    return Response.json({ events: evs.slice(0,5) });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
