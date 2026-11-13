import { Pool } from "pg";

let pool: Pool | undefined;

function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) {
    return null;
  }
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    // Idle disconnects must not terminate the persistent Neon Function runtime.
    pool.on("error", () => undefined);
  }
  return pool;
}

/**
 * Neon Functions staging deployment probe. Runtime injects DATABASE_URL.
 * This is explicitly not an application API or SQL execution endpoint.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/health") {
      return new Response("Not found", { status: 404 });
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }
    const db = getPool();
    if (!db) {
      return Response.json({ status: "not_configured" }, { status: 503 });
    }
    try {
      const result = await db.query<{ schema_ready: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'release_artifacts'
        ) AS schema_ready
      `);
      return Response.json(
        { schemaReady: result.rows.at(0)?.schema_ready === true, status: "ok" },
        { headers: { "Cache-Control": "no-store" } }
      );
    } catch {
      return Response.json({ status: "unavailable" }, { status: 503 });
    }
  },
};
