import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(req:Request,{params}:{params:{id:string}}){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const body=await req.json().catch(()=>({})) as { transcription?: boolean };
    const svc=new AniService(workspaceId,userId,role);
    const res=svc.getMeetingOS().startRecording(params.id, { transcription: body.transcription ?? true });
    return Response.json({ started: res.notified, active: res.active });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
