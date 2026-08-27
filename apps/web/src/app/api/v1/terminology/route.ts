import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const svc=new AniService(workspaceId,userId,role);
    return Response.json({ terms: svc.getA11yCore().terminology.list() });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
export async function POST(req:Request){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const body=await req.json();
    const svc=new AniService(workspaceId,userId,role);
    const entry={ term_id: `term_${Date.now().toString(36)}`, canonical: body.canonical, aliases: body.aliases ?? [], language: body.language ?? "en", region: body.region ?? "IN", definition: body.definition, do_not_translate: body.do_not_translate ?? false, preferred_translation: body.preferred_translation, pronunciation: body.pronunciation, domain: body.domain ?? "general", owner: userId, status:"approved" as const };
    svc.getA11yCore().terminology.add(entry);
    return Response.json({ term: entry }, {status:201});
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
