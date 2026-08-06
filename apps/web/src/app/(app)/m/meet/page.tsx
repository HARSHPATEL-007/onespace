import { MeetService } from "@n0va/modules-meet/server";
import { MeetRooms } from "@n0va/modules-meet/components";
import { requireWorkspace } from "@/lib/context";
import { createRoomAction, joinRoomAction, leaveRoomAction, endRoomAction, sendMeetMessageAction } from "./actions";

export default async function MeetPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new MeetService(workspaceId, userId, role);
  const rooms = await svc.listRooms();

  return (
    <MeetRooms
      rooms={rooms}
      actions={{
        createRoom: createRoomAction,
        join: joinRoomAction,
        leave: leaveRoomAction,
        endRoom: endRoomAction,
        send: sendMeetMessageAction,
      }}
    />
  );
}
