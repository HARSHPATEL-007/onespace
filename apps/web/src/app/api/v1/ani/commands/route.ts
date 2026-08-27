import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(req:Request){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const url=new URL(req.url);
    const q=url.searchParams.get("q") ?? "";
    const svc=new AniService(workspaceId,userId,role);
    const cmds=svc.getShell().registry.resolve(q, { module:"docs", hasSelection: true, role:"member" });
    return Response.json({ commands: cmds });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
