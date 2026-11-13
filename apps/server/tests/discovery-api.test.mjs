import assert from "node:assert/strict";
import { test } from "node:test";
import { createDiscoveryRoutes } from "../src/discovery-api.ts";

const fixture = {
  externalId: "TLIC22572",
  name: "EXCELSIOR PAINT & DESIGN",
  physicalAddress: "701 Highway 7, Excelsior, MN 55331",
  provider: "minneapolis_residential_specialty",
  reportedClaims: [{ field: "licenseExpirationDate", value: "2023-12-01" }],
  retrievedAt: new Date("2026-11-12T19:00:00Z"),
  sourceExcerpt: '{"licenseNumber":"TLIC22572"}',
  sourceTitle: "Historic municipal license record (legacy)",
  sourceUri: "https://services.arcgis.com/example/query?f=json",
};

test("discovery rejects unauthenticated and nonmember traffic without querying provider", async () => {
  let queries = 0;
  const app = createDiscoveryRoutes({
    admit: async () => ({ kind: "created", prospectId: "prospect_test" }),
    authorize: async (user, ws) => ws === "owned" && user === "tester",
    search: () => {
      queries += 1;
      return Promise.resolve([fixture]);
    },
    verify: async (header) => (header === "Bearer yes" ? "tester" : null),
  });
  const url = "https://localhost/workspaces/owned/discover/minneapolis-license";
  assert.equal(
    (
      await app.request(url, {
        body: '{"query":"EXCELSIOR PAINT"}',
        method: "POST",
      })
    ).status,
    401
  );
  const denied = await app.request(url.replace("owned", "other"), {
    body: '{"query":"EXCELSIOR PAINT"}',
    headers: { Authorization: "Bearer yes" },
    method: "POST",
  });
  assert.equal(denied.status, 404);
  assert.equal(queries, 0);
});

test("real-source discovery admits uniquely selected license and returns provenance without claiming active license", async () => {
  const received = [];
  const app = createDiscoveryRoutes({
    admit: (user, ws, item) => {
      received.push({ item, user, ws });
      return Promise.resolve({ kind: "created", prospectId: "prospect_test" });
    },
    authorize: async () => true,
    search: (query) => {
      assert.equal(query, "EXCELSIOR PAINT");
      return Promise.resolve([fixture]);
    },
    verify: async () => "operator",
  });
  const res = await app.request(
    "https://localhost/workspaces/ws/discover/minneapolis-license",
    { body: '{"query":"EXCELSIOR PAINT"}', method: "POST" }
  );
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.prospectId, "prospect_test");
  assert.equal(body.provider, fixture.provider);
  assert.equal(body.externalId, fixture.externalId);
  assert.equal(body.recordStatus, "historical_unverified");
  assert.equal(body.sourceUri, fixture.sourceUri);
  assert.equal(received.length, 1);
  assert.equal(received[0].ws, "ws");
});

test("ambiguous discovery never silently admits a different business; malformed input and provider failures are contained", async () => {
  let admitted = 0;
  const app = createDiscoveryRoutes({
    admit: () => {
      admitted += 1;
      return Promise.resolve({ kind: "created", prospectId: "irrelevant" });
    },
    authorize: async () => true,
    search: (query) => {
      if (query === "NETWORK") {
        throw new Error("Provider internal error: private");
      }
      return Promise.resolve([
        fixture,
        { ...fixture, externalId: "TLIC99999", name: "Another business" },
      ]);
    },
    verify: async () => "operator",
  });
  const url = "https://localhost/workspaces/ws/discover/minneapolis-license";
  const send = (body) =>
    app.request(url, { body: JSON.stringify(body), method: "POST" });
  const ambiguous = await send({ query: "PAINT" });
  assert.equal(ambiguous.status, 409);
  assert.equal((await ambiguous.json()).error, "selection_required");
  assert.equal(admitted, 0);
  assert.equal((await send({ query: "a%' OR 1=1" })).status, 400);
  assert.equal((await send({ query: "NETWORK" })).status, 502);
  const selected = await send({ externalId: "TLIC22572", query: "PAINT" });
  assert.equal(selected.status, 201);
  assert.equal(admitted, 1);
  const missing = await send({ externalId: "NOT_PRESENT", query: "PAINT" });
  assert.equal(missing.status, 404);
});
