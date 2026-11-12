import assert from "node:assert/strict";
import { test } from "node:test";
import { createPreviewsRoutes } from "../src/previews-api.ts";

const base = "http://localhost/workspaces/ws-one";
const auth = { Authorization: "Bearer test" };
test("private preview endpoints reject missing, forged or unsupported authentication", async () => {
  let calls = 0;
  const app = createPreviewsRoutes({
    create: () => {
      calls += 1;
      return Promise.resolve({
        kind: "created",
        previewId: "preview-1",
        releaseId: "release-1",
        version: 1,
      });
    },
    read: () => {
      calls += 1;
      return Promise.resolve({
        html: "<p>Preview</p>",
        previewId: "preview-1",
        releaseId: "release-1",
        version: 1,
      });
    },
    verify: (header) =>
      Promise.resolve(header === auth.Authorization ? "verified" : null),
  });
  assert.equal(
    (await app.request(`${base}/prospects/p-one/previews`, { method: "POST" }))
      .status,
    401
  );
  assert.equal(
    (
      await app.request(`${base}/previews/preview-1`, {
        headers: { Authorization: "Bearer forged" },
      })
    ).status,
    401
  );
  assert.equal(calls, 0);
});
test("preview route respects workspace and returns private versioned HTML only to authenticated callers", async () => {
  const seen = [];
  const app = createPreviewsRoutes({
    create: (user, workspace, prospect) => {
      seen.push([user, workspace, prospect]);
      return Promise.resolve({
        kind: "created",
        previewId: "preview-1",
        releaseId: "release-1",
        version: 1,
      });
    },
    read: (user, workspace, id) => {
      seen.push([user, workspace, id]);
      return Promise.resolve({
        html: "<!doctype html><h1>Test</h1>",
        previewId: "preview-1",
        releaseId: "release-1",
        version: 1,
      });
    },
    verify: () => Promise.resolve("operator-1"),
  });
  const created = await app.request(`${base}/prospects/p-one/previews`, {
    headers: auth,
    method: "POST",
  });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).previewId, "preview-1");
  const read = await app.request(`${base}/previews/preview-1`, {
    headers: auth,
  });
  assert.equal(read.status, 200);
  assert.equal((await read.json()).html, "<!doctype html><h1>Test</h1>");
  assert.deepEqual(seen, [
    ["operator-1", "ws-one", "p-one"],
    ["operator-1", "ws-one", "preview-1"],
  ]);
});
test("previews deny unavailable and missing membership without leaking SQL", async () => {
  const app = createPreviewsRoutes({
    create: () => Promise.resolve({ kind: "not_found" }),
    read: () => Promise.resolve(null),
    verify: () => Promise.resolve("user"),
  });
  assert.equal(
    (
      await app.request(`${base}/prospects/p-one/previews`, {
        headers: auth,
        method: "POST",
      })
    ).status,
    404
  );
  assert.equal(
    (await app.request(`${base}/previews/p1`, { headers: auth })).status,
    404
  );
  const failure = createPreviewsRoutes({
    create: () => Promise.reject(new Error("secret database error")),
    read: () => Promise.reject(new Error("secret database error")),
    verify: () => Promise.resolve("user"),
  });
  const r = await failure.request(`${base}/previews/p1`, { headers: auth });
  assert.equal(r.status, 503);
  assert.equal((await r.text()).includes("secret database error"), false);
});
