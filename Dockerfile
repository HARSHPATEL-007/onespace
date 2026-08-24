# N0VA Workspace — production image (single Enterprise System)
# Build once, run via docker-compose.yml `web` service

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /app

# --- deps ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/authz/package.json packages/authz/package.json
# Copy all module package.json for workspace resolution (lightweight wildcard via copy)
COPY packages/modules ./packages/modules
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile

# --- build ---
FROM deps AS builder
COPY . .
RUN pnpm --filter @n0va/db exec prisma generate
RUN pnpm build

# --- runner ---
FROM node:20-alpine AS runner
RUN apk add --no-cache wget && addgroup -S n0va && adduser -S n0va -G n0va
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/turbo.json ./turbo.json
# prisma client needs schema at runtime for migrate deploy
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/packages/db/generated ./packages/db/generated 2>/dev/null || true
EXPOSE 3000
USER n0va
CMD ["sh", "-c", "pnpm --filter @n0va/db exec prisma migrate deploy && pnpm --filter web exec next start -p 3000 -H 0.0.0.0"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=3 CMD wget -qO- http://localhost:3000/api/health || exit 1
