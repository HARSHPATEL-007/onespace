/**
 * N0VA1O for CHAT — unified connector gateway control plane
 *
 * Build order (per spec):
 * 1. OAuth and token vaulting (oauth.ts + gateway resolveConnection)
 * 2. Canonical schema transforms (transform-chat.ts)
 * 3. Rate-limit normalization (rate-limit.ts)
 * 4. Connector catalog and health dashboard (catalog-chat.ts, health-dashboard.ts)
 * 5. Inbound bridges (patterns.ts inbound)
 * 6. Outbound bridges (patterns.ts outbound)
 * 7. Bidirectional sync and command relay (patterns.ts)
 * 8. Marketplace and self-serve connector tooling (dx.ts)
 */

export * from "./bridge";
export * from "./oauth";
export * from "./transform-chat";
export * from "./rate-limit";
export * from "./catalog-chat";
export * from "./patterns";
export * from "./governance";
export * from "./dx";
export * from "./gateway-model";
export * from "./health-dashboard";
