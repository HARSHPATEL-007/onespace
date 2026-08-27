import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const svc=new AniService(workspaceId,userId,role);
    const ctx=await svc.getInteractionContext();
    const shell=svc.getShell();
    return Response.json({ context: ctx, mode: shell.mode, level: shell.level, shortcuts: (await import("@n0va/modules-ani/unified-interaction")).KEYBOARD_SHORTCUTS });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
