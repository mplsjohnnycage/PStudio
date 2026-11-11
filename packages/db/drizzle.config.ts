import { defineConfig } from "drizzle-kit";
import "varlock/auto-load";

export default defineConfig({
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
  dialect: "postgresql",
  out: "./src/migrations",
  schema: "./src/schema/index.ts",
  schemaFilter: ["public"],
});
