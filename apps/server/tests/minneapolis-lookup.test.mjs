import assert from "node:assert/strict";
import { test } from "node:test";
import { lookupMinneapolisLicense } from "../src/minneapolis-license-source.ts";

const INVALID_LICENSE = /Invalid license identifier/;

test("exact-source lookup fetches by validated license and rejects mismatched provider identity", async () => {
  let called = false;
  const fetcher = (rawUrl, init) => {
    called = true;
    const url = new URL(rawUrl);
    assert.equal(url.hostname, "services.arcgis.com");
    assert.equal(url.searchParams.get("where"), "licenseNumber = 'TLIC22572'");
    assert.equal(init.redirect, "error");
    return new Response(
      JSON.stringify({
        features: [
          {
            attributes: {
              address1: "701 Highway 7",
              city: "Excelsior",
              dbaName: "EXCELSIOR PAINT & DESIGN",
              licenseNumber: "TLIC22572",
              state: "MN",
              zip: "55331",
            },
          },
        ],
      }),
      { status: 200 }
    );
  };
  const result = await lookupMinneapolisLicense("TLIC22572", fetcher);
  assert.equal(called, true);
  assert.equal(result?.externalId, "TLIC22572");
  assert.equal(result?.name, "EXCELSIOR PAINT & DESIGN");
  const mismatch = await lookupMinneapolisLicense(
    "TLIC22572",
    () =>
      new Response(
        JSON.stringify({
          features: [
            {
              attributes: {
                dbaName: "DIFFERENT SOURCE",
                licenseNumber: "TLIC99999",
              },
            },
          ],
        }),
        { status: 200 }
      )
  );
  assert.equal(mismatch, null);
});

test("malformed license identifier cannot reach remote network", async () => {
  await assert.rejects(
    lookupMinneapolisLicense("a' OR 1=1", () => {
      throw new Error("must not fetch");
    }),
    INVALID_LICENSE
  );
});
