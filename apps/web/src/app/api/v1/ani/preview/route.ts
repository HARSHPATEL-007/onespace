import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(req:Request){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const body=await req.json() as { text:string; context?:string };
    const svc=new AniService(workspaceId,userId,role);
    const sug=svc.getShell().suggestions.create(body.text ?? "Preview", body.context ?? "docs", "high");
    return Response.json({ preview: sug, state: "previewing" });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
