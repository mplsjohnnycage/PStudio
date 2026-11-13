import assert from "node:assert/strict";
import { test } from "node:test";
import { searchMinneapolisLicense } from "../src/minneapolis-license-source.ts";

const INVALID_QUERY = /Invalid discovery query/;
const SOURCE_UNAVAILABLE = /Public source unavailable/;
const INVALID_SOURCE = /Invalid source response/;

const sourceRecord = {
  features: [
    {
      attributes: {
        address1: "701 Highway 7",
        city: "Excelsior",
        contractorDesc: "Residential Specialty",
        dbaName: "EXCELSIOR PAINT & DESIGN",
        ESRI_OID: 70,
        expirationDate: 1_701_475_199_000,
        licenseNumber: "TLIC22572",
        state: "MN",
        zip: "55331",
      },
    },
  ],
};

test("provider search uses fixed official endpoint, bounded results and provenance, never asserts a current license", async () => {
  let calledUrl;
  const mock = (url, init) => {
    calledUrl = new URL(url);
    assert.equal(init.redirect, "error");
    assert.equal(calledUrl.hostname, "services.arcgis.com");
    assert.equal(calledUrl.searchParams.get("resultRecordCount"), "5");
    assert.equal(calledUrl.searchParams.get("returnGeometry"), "false");
    assert.equal(
      calledUrl.searchParams.get("where"),
      "dbaName LIKE '%EXCELSIOR PAINT%'"
    );
    assert.ok(
      !calledUrl.searchParams.get("outFields").includes("applicantEmail")
    );
    return Promise.resolve(
      new Response(JSON.stringify(sourceRecord), {
        headers: { "content-type": "application/json" },
        status: 200,
      })
    );
  };
  const found = await searchMinneapolisLicense("EXCELSIOR PAINT", mock);
  assert.equal(found.length, 1);
  const [candidate] = found;
  assert.equal(candidate.provider, "minneapolis_residential_specialty");
  assert.equal(candidate.externalId, "TLIC22572");
  assert.equal(candidate.name, "EXCELSIOR PAINT & DESIGN");
  assert.equal(candidate.physicalAddress, "701 Highway 7, Excelsior, MN 55331");
  assert.ok(candidate.sourceUri.startsWith("https://services.arcgis.com/"));
  assert.equal(candidate.sourceUri, calledUrl.toString());
  assert.equal(candidate.sourceTitle.includes("legacy"), true);
  assert.equal(
    candidate.reportedClaims.find((c) => c.field === "licenseExpirationDate")
      .value,
    "2023-12-01"
  );
  assert.equal(
    candidate.reportedClaims.some((c) => c.field === "active"),
    false
  );
  assert.equal(
    JSON.parse(candidate.sourceExcerpt).licenseNumber,
    candidate.externalId
  );
});

test("provider rejects malformed search, non-JSON provider responses and untrusted business identifiers", async () => {
  const rejectQuery = () => {
    throw new Error("Unsafe query should not perform I/O");
  };
  await assert.rejects(
    searchMinneapolisLicense("a%' OR 1=1", rejectQuery),
    INVALID_QUERY
  );
  await assert.rejects(
    searchMinneapolisLicense(
      "PAINT",
      async () => new Response("bad", { status: 500 })
    ),
    SOURCE_UNAVAILABLE
  );
  await assert.rejects(
    searchMinneapolisLicense(
      "PAINT",
      async () => new Response("not-json", { status: 200 })
    ),
    INVALID_SOURCE
  );
  const fake = {
    features: [
      {
        attributes: {
          ...sourceRecord.features[0].attributes,
          dbaName: "Fake",
          licenseNumber: "",
        },
      },
    ],
  };
  assert.deepEqual(
    await searchMinneapolisLicense(
      "PAINT",
      async () => new Response(JSON.stringify(fake), { status: 200 })
    ),
    []
  );
});
