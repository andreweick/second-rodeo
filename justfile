# Start the API worker
api:
    pnpm --filter api dev

# Start the web app
web:
    pnpm --filter apps-web dev

# Start the paper blog
paper:
    pnpm --filter astro-paper dev

# Generate a migration from schema changes
migrate:
    pnpm --filter api exec drizzle-kit generate

# Apply migrations to local database
migrate-local:
    pnpm --filter api exec wrangler d1 migrations apply DB --local

# Apply migrations to production
migrate-prod:
    pnpm --filter api exec wrangler d1 migrations apply DB --remote

# Open sqlite3 console to local DB
db:
    sqlite3 apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite

# Update Cloudflare Worker types
types:
    pnpm --filter api run cf-typegen

# Run API tests
test:
    pnpm --filter api test --run

# Run API tests in watch mode
test-watch:
    pnpm --filter api test --watch

# Check TypeScript types in API
ts-check:
    cd apps/api && npx tsc --noEmit && npx tsc --noEmit -p test/tsconfig.json

# Run all apps in parallel
dev-all:
    pnpm --parallel --filter api --filter apps-web --filter astro-paper dev

deploy-api:
    pnpm --filter api run deploy

# Sync AUTH_TOKEN from .dev.vars to production
sync-auth-token:
    #!/usr/bin/env bash
    set -euo pipefail
    AUTH_TOKEN=$(grep 'AUTH_TOKEN=' apps/api/.dev.vars | cut -d= -f2- | tr -d ' \n')
    echo "Setting production AUTH_TOKEN to: $AUTH_TOKEN"
    echo "$AUTH_TOKEN" | pnpm --filter api exec wrangler secret put AUTH_TOKEN

# Test image upload against local dev server
curl-image IMAGE_PATH:
    #!/usr/bin/env bash
    set -euo pipefail
    AUTH_TOKEN=$(grep 'AUTH_TOKEN=' apps/api/.dev.vars | cut -d= -f2- | tr -d ' \n')
    curl -X POST http://localhost:8787/images \
      -H "Authorization: Bearer $AUTH_TOKEN" \
      -F "file=@{{IMAGE_PATH}}"

# Test image upload against production
curl-image-prod IMAGE_PATH:
    #!/usr/bin/env bash
    set -euo pipefail
    AUTH_TOKEN=$(grep 'AUTH_TOKEN=' apps/api/.dev.vars | cut -d= -f2- | tr -d ' \n')
    curl -X POST https://api.missionfocus.workers.dev/images \
      -H "Authorization: Bearer $AUTH_TOKEN" \
      -F "file=@{{IMAGE_PATH}}"
