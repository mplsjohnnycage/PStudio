import { drizzle } from "drizzle-orm/node-postgres";
import type { DatabaseConfig } from "./config";

export function createDb(env: DatabaseConfig) {
  return drizzle(env.DATABASE_URL);
}

export type Database = ReturnType<typeof createDb>;
