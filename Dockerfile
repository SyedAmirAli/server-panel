# syntax=docker/dockerfile:1

FROM node:24-alpine AS build

WORKDIR /app

# Install deps first (layer cache); no --frozen-lockfile.
COPY package.json yarn.lock turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN yarn install

COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web

# Same-origin SPA: VITE_API_BASE_URL defaults to empty in the web app.
RUN yarn build

# ─── Production image ─────────────────────────────────────────────
FROM node:24-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package.json yarn.lock ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# Runtime deps + prisma CLI (migrate:deploy in entrypoint).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/web/dist ./apps/web/dist

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 4010

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["yarn", "start"]
