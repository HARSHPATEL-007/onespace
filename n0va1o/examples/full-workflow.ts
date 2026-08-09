import { N0VA1OClient, createClient } from '@n0va1o/sdk';
import { listConnectors, getConnector, GoogleDriveConnector } from '@n0va1o/connectors';
import { SandboxRuntime, handlePayload } from '@n0va1o/sandbox';
import { createInterrogationRoom, assessRisk } from '@n0va1o/hitl';
import { createCompiler, createScheduler, WorkflowCall } from '@n0va1o/recipes';
import { N0VA1OGateway } from '@n0va1o/core';

async function main() {
  console.log('='.repeat(72));
  console.log('  N0VA1O INFINITE INTEGRATION GATEWAY — Full Workflow Demo');
  console.log('  Transcendent Edition v2026.07');
  console.log('='.repeat(72));
  console.log();

  // ─── 1. Initialize Client ──────────────────────────────────────────────
  console.log('[1] Initializing N0VA1O Client...');
  const client = createClient({
    apiKey: 'n0va_sk_demo_key_001',
    tenantId: 'tenant_001',
    endpoint: 'https://n0va1o.io',
    transport: 'websocket',
  });
  console.log(`    Client initialized: ${client.getConfig().endpoint}`);
  console.log();

  // ─── 2. Register Agent ─────────────────────────────────────────────────
  console.log('[2] Registering AI Agent...');
  const agent = await client.registerAgent({
    name: 'Finance Automation Agent',
    type: 'workflow_orchestrator',
    description: 'Autonomous multi-app finance workflow execution agent',
    permissions: ['storage.read', 'storage.write', 'sheets.write', 'slack.post', 'crm.read'],
    autonomyLevel: 'high',
    approvalRequiredFor: ['storage.delete', 'crm.update_deal_value'],
    sandboxEnabled: true,
    neuralMode: false,
    maxDailyActions: 50000,
    contextWindow: 128000,
    preferredModel: 'claude-3-5-sonnet',
  });
  console.log(`    Agent ID: ${agent.agentId}`);
  console.log(`    API Key: ${agent.apiKey}`);
  console.log(`    Tools Available: ${agent.toolsAvailable.length}`);
  console.log(`    Session Endpoint: ${agent.sessionEndpoint}`);
  console.log();

  // ─── 3. Create Session ──────────────────────────────────────────────────
  console.log('[3] Creating Agent Session...');
  const session = await client.createSession({
    agentId: agent.agentId,
    context: {
      userId: 'user_001',
      tenantId: 'tenant_001',
      sessionType: 'interactive',
    },
    sandboxConfig: {
      cpuQuota: 4,
      ramQuota: 8192,
      timeoutSeconds: 1200,
      networkMode: 'filtered',
    },
  });
  console.log(`    Session ID: ${session.sessionId}`);
  console.log(`    Tools Injected: ${session.toolsInjected}`);
  console.log(`    Context Tokens Used: ${session.contextTokensUsed}`);
  console.log(`    Context Tokens Remaining: ${session.contextTokensRemaining}`);
  console.log();

  // ─── 4. Discover Tools by Intent ───────────────────────────────────────
  console.log('[4] Intent-Based Tool Discovery...');
  const discovery = await client.discoverTools(
    'Find Q3 invoices in Google Drive, convert to CSV, upload to Sheets, and notify #finance on Slack',
    agent.agentId,
    5
  );
  console.log(`    Intent: ${discovery.intent}`);
  console.log(`    Confidence: ${discovery.confidence}`);
  console.log(`    Suggested Workflow: ${discovery.suggestedWorkflow}`);
  console.log(`    Context Tokens Saved: ${discovery.contextTokensSaved}`);
  console.log(`    Estimated Latency: ${discovery.totalEstimatedLatencyMs}ms`);
  console.log('    Tools:');
  for (const tool of discovery.tools) {
    console.log(`      - ${tool.name} (relevance: ${tool.relevance.toFixed(2)})`);
  }
  console.log();

  // ─── 5. Provision Sandbox ──────────────────────────────────────────────
  console.log('[5] Provisioning Ephemeral Sandbox...');
  const runtime = new SandboxRuntime();
  const env = await runtime.provision(session.sessionId, {
    cpuQuota: 4,
    ramQuota: 8192,
    timeoutSeconds: 1200,
    networkMode: 'filtered',
  });
  console.log(`    Sandbox ID: ${env.id}`);
  console.log(`    Status: ${env.status}`);
  console.log(`    CPU Quota: ${env.config.cpuQuota} vCPU`);
  console.log(`    RAM Quota: ${env.config.ramQuota}MB`);
  console.log(`    Network: ${env.config.networkMode}`);
  console.log();

  // ─── 6. Execute Code in Sandbox ────────────────────────────────────────
  console.log('[6] Executing Code in Sandbox...');
  const execResult = await runtime.execute(env.id, `
import pandas as pd
data = pd.read_csv('/workspace/outputs/invoices.csv')
print(f"Loaded {len(data)} rows")
print(data.head(10).to_string())
  `, 'python');
  console.log(`    Execution ID: ${execResult.executionId}`);
  console.log(`    Status: ${execResult.status}`);
  console.log(`    Duration: ${execResult.durationMs}ms`);
  console.log(`    Output: ${execResult.stdout?.trim()}`);
  console.log();

  // ─── 7. Large Payload Offloading ───────────────────────────────────────
  console.log('[7] Large Payload Offloading...');
  const largeCsv = 'id,amount,date\n' + Array(1000).fill(null).map((_, i) =>
    `${i + 1},${(Math.random() * 10000).toFixed(2)},2026-0${(i % 9) + 1}-15`
  ).join('\n');

  const payloadResult = await handlePayload(env.id, 'invoices.csv', largeCsv, runtime);
  console.log(`    Offloaded: ${payloadResult.offloaded}`);
  console.log(`    Message: ${payloadResult.message}`);
  if (payloadResult.pointer) {
    console.log(`    File Pointer: ${payloadResult.pointer.path}`);
    console.log(`    Summary: ${payloadResult.pointer.summary}`);
  }
  console.log();

  // ─── 8. Schema Modifiers ────────────────────────────────────────────────
  console.log('[8] Applying Schema Modifiers...');
  const connector = getConnector('google_drive');
  const tools = connector?.getTools() || [];
  const originalTool = tools[0];
  console.log(`    Original tool: ${originalTool.name}`);
  console.log(`    Original params: ${Object.keys(originalTool.parameters).join(', ')}`);

  const modifiedTool = N0VA1OGateway.applySchemaModifiers(originalTool, agent.config);
  console.log(`    Modified params: ${Object.keys(modifiedTool.parameters).join(', ')}`);
  console.log();

  // ─── 9. HITL Risk Assessment ───────────────────────────────────────────
  console.log('[9] Human-in-the-Loop Risk Assessment...');
  const riskResult = assessRisk(
    'salesforce.update_opportunity',
    { opportunityId: '006001', amount: 75000, stage: 'Closed Won' },
    agent.config.autonomyLevel
  );
  console.log(`    Risk Level: ${riskResult.level}`);
  console.log(`    Risk Score: ${riskResult.score.toFixed(2)}`);
  console.log(`    Recommended Action: ${riskResult.recommendedAction}`);
  console.log(`    Factors: ${riskResult.factors.join('; ')}`);
  console.log(`    Timeout: ${riskResult.timeoutMs / 3600000}h`);
  console.log();

  // ─── 10. Interrogation Room ─────────────────────────────────────────────
  console.log('[10] Interrogation Room Protocol...');
  const ir = createInterrogationRoom(['compliance@acme.com', 'cfo@acme.com']);
  ir.onNotification((notif) => {
    console.log(`    📬 Notification: ${notif.message}`);
  });

  const room = await ir.initiate(
    session.sessionId,
    agent.agentId,
    { tool: 'salesforce.update_opportunity', parameters: { opportunityId: '006001', amount: 75000 } },
    [
      'Detected large deal closure requiring CFO approval',
      'Opportunity value ($75K) exceeds $5K threshold',
      'Compliance policy requires dual-approval for deals >$50K',
    ],
    ['Opportunity: 006001', 'Account: Acme Enterprise', 'Contact: john@acme.com'],
    agent.config.autonomyLevel
  );
  console.log(`    Room ID: ${room.requestId}`);
  console.log(`    Status: ${room.status}`);
  console.log(`    Reviewers: ${room.humanReviewers.join(', ')}`);

  const resolved = await ir.resolve(room.requestId, 'approved', 'cfo@acme.com');
  console.log(`    Resolution: ${resolved.resolution}`);
  console.log(`    Digital Signature: ${resolved.digitalSignature}`);
  console.log();

  // ─── 11. Recipe Compilation ─────────────────────────────────────────────
  console.log('[11] Recipe Compilation...');
  const compiler = createCompiler();
  const capture = compiler.getCapture();
  capture.startCapture(session.sessionId, agent.agentId);

  // Simulate workflow execution
  const simulatedCalls: WorkflowCall[] = [
    { stepNumber: 1, tool: 'google_drive.search_files', parameters: { query: 'name contains "invoice"' }, status: 'success', durationMs: 450, timestamp: new Date().toISOString() },
    { stepNumber: 2, tool: 'google_drive.read_file', parameters: { fileId: 'file_001' }, status: 'success', durationMs: 300, timestamp: new Date().toISOString() },
    { stepNumber: 3, tool: 'csv_converter.convert', parameters: { sourceFormat: 'pdf', targetFormat: 'csv' }, status: 'success', durationMs: 2000, timestamp: new Date().toISOString() },
    { stepNumber: 4, tool: 'slack.post_message', parameters: { channel: '#finance', text: 'Q3 invoices imported' }, status: 'success', durationMs: 300, timestamp: new Date().toISOString() },
  ];

  for (const call of simulatedCalls) {
    capture.recordCall(session.sessionId, call);
  }
  capture.endCapture(session.sessionId, agent.agentId);

  const recipe = compiler.compileFromSession(
    session.sessionId,
    'Q3_Invoice_Sync',
    'Auto-sync Q3 invoices from Google Drive to Sheets and notify Slack',
    { type: 'cron', expression: '0 9 1 * *', timezone: 'America/New_York' }
  );

  console.log(`    Recipe ID: ${recipe.recipeId}`);
  console.log(`    Name: ${recipe.name}`);
  console.log(`    Steps: ${recipe.steps.length}`);
  console.log(`    Estimated Latency: ${recipe.estimatedLatencyMs}ms`);
  console.log(`    Requires Approval: ${recipe.requiresApproval}`);
  console.log(`    Risk Score: ${recipe.riskScore.toFixed(2)}`);
  console.log(`    Generated Code:\n${recipe.generatedCode.split('\n').slice(0, 8).join('\n')}...`);
  console.log();

  // ─── 12. Execute Recipe ─────────────────────────────────────────────────
  console.log('[12] Executing Compiled Recipe...');
  const recipeResult = await compiler.executeRecipe(recipe.recipeId);
  console.log(`    Status: ${recipeResult.status}`);
  console.log(`    Steps Completed: ${recipeResult.results.length}`);
  console.log(`    Total Latency: ${recipeResult.totalLatencyMs}ms`);
  console.log();

  // ─── 13. Audit Log ──────────────────────────────────────────────────────
  console.log('[13] Audit Trail...');
  N0VA1OGateway.logAction({
    tenantId: 'tenant_001',
    agentId: agent.agentId,
    agentName: agent.config.name,
    agentVersion: '1.0.0',
    toolName: 'recipe.execute',
    toolParameters: { recipeId: recipe.recipeId },
    sessionId: session.sessionId,
    stepNumber: 1,
    intentClassification: 'automated_workflow',
    confidence: 0.98,
    reasoningChain: ['Recipe execution initiated', 'All steps completed successfully'],
    status: 'success',
    resultSummary: `Recipe ${recipe.recipeId} executed successfully`,
    latencyMs: recipeResult.totalLatencyMs,
    tokensConsumed: 0,
    approvalRequired: false,
    ipAddress: '10.0.0.1',
    userAgent: 'N0VA1O-Agent/1.0.0',
    mfaVerified: true,
    riskScore: 0.12,
  });

  const auditLog = client.getAuditLog({ agentId: agent.agentId });
  console.log(`    Total Audit Entries: ${auditLog.length}`);
  for (const entry of auditLog) {
    console.log(`      [${entry.timestamp}] ${entry.toolName} — ${entry.status} (${entry.latencyMs}ms)`);
  }
  console.log();

  // ─── 14. Webhook Events ─────────────────────────────────────────────────
  console.log('[14] Webhook Events...');
  client.onWebhookEvent('n0va1o.recipe_executed', (event) => {
    console.log(`    🔔 Webhook: ${event.eventType} — Recipe ${event.payload.recipeId} executed`);
  });
  await client.emitWebhook('n0va1o.recipe_executed', {
    recipeId: recipe.recipeId,
    status: 'success',
    latencyMs: recipeResult.totalLatencyMs,
  });
  console.log();

  // ─── 15. Connector Catalog ──────────────────────────────────────────────
  console.log('[15] Available Connectors...');
  const connectors = listConnectors();
  for (const c of connectors) {
    console.log(`    📦 ${c.getDisplayName()} (${c.getProvider()}) — ${c.getTools().length} tools`);
  }
  console.log();

  // ─── Summary ────────────────────────────────────────────────────────────
  console.log('='.repeat(72));
  console.log('  WORKFLOW COMPLETE');
  console.log('='.repeat(72));
  console.log(`
  Agent: ${agent.config.name} (${agent.agentId})
  Session: ${session.sessionId}
  Tools Discovered: ${discovery.tools.length}
  Sandbox: ${env.id} (${env.status})
  HITL Requests: ${ir.listActive().length} active
  Recipes Compiled: ${compiler.listRecipes().length}
  Audit Entries: ${auditLog.length}
  Connectors: ${connectors.length} platforms
  `);
}

main().catch(console.error);
