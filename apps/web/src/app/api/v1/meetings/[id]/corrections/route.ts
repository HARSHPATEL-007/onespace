import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(req:Request,{params}:{params:{id:string}}){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const { original, corrected, reason }=await req.json() as { original:string; corrected:string; reason?:string };
    const svc=new AniService(workspaceId,userId,role);
    const rec=await svc.correctMeeting(params.id, original, corrected, reason);
    return Response.json({ correction: rec }, {status:201});
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
