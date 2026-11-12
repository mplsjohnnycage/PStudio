import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorkspacesRoutes } from "../src/workspaces-api.ts";

const auth = {
  Authorization: "Bearer signed",
  "Content-Type": "application/json",
};

test("workspace listing requires signed identity", async () => {
  let called = false;
  const app = createWorkspacesRoutes({
    create: () => Promise.resolve({ id: "ws1", kind: "created" }),
    list: () => {
      called = true;
      return Promise.resolve([]);
    },
    verify: () => Promise.resolve(null),
  });
  assert.equal((await app.request("http://localhost/workspaces")).status, 401);
  assert.equal(called, false);
});
test("workspace listing reflects signed subject not header-derived user", async () => {
  const seen = [];
  const app = createWorkspacesRoutes({
    create: () => Promise.resolve({ id: "ws1", kind: "created" }),
    list: (user) => {
      seen.push(user);
      return Promise.resolve([{ id: "ws1", name: "Pilot", role: "owner" }]);
    },
    verify: () => Promise.resolve("signed-user"),
  });
  const r = await app.request("http://localhost/workspaces", {
    headers: { ...auth, "x-user-id": "forged-admin" },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {
    workspaces: [{ id: "ws1", name: "Pilot", role: "owner" }],
  });
  assert.deepEqual(seen, ["signed-user"]);
});
test("workspace creation uses verified identity and permits no role/id injection", async () => {
  const seen = [];
  const app = createWorkspacesRoutes({
    create: (uid, name) => {
      seen.push([uid, name]);
      return Promise.resolve({ id: "workspace-generated", kind: "created" });
    },
    list: () => Promise.resolve([]),
    verify: () => Promise.resolve("verified-user"),
  });
  const create = (body) =>
    app.request("http://localhost/workspaces", {
      body: JSON.stringify(body),
      headers: auth,
      method: "POST",
    });
  assert.equal((await create({ name: "  " })).status, 400);
  assert.equal((await create({ name: "Pilot", role: "owner" })).status, 400);
  assert.equal(
    (await create({ id: "workspace-other", name: "Pilot" })).status,
    400
  );
  const success = await create({ name: "  Pilot  " });
  assert.equal(success.status, 201);
  assert.deepEqual(await success.json(), {
    name: "Pilot",
    role: "owner",
    workspaceId: "workspace-generated",
  });
  assert.deepEqual(seen, [["verified-user", "Pilot"]]);
});
