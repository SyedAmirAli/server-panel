# syntax=docker/dockerfile:1

# ─── Build ────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS build

# openssl: Prisma's query/migration engines link against it.
# unzip: @puppeteer/browsers shells out to it to extract the browser archive; the
#        slim image has no zip archiver at all, so the download fails on extract.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Puppeteer puts the browser here instead of $HOME, so the runtime stage can pick
# it up with one COPY. The PDF renderer needs it at run time.
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# Manifests first: this layer is only invalidated when a dependency changes.
COPY package.json yarn.lock turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# The browser download is skipped here on purpose and done in its own layer
# below: it is ~150 MB from Google's CDN and a timeout on it must not throw away
# several minutes of package fetching. The yarn cache mount makes a retry cheap.
RUN --mount=type=cache,target=/yarn-cache \
    YARN_CACHE_FOLDER=/yarn-cache PUPPETEER_SKIP_DOWNLOAD=true \
    yarn install --frozen-lockfile

# Only `chrome` — puppeteer.launch({ headless: true }) uses the full browser;
# chrome-headless-shell is for headless: "shell" and is not worth downloading.
# Retried because this is the one step that depends on a slow external CDN.
RUN for attempt in 1 2 3 4 5; do \
        echo "==> puppeteer browsers install chrome (attempt ${attempt}/5)"; \
        npx --no-install puppeteer browsers install chrome && exit 0; \
        sleep 15; \
    done; \
    echo "ERROR: could not download Chromium after 5 attempts" >&2; exit 1

COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
# The SPA imports docs/*.md with Vite's ?raw loader, so they are a build input.
COPY docs docs

# Placeholder only. `turbo build` runs `prisma generate`, which wants the
# datasource variable to resolve; nothing here ever connects, and the value is
# discarded with this stage. The real URL arrives at run time from .env.
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
# secrets, SMTP, AI gateway — arrives at run time from the repo's single .env
# (compose passes it as env_file), so nothing sensitive is baked into a layer.
# NODE_ENV lives here rather than in .env: it is a property of this image, and a
# file that can silently flip the app into production mode is a footgun.
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
