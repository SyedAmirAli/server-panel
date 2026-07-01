# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS build

# Prisma engines need OpenSSL (migrate + generate).
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

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
COPY docs docs

# Same-origin SPA: VITE_API_BASE_URL defaults to empty in the web app.
RUN yarn build

# ─── Production image ─────────────────────────────────────────────
FROM node:24-bookworm-slim AS production

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Default runtime config (override at `docker run` / compose `environment:`).
# MySQL service
ENV MYSQL_USER=root \
    MYSQL_PORT=3306 \
    MYSQL_PASSWORD=12345678 \
    MYSQL_DATABASE=apz_mailserver \
    MYSQL_HOST=host.docker.internal

# Database URLs (built at container start from MYSQL_* when unset).
ENV DATABASE_URL=mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE}
ENV SHADOW_DATABASE_URL=mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE}_shadow

# App container
ENV DOCKER_DB_SYNC=migrate,push \
    NODE_ENV=production \
    API_PORT=4010 \
    API_HOST=0.0.0.0

# DATABASE_URL / SHADOW_DATABASE_URL are built at container start from MYSQL_* when unset
# (see docker-entrypoint.sh). Override with -e DATABASE_URL=... for an external database.

ENV RABBITMQ_URL=amqp://appszone:appszone_dev@localhost:5672 \
    ADMIN_PASSWORD=12345678 \
    JWT_SECRET=e1af544080f82c784f187bde42ba9f920d70283c077fd687e7a307dae68a77be \
    JWT_EXPIRES_IN=24h \
    API_KEY_PEPPER=1ae4c3568ef827f5802c2fce864b10c9c4ba9289c8eabc1a41e066cc7bc28f29 \
    ENCRYPTION_KEY=SONYqh9dWQadVfwr9mDVOTLGUb2OvvUvtuvuT445 \
    CORS_ORIGIN=http://localhost:5173 \
    WEB_DEV_SERVER_URL=http://localhost:5173

ENV SMTP_HOST=mail.appszonebd.com \
    SMTP_PORT=465 \
    SMTP_USER=sales@appszonebd.com \
    SMTP_PASSWORD=Siy@mcse@75 \
    SMTP_TLS_REJECT_UNAUTHORIZED=false \
    VITE_API_BASE_URL=

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
