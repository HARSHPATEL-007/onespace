import { notFound } from "next/navigation";
import { VideosService } from "@n0va/modules-videos/server";
import { VideoDetail } from "@n0va/modules-videos/components";
import { requireWorkspace } from "@/lib/context";

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new VideosService(workspaceId, userId, role);

  let video;
  try {
    video = await svc.get(id);
  } catch {
    notFound();
  }

  return <VideoDetail video={video} />;
}
