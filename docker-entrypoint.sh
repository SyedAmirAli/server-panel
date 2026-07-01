#!/bin/sh
set -e

cd /app

prisma() {
    yarn workspace @appszone/api prisma "$@"
}

build_database_urls() {
    if [ -z "$DATABASE_URL" ]; then
        export DATABASE_URL="mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE}"
    fi
    if [ -z "$SHADOW_DATABASE_URL" ]; then
        export SHADOW_DATABASE_URL="mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE}_shadow"
    fi
}

wait_for_db() {
    echo "==> Waiting for database..."
    attempt=0
    while [ "$attempt" -lt 30 ]; do
        if prisma db execute --stdin <<'SQL' >/dev/null 2>&1
SELECT 1;
SQL
        then
            echo "==> Database is reachable."
            return 0
        fi
        attempt=$((attempt + 1))
        echo "    attempt ${attempt}/30..."
        sleep 2
    done
    echo "ERROR: database not reachable (check DATABASE_URL / MYSQL_* host, port, and credentials)" >&2
    exit 1
}

deploy_migrations() {
    migrate_attempt=0
    max_migrate_attempts=5

    while [ "$migrate_attempt" -lt "$max_migrate_attempts" ]; do
        if yarn migrate:deploy 2>/tmp/migrate.err; then
            return 0
        fi

        if grep -q "P3009" /tmp/migrate.err; then
            failed=$(sed -n 's/.*The `\([^`]*\)` migration.*/\1/p' /tmp/migrate.err | head -1)
            if [ -n "$failed" ]; then
                echo "==> Resolving failed migration (rolled back): ${failed}"
                prisma migrate resolve --rolled-back "$failed"
                migrate_attempt=$((migrate_attempt + 1))
                continue
            fi
        fi

        cat /tmp/migrate.err >&2
        return 1
    done

    cat /tmp/migrate.err >&2
    return 1
}

sync_db() {
    # migrate = prisma migrate deploy | push = prisma db push | migrate,push = both (docker default)
    sync="${DOCKER_DB_SYNC:-migrate,push}"

    wait_for_db

    if echo "$sync" | grep -q "migrate"; then
        echo "==> Running prisma migrate deploy..."
        if deploy_migrations; then
            prisma migrate status || true
        elif ! echo "$sync" | grep -q "push"; then
            exit 1
        else
            echo "==> migrate deploy failed; will run db push..."
        fi
    fi

    if echo "$sync" | grep -q "push"; then
        echo "==> Running prisma db push..."
        yarn db:push
    fi

    echo "==> Database schema sync complete."
}

build_database_urls
sync_db
exec "$@"
