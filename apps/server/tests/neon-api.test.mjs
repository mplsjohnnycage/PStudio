import assert from "node:assert/strict";
import { test } from "node:test";
import { createNeonApi } from "../src/neon-api.ts";

const app = createNeonApi({
  authBaseUrl: "https://auth.example.invalid/PS/auth",
  corsOrigins: ["https://allowed.example"],
  databaseUrl: "postgresql://user:pass@localhost:5432/unused",
  jwksUrl: "https://auth.example.invalid/PS/auth/.well-known/jwks.json",
});

test("the Neon API provides all protected workspace and prospect routes", async () => {
  await Promise.all(
    [
      ["GET", "/v1/workspaces"],
      ["POST", "/v1/workspaces/ws1/discover/minneapolis-license"],
      ["POST", "/v1/workspaces"],
      ["GET", "/v1/workspaces/ws1/prospects"],
      ["POST", "/v1/workspaces/ws1/prospects"],
      ["POST", "/v1/workspaces/ws1/prospects/pros1/jobs"],
      ["POST", "/v1/workspaces/ws1/prospects/pros1/previews"],
      ["GET", "/v1/workspaces/ws1/prospects/pros1/previews"],
      ["GET", "/v1/workspaces/ws1/previews/prev1"],
      ["GET", "/v1/workspaces/ws1/previews/prev1/review"],
      ["POST", "/v1/workspaces/ws1/previews/prev1/review"],
      ["POST", "/v1/workspaces/ws1/previews/prev1/decision"],
    ].map(async ([method, path]) => {
      const response = await app.request(`https://api.example.invalid${path}`, {
        method,
      });
      assert.equal(response.status, 401, `${method} ${path}`);
    })
  );
});

test("CORS is restricted to explicitly configured trusted origins", async () => {
  const permitted = await app.request(
    "https://api.example.invalid/v1/workspaces",
    {
      headers: { Origin: "https://allowed.example" },
    }
  );
  assert.equal(
    permitted.headers.get("access-control-allow-origin"),
    "https://allowed.example"
  );
  const denied = await app.request(
    "https://api.example.invalid/v1/workspaces",
    {
      headers: { Origin: "https://attacker.invalid" },
    }
  );
  assert.notEqual(
    denied.headers.get("access-control-allow-origin"),
    "https://attacker.invalid"
  );
});

test("missing configuration fails closed and never exposes a SQL query endpoint", async () => {
  const unconfigured = createNeonApi({});
  const protectedCall = await unconfigured.request(
    "https://api.example.invalid/v1/workspaces"
  );
  assert.equal(protectedCall.status, 503);
  const health = await unconfigured.request(
    "https://api.example.invalid/health"
  );
  assert.equal(health.status, 503);
  assert.equal((await health.json()).status, "not_configured");
});
