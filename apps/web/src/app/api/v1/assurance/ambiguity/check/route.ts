import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(req:Request){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const { text, impact }=await req.json() as { text:string; impact?:string };
    const svc=new AniService(workspaceId,userId,role);
    const ambiguity=await svc.checkAmbiguity(text, impact);
    return Response.json({ ambiguity });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
