import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(req:Request,{params}:{params:{id:string}}){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const url=new URL(req.url);
    const types=url.searchParams.getAll("type") as never || undefined;
    const min = url.searchParams.get("min_confidence") ? parseFloat(url.searchParams.get("min_confidence")!) : undefined;
    const svc=new AniService(workspaceId,userId,role);
    const events=await svc.listMeetingEvents(params.id, { types: types as never, min_confidence: min });
    return Response.json({ events });
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
export async function POST(req:Request,{params}:{params:{id:string}}){
  try{
    const {workspaceId,userId,role}=await actionContext();
    const body=await req.json();
    const svc=new AniService(workspaceId,userId,role);
    const ev=await svc.createMeetingEvent({ meeting_id: params.id, type: body.type ?? "action", time: body.time ?? {start_ms:0,end_ms:0}, title: body.title ?? "Event", content: body.content ?? {summary: body.summary ?? "", speaker_ids:[]}, status: body.status ?? "proposed_for_confirmation", confidence: body.confidence ?? 0.85, evidence: body.evidence ?? [], permissions: body.permissions ?? {visibility:"attendees", classification:"internal"} });
    return Response.json({ event: ev }, {status:201});
  }catch(e){ if(e instanceof UnauthorizedError) return Response.json({error:"Unauthorized"},{status:401}); return Response.json({error:e instanceof Error?e.message:"Failed"},{status:500});}
}
