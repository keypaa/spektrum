# One-shot migration runner (spec §4): `drizzle-kit migrate` against DATABASE_URL.
#
# Kept separate from the web image because the standalone build contains no
# drizzle-kit and no `packages/db/drizzle` SQL.
# syntax=docker/dockerfile:1

FROM node:26-bookworm-slim AS deps
WORKDIR /app
RUN npm install -g pnpm@12.18.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/latex/package.json packages/latex/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

FROM node:26-bookworm-slim AS runtime
WORKDIR /app
RUN npm install -g pnpm@12.18.0
COPY --from=deps /app /app
COPY . .
CMD ["pnpm", "--filter", "@spektrum/db", "migrate"]