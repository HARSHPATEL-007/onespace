import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(req:Request){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const body=await req.json() as { gate?: any; metrics?: Record<string,number>; baseline?: Record<string,number> };
    const svc=new AniService(workspaceId,userId,role);
    if(body.gate){
      const res=await svc.evaluateReleaseGate(body.gate, body.metrics ?? {}, body.baseline ?? {});
      return Response.json(res);
    }
    return Response.json({ ok:true });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
