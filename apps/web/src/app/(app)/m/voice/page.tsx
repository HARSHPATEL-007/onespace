import { VoiceService, VoiceNotesService } from "@n0va/modules-voice/server";
import { VoiceDialer } from "@n0va/modules-voice/components";
import { requireWorkspace } from "@/lib/context";
import { logCallAction, clearCallsAction, toggleFavoriteAction, setCallNoteAction } from "./actions";
import { VoiceNotesClient, type VoiceRecording } from "./VoiceNotesClient";

export default async function VoicePage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new VoiceService(workspaceId, userId, role);
  const notes = new VoiceNotesService(workspaceId, userId, role);
  const [logs, contacts, voiceNotes] = await Promise.all([svc.list(), svc.contacts(), notes.list(50)]);

  return (
    <>
      <VoiceDialer logs={logs} contacts={contacts} actions={{ log: logCallAction, clear: clearCallsAction, toggleFavorite: toggleFavoriteAction, setNote: setCallNoteAction }} />
      <VoiceNotesClient initial={voiceNotes as unknown as VoiceRecording[]} />
    </>
  );
}