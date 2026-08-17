import { PersonalizationEngine } from "@n0va/modules-chat/personalization";
import { requireWorkspace } from "@/lib/context";
import { PersonalizationDashboard } from "@/components/personalization/PersonalizationDashboard";
import { personalizationAction } from "../chat/actions";

export const dynamic = "force-dynamic";

export default async function PersonalizationPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const engine = new PersonalizationEngine(userId, workspaceId);

  const [profile, rules, workspaceDefaults, dnd, pins, suggestions, metrics, events, inbox, dndStatus] = await Promise.all([
    engine.getProfile(),
    engine.listRules(),
    engine.listWorkspaceDefaults(),
    engine.listDnd(),
    engine.listPins(),
    engine.suggestions(),
    engine.metrics(),
    engine.recentEvents(10),
    engine.priorityInbox({ limit: 15 }),
    engine.dndStatus(),
  ]);

  return (
    <PersonalizationDashboard
      role={role}
      profile={profile}
      rules={rules}
      workspaceDefaults={workspaceDefaults}
      dnd={dnd}
      dndStatus={dndStatus}
      pins={pins}
      suggestions={suggestions}
      metrics={metrics}
      events={events}
      inbox={inbox}
      action={personalizationAction}
    />
  );
}