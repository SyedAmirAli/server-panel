# syntax=docker/dockerfile:1

# ─── Build ────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS build

# Prisma's query/migration engines link against OpenSSL.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Puppeteer downloads its pinned Chromium here instead of $HOME, so the runtime
# stage can pick it up with one COPY. The PDF renderer needs it at run time.
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# Manifests first: this layer is only invalidated when a dependency changes.
COPY package.json yarn.lock turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN yarn install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
# The SPA imports docs/*.md with Vite's ?raw loader, so they are a build input.
COPY docs docs

# Placeholder only. `turbo build` runs `prisma generate`, which wants the
# datasource variable to resolve; nothing here ever connects, and the value is
# discarded with this stage. The real URL arrives at run time from the env files.
ENV DATABASE_URL=postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder?schema=public

# Same-origin SPA: VITE_API_BASE_URL defaults to empty in the web app.
RUN yarn build

# ─── Production image ─────────────────────────────────────────────
FROM node:24-bookworm-slim AS production

# openssl for Prisma; the rest are the shared libraries Chromium needs to start
# (the AI Studio resume renderer prints through headless Chromium).
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends \
        openssl \
        ca-certificates \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libatspi2.0-0 \
        libcairo2 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libexpat1 \
        libgbm1 \
        libglib2.0-0 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libpango-1.0-0 \
        libx11-6 \
        libxcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxkbcommon0 \
        libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Image-level facts only. Every piece of application configuration — database,
# secrets, SMTP, AI gateway — comes from the env files wired up in
# docker-compose.yml, so that nothing sensitive is ever baked into a layer.
ENV NODE_ENV=production \
    PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# node_modules is copied wholesale rather than reinstalled with --production:
# the Prisma CLI lives in devDependencies and is what `yarn migrate:deploy`
# needs inside the container now that schema sync is a deliberate, manual step.
COPY --from=build --chown=node:node /app/package.json /app/yarn.lock ./
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/shared ./packages/shared
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=node:node /app/.cache/puppeteer ./.cache/puppeteer

USER node

EXPOSE 4010

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4010)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# No entrypoint script: the container starts the server and nothing else.
# Migrations are run on purpose (`yarn docker:db:migrate`), not on every boot.
CMD ["node", "apps/api/dist/main.js"]
