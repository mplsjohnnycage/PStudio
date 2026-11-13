import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Hono } from "hono";
import { mountPublicStagingUi } from "../src/public-staging-ui.ts";

test("public staging host serves only allowlisted exported assets and auth screens", async () => {
  const root = mkdtempSync(join(tmpdir(), "pstudio-static-test-"));
  try {
    mkdirSync(join(root, "auth", "sign-in"), { recursive: true });
    mkdirSync(join(root, "auth", "sign-up"), { recursive: true });
    mkdirSync(join(root, "_next", "static", "chunks"), { recursive: true });
    writeFileSync(join(root, "index.html"), "<h1>Staging dashboard</h1>");
    writeFileSync(
      join(root, "auth", "sign-up", "index.html"),
      "<h1>Sign up</h1>"
    );
    writeFileSync(
      join(root, "auth", "sign-in", "index.html"),
      "<h1>Sign in</h1>"
    );
    writeFileSync(
      join(root, "_next", "static", "chunks", "hello.js"),
      "export const ok=true;"
    );
    const app = new Hono();
    mountPublicStagingUi(app, root);

    const home = await app.request("https://staging.invalid/");
    assert.equal(home.status, 200);
    assert.ok((await home.text()).includes("Staging dashboard"));

    const login = await app.request(
      "https://staging.invalid/auth/sign-in?client_id=example"
    );
    assert.equal(login.status, 200);
    assert.ok((await login.text()).includes("Sign in"));
    assert.equal(login.headers.get("X-Frame-Options"), "DENY");
    assert.equal(login.headers.get("Cache-Control"), "no-store");

    const inviteOnly = new Hono();
    mountPublicStagingUi(inviteOnly, root, true);
    assert.equal(
      (await inviteOnly.request("https://staging.invalid/auth/sign-up")).status,
      404
    );
    assert.equal(
      (await inviteOnly.request("https://staging.invalid/auth/sign-in")).status,
      200
    );
    assert.equal(
      (await app.request("https://staging.invalid/auth/sign-up")).status,
      200
    );

    const js = await app.request(
      "https://staging.invalid/_next/static/chunks/hello.js"
    );
    assert.equal(js.status, 200);
    assert.ok(js.headers.get("Content-Type")?.includes("javascript"));
    assert.ok(js.headers.get("Cache-Control")?.includes("immutable"));

    for (const path of [
      "/.env",
      "/auth/private",
      "/_next/static/../../secret",
      "/_next/static/%252e%252e/secret",
      "/v1/workspaces",
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: security probes are intentionally sequential
      const response = await app.request(`https://staging.invalid${path}`);
      assert.equal(response.status, 404, `unexpected static access to ${path}`);
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
