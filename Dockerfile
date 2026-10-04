# syntax=docker/dockerfile:1

# Multi-stage build producing a self-contained Next.js standalone server image,
# suitable for Azure Container Apps. Requires next.config `output: "standalone"`.
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

# ── deps: install with the frozen lockfile ────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ── build: compile the Next.js app ────────────────────────────────────────
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ── runner: minimal runtime image ─────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs

# public/ (incl. mabni-logo.png read by the PDF generator) + the standalone
# server bundle + static assets. Standalone does NOT include public/ or static/.
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

# deploy/docker-compose.yml mounts the `storage` volume here (STORAGE_BACKEND=
# local). Docker seeds an empty named volume from the image path, ownership
# included — without this the mount point is created root-owned and the server,
# running as nextjs, cannot write a single generated PDF (EACCES).
RUN mkdir -p /app/storage && chown nextjs:nodejs /app/storage

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
