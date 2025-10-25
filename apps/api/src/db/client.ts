import { drizzle } from "drizzle-orm/d1";
export * as schema from "./schema";
export const connectD1 = (db: D1Database) => drizzle(db);
