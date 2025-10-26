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
