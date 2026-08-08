export type RiskTier = "low" | "medium" | "high" | "critical";

export interface ConfirmationRequest {
  action: string;
  impact: string;
  riskTier: RiskTier;
  summary: string;
  options: Array<{ id: string; label: string; description: string }>;
}

export class MicroConfirmationUX {
  createConfirmation(action: string, impact: string, riskTier: RiskTier): ConfirmationRequest {
    const options = [
      { id: "approve", label: "Approve & Execute", description: "Proceed with the action as described" },
      { id: "modify", label: "Modify First", description: "Adjust parameters before executing" },
      { id: "cancel", label: "Cancel", description: "Do not proceed with this action" },
    ];

    if (riskTier === "high" || riskTier === "critical") {
      options.push({ id: "preview", label: "Preview Impact", description: "Show detailed impact analysis before deciding" });
    }

    return { action, impact, riskTier, summary: action + " (" + riskTier + " risk): " + impact, options };
  }

  requiresConfirmation(riskTier: RiskTier): boolean {
    return riskTier !== "low";
  }
}
