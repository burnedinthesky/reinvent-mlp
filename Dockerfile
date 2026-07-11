# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM dependencies AS build

COPY . .

# Prisma's generator reads the datasource even though generation does not open it.
RUN DATABASE_URL=file:/tmp/build.db pnpm db:generate
RUN pnpm build:multiplayer

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV ENABLE_MULTIPLAYER=true
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000
ENV DATABASE_URL=file:/app/data/workshop.db

WORKDIR /app

COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/prisma/migrations ./prisma/migrations
COPY --chown=node:node scripts/docker-migrate.mjs ./scripts/docker-migrate.mjs

RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 3000
VOLUME ["/app/data"]

CMD ["sh", "-c", "node scripts/docker-migrate.mjs && exec node .output/server/index.mjs"]
