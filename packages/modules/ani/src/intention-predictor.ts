export interface IntentionPrediction {
  id: string;
  sessionId: string;
  predictedIntent: string;
  confidence: number;
  suggestedTools: string[];
  prefetchDocs: string[];
  timestamp: string;
}

export class SessionIntentionPredictor {
  private history: Array<{
    intent: string;
    nextIntent: string;
    count: number;
  }> = [];

  recordTransition(from: string, to: string): void {
    const existing = this.history.find(
      (h) => h.intent === from && h.nextIntent === to,
    );
    if (existing) existing.count++;
    else this.history.push({ intent: from, nextIntent: to, count: 1 });
  }

  predict(currentIntent: string, sessionId: string): IntentionPrediction {
    const transitions = this.history.filter((h) => h.intent === currentIntent);
    const total = transitions.reduce((sum, h) => sum + h.count, 0);

    const sorted = transitions.sort((a, b) => b.count - a.count);
    const topPrediction = sorted[0];

    const toolMap: Record<string, string[]> = {
      research: ["rag_retrieval", "docs_search", "web_search"],
      drafting: ["doc_editor", "template_loader"],
      scheduling: ["calendar_api", "availability_checker"],
      analysis: ["sheets_query", "chart_generator"],
      execution: ["n0va1o_gateway", "task_creator"],
    };

    return {
      id: "pred_" + Date.now().toString(36),
      sessionId,
      predictedIntent: topPrediction?.nextIntent ?? "conversational",
      confidence: total > 0 ? (topPrediction?.count ?? 0) / total : 0.3,
      suggestedTools: toolMap[topPrediction?.nextIntent ?? ""] ?? [
        "rag_retrieval",
      ],
      prefetchDocs: [],
      timestamp: new Date().toISOString(),
    };
  }
}
