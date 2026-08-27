import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const svc=new AniService(workspaceId,userId,role);
    const reports=await svc.getCalibrationReports();
    const policies=svc.getAssurance().getPolicyConsole().list();
    return Response.json({ reports, policies });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
export async function POST(req:Request){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const body=await req.json() as { request:string; claims?: unknown[]; evidence?: unknown[]; impact?: string; domain?:string };
    const svc=new AniService(workspaceId,userId,role);
    const result=await svc.analyzeAssurance({ request: body.request ?? "", claims: (body.claims ?? []) as never, evidence: (body.evidence ?? []) as never, impact: (body.impact ?? "medium") as never, domain: body.domain ?? "general", model_version:"n0va-lm-v3.2.1" });
    return Response.json(result);
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
