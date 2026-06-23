#!/bin/sh
set -e

cd /app
yarn migrate:deploy

exec "$@"
