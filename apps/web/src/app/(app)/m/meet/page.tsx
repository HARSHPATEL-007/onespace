import { MeetService } from "@n0va/modules-meet/server";
import { MeetRooms } from "@n0va/modules-meet/components";
import { requireWorkspace } from "@/lib/context";
import {
  createRoomAction,
  joinRoomAction,
  leaveRoomAction,
  endRoomAction,
  sendMeetMessageAction,
  getMeetTranscriptAction,
} from "./actions";

export default async function MeetPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new MeetService(workspaceId, userId, role);
  const [rooms, endedRooms] = await Promise.all([svc.listRooms(), svc.listEndedRooms()]);

  return (
    <MeetRooms
      rooms={rooms}
      endedRooms={endedRooms}
      actions={{
        createRoom: createRoomAction,
        join: joinRoomAction,
        leave: leaveRoomAction,
        endRoom: endRoomAction,
        send: sendMeetMessageAction,
        getTranscript: getMeetTranscriptAction,
      }}
    />
  );
}
