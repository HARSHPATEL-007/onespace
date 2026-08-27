import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const svc=new AniService(workspaceId,userId,role);
    const core=svc.getA11yCore();
    return Response.json({ visual: core.visual, locale: core.localeResolver.get(), conformance: core.conformance.latest() });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
export async function PATCH(req:Request){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const body=await req.json();
    const svc=new AniService(workspaceId,userId,role);
    const core=svc.getA11yCore();
    if(body.visual) Object.assign(core.visual, body.visual);
    if(body.locale) core.localeResolver.set(body.locale);
    return Response.json({ ok:true });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
