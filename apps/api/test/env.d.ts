import type { Env } from '../src/types/env';

declare module 'cloudflare:test' {
	interface ProvidedEnv extends Env {}
}

// Type declarations for Vite ?raw imports
// This allows importing files as raw strings using the ?raw suffix
declare module '*?raw' {
	const content: string;
	export default content;
}

// More specific declarations for common file types with ?raw
declare module '*.sql?raw' {
	const content: string;
	export default content;
}

declare module '*.jsonl?raw' {
	const content: string;
	export default content;
}
