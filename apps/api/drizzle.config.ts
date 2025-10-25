import type { Config } from 'drizzle-kit';

export default {
	schema: './src/db/schema.ts',
	// Write migrations where Wrangler expects them:
	out: './migrations',
	dialect: 'sqlite',
	dbCredentials: {
		url: 'file:.wrangler/state/v3/d1/miniflare-D1DatabaseObject/fd4716732c8ee84dc36c391bd71e33274014a870c54ac8cb48184c30401ca22c.sqlite',
	},
} satisfies Config;
