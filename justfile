set fallback

# Start the API worker only (dev server on port 8787, no static blog assets)
api:
    pnpm --filter api dev

# Start the web app only (separate dev server)
web:
    pnpm --filter apps-web dev

# Start the paper blog only (Astro dev server with hot reload)
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

# Reset production database (drop all tables and re-apply migrations)
reset-db-prod:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "⚠️  WARNING: This will DROP ALL TABLES in the production database!"
    read -p "Are you sure? Type 'yes' to continue: " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Aborted."
        exit 1
    fi
    echo "Fetching list of tables..."
    tables=$(pnpm --filter api exec wrangler d1 execute DB --remote --json --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations';" | jq -r '.[0].results[] | .name')
    if [ -z "$tables" ]; then
        echo "No tables to drop."
    else
        echo "Dropping tables: $tables"
        for table in $tables; do
            echo "Dropping $table..."
            pnpm --filter api exec wrangler d1 execute DB --remote --command "DROP TABLE IF EXISTS \`$table\`;"
        done
    fi
    echo "Re-applying migrations..."
    pnpm --filter api exec wrangler d1 migrations apply DB --remote
    echo "✅ Database reset complete!"

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

# Run API and paper in parallel (separate dev servers for fast iteration)
dev-all:
    pnpm --parallel --filter api --filter astro-paper dev

# Build the paper blog to static files (outputs to apps/paper/dist/)
build-paper:
    pnpm --filter astro-paper run build

# Build the entire app (paper + API) for local testing or deployment
build: build-paper

# Run full app locally via wrangler (builds paper, serves via ASSETS binding like production)
dev-local: build-paper
    pnpm --filter api dev

# Deploy API with blog assets to Cloudflare Workers
deploy-api: build-paper
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

# Clean up local development state (R2, D1, KV, Durable Objects)
cleanup-dev:
    rm -rf apps/api/.wrangler/state
