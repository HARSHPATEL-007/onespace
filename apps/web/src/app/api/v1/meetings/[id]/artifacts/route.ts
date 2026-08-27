import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function DELETE(req:Request,{params}:{params:{id:string}}){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const url=new URL(req.url);
    const kind=url.searchParams.get("kind") ?? "transcript";
    const svc=new AniService(workspaceId,userId,role);
    const ok=await svc.deleteMeetingArtifacts(params.id, kind);
    return Response.json({ ok });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
