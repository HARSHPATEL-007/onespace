import { VoiceService } from "@n0va/modules-voice/server";
import { VoiceDialer } from "@n0va/modules-voice/components";
import { requireWorkspace } from "@/lib/context";
import { logCallAction, clearCallsAction } from "./actions";

export default async function VoicePage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new VoiceService(workspaceId, userId, role);
  const [logs, contacts] = await Promise.all([svc.list(), svc.contacts()]);

  return <VoiceDialer logs={logs} contacts={contacts} actions={{ log: logCallAction, clear: clearCallsAction }} />;
}
