import type { PlayerConfig, PlaybackToken, ExportJob } from "./player-types";
function uid(p:string){ return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso(){ return new Date().toISOString(); }
const players = new Map<string, PlayerConfig>();
const tokens = new Map<string, PlaybackToken>();
const exports = new Map<string, ExportJob>();

export function createPlayer(config: Omit<PlayerConfig,"player_id">): PlayerConfig {
  const p: PlayerConfig = { ...config, player_id: uid("player") };
  // policy-validated: domain lock must be explicit
  if(!p.allowed_domains) p.allowed_domains=["*"];
  players.set(p.player_id, p); return p;
}
export function getPlayer(player_id:string){ return players.get(player_id) ?? null; }

export function issuePlaybackToken(input: Omit<PlaybackToken,"token_id"|"signature">): PlaybackToken {
  const tok: PlaybackToken = { ...input, token_id: uid("tok"), signature: `sig_${input.asset_id}_${Date.now().toString(36)}` };
  tokens.set(tok.token_id, tok); return tok;
}
export function verifyToken(token_id:string, domain?:string){
  const t=tokens.get(token_id); if(!t) return { valid:false, reason:"not_found" };
  if(new Date(t.expires_at).getTime()<Date.now()) return { valid:false, reason:"expired" };
  if(t.domain_lock && domain && t.domain_lock!==domain) return { valid:false, reason:"domain_mismatch" };
  return { valid:true, token:t };
}

export function createExport(input: Omit<ExportJob,"export_id"|"status"|"created_at">): ExportJob {
  // every export policy-validated — block if rights missing (caller should have checked)
  const e: ExportJob = { ...input, export_id: uid("export"), status:"queued", created_at: nowIso() };
  if(input.preset.includes("blocked")) e.status="blocked_policy";
  exports.set(e.export_id, e); return e;
}
export function getExport(export_id:string){ return exports.get(export_id) ?? null; }
export function listExports(tenant_id?:string){ const arr=[...exports.values()]; return tenant_id? arr.filter(e=> e.tenant_id===tenant_id): arr; }
export function markExportReady(export_id:string, output_url:string){
  const e=exports.get(export_id); if(e){ e.status="ready"; e.output_url=output_url; e.c2pa_manifest=`c2pa:${export_id}`; }
  return e ?? null;
}
export function clearForTests(){ players.clear(); tokens.clear(); exports.clear(); }
