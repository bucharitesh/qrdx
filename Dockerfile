# syntax=docker/dockerfile:1
#
# Production image for the QRdx web app (apps/docs), built as a Next.js
# standalone server. docker-compose.yml builds it together with Postgres and a
# one-shot schema sync job; see apps/docs/content/docs/self-hosting.mdx.
# Untested reference setup.
#
#   docker build -t qrdx --build-arg NEXT_PUBLIC_APP_URL=https://qr.example.com .
#   docker run --env-file .env -p 3000:3000 qrdx
#
# NEXT_PUBLIC_* values are inlined into the client bundle, so pass them as
# build args. Server secrets are only read at runtime (--env-file / compose).

ARG NODE_VERSION=20

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1
# Keep in sync with "packageManager" in package.json and turbo in devDependencies.
RUN npm install -g pnpm@10.33.0 turbo@2.8.20
WORKDIR /app

# ── 1. Prune the monorepo to the web app and the packages it needs ───────────
FROM base AS pruner
COPY . .
# @repo/rate-limit is imported by apps/docs without being listed in its
# package.json, and the qrdx build bundles packages/cli/src, so both are
# named explicitly.
RUN turbo prune docs @repo/rate-limit @qrdx/cli --docker

# ── 2. Install dependencies (re-runs only when manifests or lockfile change) ─
FROM base AS installer
COPY --from=pruner /app/out/json/ .
# Scripts are skipped because the sources aren't copied yet; the only workspace
# script (fumadocs-mdx in apps/docs) runs explicitly in the build stage.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY --from=pruner /app/out/full/ .

# ── 3. Build ─────────────────────────────────────────────────────────────────
FROM installer AS builder
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_FEATUREBASE_APP_ID
ARG NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID
ARG NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID
# Placeholders only satisfy env validation during `next build`. They stay in
# this stage and are never copied into the runtime image.
ENV NEXT_OUTPUT=standalone \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-runtime
# Build args that were passed empty are unset, so optional URL fields are
# treated as missing instead of failing validation.
RUN for name in $(env | sed -n 's/^\(NEXT_PUBLIC_[A-Z0-9_]*\)=$/\1/p'); do unset "$name"; done \
 && pnpm --filter docs exec fumadocs-mdx \
 && turbo build --filter=docs

# ── 4. Schema sync (one-shot job used by docker-compose.yml) ─────────────────
# Migration files are not committed, so the schema is applied from
# packages/database/schema.ts with `drizzle-kit push`. drizzle-kit needs a
# Postgres wire-protocol driver; the repo only ships Neon's serverless driver,
# so `pg` is installed for this image only (placed where Node resolves it).
FROM installer AS migrator
RUN npm install --prefix /opt/migrate --no-save --no-package-lock pg@8.13.1 \
 && ln -s /opt/migrate/node_modules /node_modules
WORKDIR /app/packages/database
CMD ["pnpm", "exec", "drizzle-kit", "push", "--verbose"]

# ── 5. Runtime ───────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/docs/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/docs/.next/static ./apps/docs/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/docs/public ./apps/docs/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/docs/server.js"]
