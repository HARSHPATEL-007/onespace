import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(req:Request){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const { metric, estimate, unit, horizon }=await req.json() as { metric:string; estimate:number; unit:string; horizon:string };
    const svc=new AniService(workspaceId,userId,role);
    const forecast=await svc.createForecast(metric, estimate, unit, horizon);
    return Response.json({ forecast });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
