import { notFound } from "next/navigation";
import { MeetService } from "@n0va/modules-meet/server";
import { MeetRoomView } from "@n0va/modules-meet/components";
import { requireWorkspace } from "@/lib/context";
import { joinRoomAction, leaveRoomAction, endRoomAction, sendMeetMessageAction } from "../actions";

export default async function MeetRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new MeetService(workspaceId, userId, role);

  let room;
  try {
    room = await svc.getRoom(id);
  } catch {
    notFound();
  }

  return (
    <MeetRoomView
      room={room}
      initialParticipants={room.participants}
      initialMessages={room.messages}
      userId={userId}
      actions={{
        join: joinRoomAction,
        leave: leaveRoomAction,
        endRoom: endRoomAction,
        send: sendMeetMessageAction,
      }}
    />
  );
}
