import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(req:Request){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const body=await req.json() as { prompt:string; context?:any; surface?:string };
    const svc=new AniService(workspaceId,userId,role);
    // create interaction in previewing state
    const inter=await svc.createInteraction({ surface: (body.surface ?? "side_panel") as never, capability: "ask", context: body.context ?? { module:"docs" }, reason: body.prompt, confidence:"high", risk:"low" });
    return Response.json({ interaction: inter });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
