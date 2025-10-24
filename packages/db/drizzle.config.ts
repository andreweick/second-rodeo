import type { Config } from "drizzle-kit";

export default {
  schema: "./packages/db/schema.ts",
  // Write migrations where Wrangler expects them:
  out: "./apps/api/migrations",
  dialect: "sqlite"
} satisfies Config;
