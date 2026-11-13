import { Hono } from "hono";
import type { VerifyIdentity } from "../../server/src/auth";

const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export interface SpriteActionDependencies {
  authorize: (userId: string, workspaceId: string) => Promise<boolean>;
  verify: VerifyIdentity;
  /** A fixed server-side action; caller cannot supply a Sprite name or command. */
  wake: () => Promise<void>;
}

/**
 * JWT + live Neon membership authorize the only exposed Sprite operation.
 * Never expose arbitrary exec, process names, or cluster credentials to HTTP.
 */
export function createSpriteActionRoutes(deps: SpriteActionDependencies) {
  const app = new Hono();
  app.post("/workspaces/:workspaceId/actions/wake-sprite", async (c) => {
    let userId: string | null = null;
    try {
      userId = await deps.verify(c.req.header("authorization"));
    } catch {
      userId = null;
    }
    if (!userId) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const workspaceId = c.req.param("workspaceId") ?? "";
    if (!RESOURCE_ID.test(workspaceId)) {
      return c.json({ error: "invalid_resource_id" }, 400);
    }
    try {
      if (!(await deps.authorize(userId, workspaceId))) {
        return c.json({ error: "not_found" }, 404);
      }
    } catch {
      return c.json({ error: "temporarily_unavailable" }, 503);
    }
    try {
      await deps.wake();
      return c.json({
        rivetActorVerified: false,
        sprite: "prospect-studio-foundation",
        state: "awakened",
      });
    } catch {
      return c.json({ error: "sprite_unavailable" }, 503);
    }
  });
  return app;
}

/**
 * Invoke a harmless fixed command via the official SDK. The SDK is instantiated
 * only after authorization, with its token held exclusively by the Vercel secret
 * store. Waking the machine does not prove its Rivet worker has reconnected.
 */
export async function wakeProspectStudioSprite(): Promise<void> {
  const token = process.env.SPRITES_TOKEN;
  if (!token) {
    throw new Error("Sprite SDK credential not provisioned");
  }
  const { SpritesClient } = await import("@fly/sprites");
  const client = new SpritesClient(token, { timeout: 8000 });
  const sprite = client.sprite("prospect-studio-foundation");
  const result = await sprite.exec("true");
  if (typeof result.exitCode === "number" && result.exitCode !== 0) {
    throw new Error("Sprite wake probe exited unsuccessfully");
  }
}
